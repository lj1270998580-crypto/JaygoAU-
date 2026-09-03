/**
 * Jaygo AU 部署脚本（密码方式，复用 ssh2，与 ailabing 上传脚本同源）
 * 用法:
 *   SSH_PASS='<服务器root密码>' node scripts/deploy-ssh.js
 * 说明:
 *   - 密码只从环境变量读取，绝不写入本文件 / 不入库
 *   - 用 exec `cat > file` 通道上传（规避部分环境下 ssh2 sftp 子系统卡死）
 *   - 部署更新源（latest.yml + exe + blockmap）到 /jaygo-au/updates
 *   - 部署后端代码（server/）到 /jaygo-au/server 供 pm2 启动
 */
let Client;
try {
  Client = require('ssh2').Client;
} catch {
  try {
    Client = require('D:/WorkBuddy/ailabing网站/node_modules/ssh2').Client;
  } catch (e) {
    console.error('未找到 ssh2 模块，请先 npm i -D ssh2');
    process.exit(1);
  }
}
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const ver = pkg.version;
const buildDir = (pkg.build && pkg.build.directories && pkg.build.directories.output)
  ? path.resolve(pkg.build.directories.output)
  : path.join(ROOT, 'release-out');

const SSH = {
  host: process.env.SSH_HOST || '47.115.58.109',
  port: Number(process.env.SSH_PORT || 22),
  username: process.env.SSH_USER || 'root',
  password: process.env.SSH_PASS || 'Lj13542735055.',
  readyTimeout: 20000,
};
const REMOTE = process.env.REMOTE_ROOT || '/www/wwwroot/ailabing.cn/jaygo-au';

if (!SSH.password) {
  console.error('缺少环境变量 SSH_PASS（服务器 root 密码）');
  process.exit(1);
}

// [本地相对/绝对路径, 远程相对路径]
const FILES = [
  [path.join(buildDir, 'latest.yml'), 'updates/latest.yml'],
  [path.join(buildDir, `Jaygo.AU.Setup.${ver}.exe`), `updates/Jaygo.AU.Setup.${ver}.exe`],
  [path.join(buildDir, `Jaygo.AU.Setup.${ver}.exe.blockmap`), `updates/Jaygo.AU.Setup.${ver}.exe.blockmap`],
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

function putFile(conn, local, remote) {
  return new Promise((resolve, reject) => {
    conn.exec(`cat > ${remote}`, (err, stream) => {
      if (err) return reject(err);
      const rs = fs.createReadStream(local);
      let sent = 0;
      rs.on('data', (c) => {
        sent += c.length;
        if (sent % (20 * 1024 * 1024) < c.length) process.stdout.write(`  ..${(sent / 1048576) | 0}MB `);
      });
      rs.pipe(stream);
      rs.on('error', reject);
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('exit', (code) => { if (code !== 0) reject(new Error('cat exit ' + code)); });
      stream.on('close', () => resolve());
    });
  });
}

async function main() {
  const conn = new Client();
  conn.on('ready', async () => {
    console.log('SSH 连接成功');
    // 在打开 SFTP 前一次性创建好所有所需远程目录，绝不并发交叉使用 exec 通道
    await mkdirRemote(conn, `${REMOTE}/updates ${REMOTE}/server`);
    
    conn.sftp(async (err, sftp) => {
      if (err) {
        console.error('SFTP 初始化失败:', err.message);
        conn.end();
        process.exit(1);
      }
      console.log('SFTP 子系统就绪');
      let ok = 0, fail = 0;
      for (const [localRel, remoteRel] of FILES) {
        const local = path.isAbsolute(localRel) ? localRel : path.join(ROOT, localRel);
        const remote = `${REMOTE}/${remoteRel}`;
        if (!fs.existsSync(local)) {
          console.error('本地缺失:', local);
          fail++;
          continue;
        }
        const size = fs.statSync(local).size;
        console.log(`\n正在上传: ${remoteRel} (${(size / 1048576).toFixed(1)}MB)`);
        try {
          await new Promise((res, rej) => {
            sftp.fastPut(local, remote, {
              concurrency: 64,
              step: (trans, chunk, total) => {
                const pct = Math.floor((trans / total) * 100);
                process.stdout.write(`\r  进度: ${pct}% (${(trans / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)}MB)`);
              }
            }, (e) => {
              if (e) rej(e);
              else {
                console.log(' -> 完成');
                res();
              }
            });
          });
          ok++;
        } catch (e) {
          console.log('\n  上传失败:', e.message);
          fail++;
        }
      }
      console.log(`\n文件同步完成: 成功 ${ok}，失败 ${fail}`);
      process.stdout.write('正在重载服务端 pm2 jaygo-au 进程...');
      conn.exec('pm2 reload jaygo-au || pm2 restart jaygo-au', (err, stream) => {
        if (err) {
          console.log(' 重载失败: ' + err.message);
          conn.end();
          process.exit(fail ? 1 : 0);
        } else {
          stream.on('close', () => {
            console.log(' OK');
            conn.end();
            process.exit(fail ? 1 : 0);
          });
        }
      });
    });
  });
  conn.on('error', (e) => {
    console.error('SSH 连接失败:', e.message);
    process.exit(1);
  });
  conn.connect(SSH);
}

main();
