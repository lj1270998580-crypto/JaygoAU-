import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// 输出目录与 electron-builder 的 build.directories.output 保持一致（默认 out）
let outDir = 'out';
try {
  const pkg = require(path.resolve(root, 'package.json'));
  outDir = (pkg.build && pkg.build.directories && pkg.build.directories.output) || 'out';
} catch { /* 回退 out */ }

const exe = path.resolve(root, outDir, 'win-unpacked', 'Jaygo AU.exe');
const icon = path.resolve(root, 'build', 'icon.ico');
const rceditBin = path.resolve(root, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');

if (!fs.existsSync(exe)) {
  console.error('❌ exe not found:', exe);
  process.exit(1);
}
if (!fs.existsSync(icon)) {
  console.error('❌ icon not found:', icon);
  process.exit(1);
}
if (!fs.existsSync(rceditBin)) {
  console.error('❌ rcedit binary not found:', rceditBin);
  process.exit(1);
}

execFile(rceditBin, [exe, '--set-icon', icon], (err, stdout, stderr) => {
  if (err) {
    console.error('❌ rcedit failed:', err.message);
    if (stderr) console.error(stderr);
    process.exit(1);
  }
  console.log('✅ Icon applied to', exe);
  if (stdout) console.log(stdout);
});
