// Jaygo AU 服务端后端（部署在阿里云 ECS，绝不进客户端安装包）
// 职责（转录音频的「服务端托管」方案，替代阿里云 OSS）：
//   1) POST /api/jaygo-au/oss-token   发放一次性上传/下载票据（返回 putUrl / getUrl / key）
//   2) PUT  /api/jaygo-au/upload/<key>?token=<t>   客户端把音频 PUT 到服务器本地临时目录
//   3) GET  /api/jaygo-au/file/<key>?token=<t>      火山 ASR 拉取音频（公开可拉取，token 限时）
//   4) POST /api/jaygo-au/oss-delete                任务结束后删除临时文件
//   5) GET  /api/jaygo-au/health                    健康检查
//
// 安全要点：
//   - 全程 HTTPS；音频落到服务器本地目录，客户端永远拿不到任何长期密匙。
//   - 票据 = 随机 token，绑定随机 key，限时有效（TOKEN_TTL）；文件超期自动清理（FILE_TTL）。
//   - 上传体积上限 MAX_UPLOAD_BYTES，防滥用。
//   - 真实密匙（若有 APP_TOKEN）只在本服务端 .env，绝不进代码/安装包。
//
// 依赖：无（仅 Node 内置模块）。运行：node server/jaygo-au-backend.mjs

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 轻量 .env 加载（无第三方依赖）：仅填充尚未设置的变量，方便部署时直接放一个 .env
try {
  const envPath = path.join(__dirname, '.env');
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const k = m[1];
    const v = m[2].replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
} catch { /* 无 .env 则使用系统环境变量 */ }

// ---------- 配置（全部来自环境变量，无密匙则不进代码） ----------
const CFG = {
  port: Number(process.env.PORT || 8787),
  appToken: process.env.APP_TOKEN || '',                 // 可选：与客户端 APP_CONFIG.appToken 一致，过滤随机扫描（非保密）
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'https://ailabing.cn').replace(/\/$/, ''),
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, 'uploads-data'),
  tokenTtl: Number(process.env.TOKEN_TTL || 3600),       // token 有效期（秒）
  fileTtl: Number(process.env.FILE_TTL || 7200),         // 文件超期自动清理（秒）
  maxBytes: Number(process.env.MAX_UPLOAD_BYTES || 200 * 1024 * 1024), // 单文件上限 200MB
};

fsp.mkdir(CFG.uploadDir, { recursive: true }).catch((e) => {
  console.error('[jaygo-au-backend] 无法创建上传目录', CFG.uploadDir, e?.message);
  process.exit(1);
});

// key -> { token, expiresAt, contentType }
const tickets = new Map();

// 周期性清理：过期票据 + 超期文件
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.expiresAt < now) tickets.delete(k);
  fsp.readdir(CFG.uploadDir).then((files) => {
    for (const f of files) {
      const fp = path.join(CFG.uploadDir, f);
      fsp.stat(fp).then((st) => {
        if (now - st.mtimeMs > CFG.fileTtl * 1000) fsp.unlink(fp).catch(() => {});
      }).catch(() => {});
    }
  }).catch(() => {});
}, 5 * 60 * 1000).unref?.();

// ---------- 工具 ----------
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-app-token',
  });
  res.end(body);
}

function readerToBuffer(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('文件超过大小上限')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new Error('body too large')); return; } chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function checkAppToken(req) {
  if (!CFG.appToken) return true;
  return (req.headers['x-app-token'] || '').toString() === CFG.appToken;
}

function sniffContentType(buf) {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.length >= 3 && buf[0] === 0xff && (buf[1] === 0xfb || buf[1] === 0xf3 || buf[1] === 0xf2)) return 'audio/mpeg';
  if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  return 'application/octet-stream';
}

function keyFromPath(pathname, prefix) {
  const k = pathname.slice(prefix.length).replace(/^\/+/, '').replace(/\/+$/, '');
  return k && !k.includes('/') && !k.includes('..') ? k : '';
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;
    const q = u.searchParams;

    // 票据发放
    if (p === '/api/jaygo-au/oss-token' && req.method === 'POST') {
      if (!checkAppToken(req)) return sendJson(res, 403, { error: 'forbidden' });
      const key = randomUUID();
      const token = randomUUID();
      tickets.set(key, { token, expiresAt: Date.now() + CFG.tokenTtl * 1000, contentType: 'application/octet-stream' });
      return sendJson(res, 200, {
        putUrl: `${CFG.publicBaseUrl}/api/jaygo-au/upload/${key}?token=${token}`,
        getUrl: `${CFG.publicBaseUrl}/api/jaygo-au/file/${key}?token=${token}`,
        key,
        expiresIn: CFG.tokenTtl,
      });
    }

    // 上传（PUT，原始音频字节）
    if (p.startsWith('/api/jaygo-au/upload/') && req.method === 'PUT') {
      const key = keyFromPath(p, '/api/jaygo-au/upload/');
      const token = q.get('token') || '';
      const t = tickets.get(key);
      if (!key || !t || t.token !== token) return sendJson(res, 403, { error: 'forbidden' });
      if (t.expiresAt < Date.now()) { tickets.delete(key); return sendJson(res, 403, { error: 'token expired' }); }
      let buf;
      try { buf = await readerToBuffer(req, CFG.maxBytes); }
      catch (e) { return sendJson(res, 413, { error: e.message }); }
      if (!buf.length) return sendJson(res, 400, { error: 'empty body' });
      const fp = path.join(CFG.uploadDir, key);
      await fsp.writeFile(fp, buf);
      t.contentType = sniffContentType(buf);
      t.uploaded = true;
      return sendJson(res, 200, { ok: true, size: buf.length });
    }

    // 下载（GET，供火山 ASR 拉取）
    if (p.startsWith('/api/jaygo-au/file/') && req.method === 'GET') {
      const key = keyFromPath(p, '/api/jaygo-au/file/');
      const token = q.get('token') || '';
      const t = tickets.get(key);
      if (!key || !t || t.token !== token) { res.writeHead(403); res.end('forbidden'); return; }
      if (t.expiresAt < Date.now()) { res.writeHead(403); res.end('token expired'); return; }
      const fp = path.join(CFG.uploadDir, key);
      let stat;
      try { stat = await fsp.stat(fp); } catch { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, {
        'Content-Type': t.contentType || 'application/octet-stream',
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(fp).pipe(res);
      return;
    }

    // 删除
    if (p === '/api/jaygo-au/oss-delete' && req.method === 'POST') {
      if (!checkAppToken(req)) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readJsonBody(req);
      const key = String(body.key || '');
      if (!key || key.includes('/') || key.includes('..')) return sendJson(res, 400, { error: 'invalid key' });
      const fp = path.join(CFG.uploadDir, key);
      await fsp.unlink(fp).catch(() => {});
      tickets.delete(key);
      return sendJson(res, 200, { ok: true });
    }

    // 健康检查
    if (p === '/api/jaygo-au/health') {
      return sendJson(res, 200, { ok: true, storage: 'local', uploadDir: CFG.uploadDir });
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (e) {
    console.error('[jaygo-au-backend] error:', e?.stack || e);
    if (!res.headersSent) sendJson(res, 500, { error: e?.message || 'internal' });
    else res.end();
  }
});

server.listen(CFG.port, () => {
  console.log(`[jaygo-au-backend] listening on :${CFG.port}`);
  console.log(`  storage          : local (ECS disk)`);
  console.log(`  upload dir       : ${CFG.uploadDir}`);
  console.log(`  public base      : ${CFG.publicBaseUrl}`);
  console.log(`  token TTL        : ${CFG.tokenTtl}s  file TTL ${CFG.fileTtl}s  max ${Math.round(CFG.maxBytes / 1048576)}MB`);
  console.log(`  appToken guard   : ${CFG.appToken ? 'on' : 'off'}`);
  console.log(`  token endpoint   : POST ${CFG.publicBaseUrl}/api/jaygo-au/oss-token`);
  console.log(`  delete endpoint  : POST ${CFG.publicBaseUrl}/api/jaygo-au/oss-delete`);
});
