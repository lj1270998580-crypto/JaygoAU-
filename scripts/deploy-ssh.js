/**
 * Jaygo AU 部署脚本（密码方式，复用 ssh2，与 ailabing 上传脚本同源）
 * 用法:
 *   SSH_PASS='<服务器root密码>' node scripts/deploy-ssh.js
 * 说明:
 *   - 密码只从环境变量读取，绝不写入本文件 / 不入库
 *   - 部署更新源（latest.yml + exe + blockmap）到 /jaygo-au/updates
 *   - 部署后端代码（server/）到 /jaygo-au/server 供 pm2 启动
 */
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SSH = {
  host: process.env.SSH_HOST || '47.115.58.109',
  port: Number(process.env.SSH_PORT || 22),
  username: process.env.SSH_USER || 'root',
  password: process.env.SSH_PASS,
  readyTimeout: 20000,
};
const REMOTE = process.env.REMOTE_ROOT || '/www/wwwroot/ailabing.cn/jaygo-au';

if (!SSH.password) {
  console.error('缺少环境变量 SSH_PASS（服务器 root 密码）');
  process.exit(1);
}

// [本地相对路径, 远程相对路径]
const FILES = [
  ['release-out/latest.yml', 'updates/latest.yml'],
  ['release-out/Jaygo.AU.Setup.0.2.0.exe', 'updates/Jaygo.AU.Setup.0.2.0.exe'],
  ['release-out/Jaygo.AU.Setup.0.2.0.exe.blockmap', 'updates/Jaygo.AU.Setup.0.2.0.exe.blockmap'],
  ['server/jaygo-au-backend.mjs', 'server/jaygo-au-backend.mjs'],
  ['server/.env.example', 'server/.env.example'],
  ['server/README.md', 'server/README.md'],
  ['server/nginx-jaygo-au.conf', 'nginx-jaygo-au.conf'],
];

function mkdirRemote(conn, dir) {
  return new Promise((resolve) => {
    conn.exec(`mkdir -p ${dir}`, (err, stream) => {
      if (err) return resolve();
      stream.on('close', resolve);
      stream.stderr.on('data', () => {});
    });
  });
}

function putFile(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, {}, (err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  const conn = new Client();
  conn.on('ready', async () => {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))));
    let ok = 0, fail = 0;
    for (const [localRel, remoteRel] of FILES) {
      const local = path.join(ROOT, localRel);
      const remote = `${REMOTE}/${remoteRel}`;
      if (!fs.existsSync(local)) { console.error('本地缺失:', localRel); fail++; continue; }
      try {
        await mkdirRemote(conn, path.dirname(remote));
        await putFile(sftp, local, remote);
        console.log('OK  ', remoteRel);
        ok++;
      } catch (e) {
        console.error('FAIL', remoteRel, '-', e.message);
        fail++;
      }
    }
    console.log(`\n完成: 成功 ${ok}，失败 ${fail}`);
    conn.end();
    process.exit(fail ? 1 : 0);
  });
  conn.on('error', (e) => { console.error('SSH 连接失败:', e.message); process.exit(1); });
  conn.connect(SSH);
}

main();
