// Jaygo AU 服务端后端（部署在阿里云服务器，绝不进客户端安装包）
// 职责：
//   1) POST /api/jaygo-au/oss-token   签发「单次 / 短时 / 限单个对象」的 OSS 预签名 URL
//   2) POST /api/jaygo-au/oss-delete  任务结束后删除临时对象
//   3) GET  /jaygo-au/updates/*        静态托管 electron-updater 更新文件（latest.yml / exe / blockmap）
//
// 安全要点：
//   - 真实阿里云 OSS AK/SK 只在本服务端环境变量里，客户端永远拿不到长期密匙。
//   - 预签名 URL 绑定随机对象 key、限单次 PUT/GET、短时有效（PUT 5 分钟 / GET 1 小时）。
//   - 可选 APP_TOKEN：客户端请求需带 x-app-token 头，过滤随机扫描（非保密）。
//
// 依赖：ali-oss（复用项目根 node_modules，或 server 目录单独 npm i）
// 运行：node server/jaygo-au-backend.mjs   （从项目根目录运行以解析依赖）

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import OSS from 'ali-oss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 配置（全部来自环境变量，密匙绝不入代码 / 不入包） ----------
const CFG = {
  port: Number(process.env.PORT || 8787),
  ossRegion: process.env.OSS_REGION || '',
  ossBucket: process.env.OSS_BUCKET || '',
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  appToken: process.env.APP_TOKEN || '', // 可选：与客户端 APP_CONFIG.appToken 一致
  updateDir: process.env.UPDATE_DIR || path.resolve(__dirname, 'updates'), // 更新文件目录
  putExpires: Number(process.env.OSS_PUT_EXPIRES || 300),   // 上传预签名有效期（秒）
  getExpires: Number(process.env.OSS_GET_EXPIRES || 3600),  // 火山拉取预签名有效期（秒）
};

function fail(msg) {
  console.error('[jaygo-au-backend] ' + msg);
  process.exit(1);
}
if (!CFG.ossBucket || !CFG.ossAccessKeyId || !CFG.ossAccessKeySecret) {
  fail('缺少 OSS 环境变量：OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET 必须设置');
}

const oss = new OSS({
  region: CFG.ossRegion,
  accessKeyId: CFG.ossAccessKeyId,
  accessKeySecret: CFG.ossAccessKeySecret,
  bucket: CFG.ossBucket,
});

// ---------- 工具 ----------
function sendJson(res, status, obj, cors = true) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...(cors ? { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, x-app-token' } : {}),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 1e6) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

function checkAppToken(req) {
  if (!CFG.appToken) return true; // 未启用则放行
  const h = (req.headers['x-app-token'] || '').toString();
  return h === CFG.appToken;
}

// ---------- 静态文件服务（支持 Range，供 electron-updater 增量下载） ----------
const MIME = {
  '.yml': 'text/yaml; charset=utf-8',
  '.exe': 'application/octet-stream',
  '.blockmap': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, urlPath) {
  // urlPath 形如 /jaygo-au/updates/latest.yml
  const rel = urlPath.replace(/^\/jaygo-au\/updates\/?/, '');
  if (!rel || rel.includes('..')) { res.writeHead(404); res.end('not found'); return; }
  const filePath = path.join(CFG.updateDir, rel);
  if (!filePath.startsWith(CFG.updateDir)) { res.writeHead(403); res.end('forbidden'); return; }
  let stat;
  try { stat = await fsp.stat(filePath); } catch { res.writeHead(404); res.end('not found'); return; }
  if (!stat.isFile()) { res.writeHead(404); res.end('not found'); return; }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const range = req.headers['range'];
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range.toString());
    if (m) {
      const start = Number(m[1]);
      const end = m[2] ? Number(m[2]) : stat.size - 1;
      if (start <= end && end < stat.size) {
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
  }
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(filePath).pipe(res);
}

// ---------- 请求路由 ----------
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const p = u.pathname;

    // 预签名 URL 发放
    if (p === '/api/jaygo-au/oss-token' && req.method === 'POST') {
      if (!checkAppToken(req)) return sendJson(res, 403, { error: 'forbidden' });
      const key = `jaygo-au/${Date.now()}-${randomUUID()}`;
      const [putUrl, getUrl] = await Promise.all([
        oss.signatureUrl(key, { method: 'PUT', expires: CFG.putExpires }),
        oss.signatureUrl(key, { method: 'GET', expires: CFG.getExpires }),
      ]);
      return sendJson(res, 200, { putUrl, getUrl, key, expiresIn: CFG.putExpires });
    }

    // 删除临时对象
    if (p === '/api/jaygo-au/oss-delete' && req.method === 'POST') {
      if (!checkAppToken(req)) return sendJson(res, 403, { error: 'forbidden' });
      const body = await readBody(req);
      if (!body.key || !String(body.key).startsWith('jaygo-au/')) {
        return sendJson(res, 400, { error: 'invalid key' });
      }
      try { await oss.delete(String(body.key)); } catch (e) { /* 忽略删除失败 */ }
      return sendJson(res, 200, { ok: true });
    }

    // 健康检查
    if (p === '/api/jaygo-au/health') {
      return sendJson(res, 200, { ok: true, bucket: CFG.ossBucket });
    }

    // 更新文件静态托管
    if (p.startsWith('/jaygo-au/updates')) {
      return await serveStatic(req, res, p);
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
  console.log(`  OSS bucket        : ${CFG.ossBucket} (region ${CFG.ossRegion || 'default'})`);
  console.log(`  updates served    : ${CFG.updateDir}`);
  console.log(`  appToken guard    : ${CFG.appToken ? 'on' : 'off'}`);
  console.log(`  token endpoint     : POST /api/jaygo-au/oss-token`);
  console.log(`  delete endpoint    : POST /api/jaygo-au/oss-delete`);
  console.log(`  update feed        : /jaygo-au/updates/`);
});
