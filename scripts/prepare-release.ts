import fs from 'fs';
import path from 'path';
import { CHANGELOGS } from '../src/data/changelogs';

const ROOT = path.resolve(__dirname, '..');
const buildDir = path.join(ROOT, 'release-pkg');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// 1. 生成最新更新日志 JSON
const changelogJsonPath = path.join(buildDir, 'latest-changelog.json');
fs.writeFileSync(changelogJsonPath, JSON.stringify(CHANGELOGS.slice(0, 20), null, 2), 'utf-8');
console.log(`[Release] 已生成 ${changelogJsonPath}`);

// 2. 如果 latest.yml 存在，向其追加或注入 releaseNotes
const latestYmlPath = path.join(buildDir, 'latest.yml');
if (fs.existsSync(latestYmlPath)) {
  let content = fs.readFileSync(latestYmlPath, 'utf-8');
  const latestItem = CHANGELOGS[0];
  const notesLines = [
    `【Jaygo AU v${latestItem.version} 核心更新】`,
    `主题：${latestItem.title}`,
    '',
    '✨ 新特性：',
    ...(latestItem.features || []).slice(0, 6).map((f) => `• ${f}`),
    '',
    '⚡ 体验优化与修复：',
    ...(latestItem.improvements || []).slice(0, 3).map((i) => `• ${i}`),
    ...(latestItem.fixes || []).slice(0, 3).map((x) => `• ${x}`),
  ];
  const indentedNotes = notesLines.map((l) => `  ${l}`).join('\n');

  if (content.includes('releaseNotes:')) {
    // 替换已有 releaseNotes
    content = content.replace(/releaseNotes:[\s\S]*$/, `releaseNotes: |\n${indentedNotes}\n`);
  } else {
    content = content.trimEnd() + `\nreleaseNotes: |\n${indentedNotes}\n`;
  }
  fs.writeFileSync(latestYmlPath, content, 'utf-8');
  console.log(`[Release] 已向 ${latestYmlPath} 注入最新版本 releaseNotes 说明`);
}
