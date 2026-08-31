# Jaygo AU · 火山引擎声音复刻工作台

一个桌面端应用，用于**可视化上传音频 → 复刻专属音色 → 选择音色 → 输入文本合成语音**。全部云端能力基于火山引擎「豆包语音」声音复刻 / 语音合成 API，用户只需在设置中填入 API Key 即可使用。界面采用 **简洁风格**（类似 Notion/Linear 的白底细边框设计）。

> **跨平台说明**：当前仅提供 Windows 安装包，但项目基于 Electron 构建，理论上支持 macOS 和 Linux。如需其他平台版本，可自行修改 `package.json` 中的构建配置并执行 `npm run dist`。

## ✨ 功能

- **设置**：填入 `X-Api-Key`（本机 `safeStorage` 加密存储，不进前端代码 / DevTools）；配置默认合成参数与输出目录。
- **声音复刻**：拖拽或选择音频（wav/mp3/m4a/ogg/aac/pcm，≤10MB），试听上传音频，一键提交训练，自动生成合规 `custom_speaker_id`。
- **我的音色**：查看已训练音色、查询训练状态、删除，或手动添加官方精品音色 ID 用于合成。
- **语音合成**：选音色 + 输入文本 + 调参（格式 / 采样率 / 语速 / 音量 / 情感），流式生成，实时进度条。
- **音频库**：本次会话内合成结果集中管理，支持**在线试听**与**另存为下载**。

## 🧱 架构

```
┌──────────────────────────────────────────────────────────┐
│  Renderer (React + Vite + Tailwind)  —  纯展示与交互         │
│  简洁 UI / Zustand 状态 / 不持有任何密钥            │
└───────────────┬──────────────────────────────────────────┘
                │ window.JaygoAPI (contextBridge, 仅方法)
┌───────────────▼──────────────────────────────────────────┐
│  Main (Electron, Node.js)  —  安全与网络核心                 │
│  • safeStorage 加密保存 API Key                              │
│  • IPC handlers：复刻 / 查询 / 合成(NDJSON 流式) / 文件读写   │
│  • 所有 HTTPS 请求在此发起（天然绕过浏览器 CORS）             │
└───────────────┬──────────────────────────────────────────┘
                │ HTTPS (X-Api-Key)
┌───────────────▼──────────────────────────────────────────┐
│  火山引擎 openspeech.bytedance.com                           │
│  /api/v3/tts/voice_clone  ·  /get_voice  ·  /unidirectional  │
└──────────────────────────────────────────────────────────┘
```

**为什么用 Electron 而非 Tauri**：两者都能胜任，Electron 仅依赖 Node（本机已具备），构建/验证链路更顺，分发为安装包也简单；密钥放在主进程 + `safeStorage`，前端完全不接触明文 Key，安全性满足个人工具需求。若追求更小体积，可后续迁移到 Tauri（网络层逻辑可平移到 Rust）。

## 🚀 运行

```bash
npm install          # 安装依赖（会下载 Electron 运行时）
npm run dev          # 开发模式：Vite + Electron 窗口
```

构建可分发包：

```bash
npm run dist         # 产出 Windows NSIS 安装包（out/ 目录）
```

> 渲染层校验：`npm run build`（Vite 打包 + 主进程 tsc 类型检查）。

## 🔑 获取 API Key

1. 登录火山引擎控制台 → 「API Key 管理」创建 Key（新版控制台，仅一个 `X-Api-Key`）。
   - 注册地址：https://console.volcengine.com/speech/new/overview?projectName=default
2. 确保已开通「豆包语音 - 声音复刻」与「语音合成」相关服务并购买资源包。
3. 在 Jaygo AU「设置」中粘贴保存。
4. **官方音色资源版本**：设置里「官方音色资源 ID」默认 `seed-tts-2.0`（豆包语音合成 2.0）。若你的账号只开通了 1.0，请切回 `seed-tts-1.0`，否则官方音色试听 / 合成会返回 403（资源未授权）。uranus 系 2.0 高表现力音色固定走 2.0，不受此选项影响。

## 📌 使用流程

1. 设置 → 填入 API Key。
2. 声音复刻 → 上传约 10–25s 清晰人声 → 开始复刻。
3. 我的音色 → 等待状态变为「可用 / 训练成功」（可点查询状态刷新）。
4. 语音合成 → 选音色、输入文本 → 开始合成 → 试听 / 下载。

## ⚠️ 计费提示

声音复刻为后付费音色：**首次调用合成接口即视为「转正」并收取音色槽位费**。请在复刻完成、试听满意后再正式合成。

## 📁 目录结构

```
JaygoAU/
├─ package.json
├─ vite.config.ts
├─ tsconfig.json / tsconfig.electron.json
├─ tailwind.config.js / postcss.config.js
├─ index.html
├─ electron/
│  ├─ main.ts        # 主进程：安全存储 + API 代理 + 文件
│  └─ preload.ts     # contextBridge 暴露 window.JaygoAPI
└─ src/
   ├─ main.tsx / App.tsx / index.css / store.ts / types.ts
   ├─ lib/{ipc,format}.ts
   └─ components/{Settings,Clone,Voices,Synthesize,Library,AudioPlayer}.tsx
```

## 已实现的增强

- **音频库持久化**：合成记录写入设置文件，并在启动时扫描输出目录自动合并历史音频，跨会话不丢失。
- **复刻状态自动轮询**：列表中存在「训练中」音色时每 4 秒自动查询，无需手动刷新。
- **默认使用声音复刻 2.0 模型**：合成请求固定 `X-Api-Resource-Id: seed-icl-2.0` + `model: seed-tts-2.0-expressive`。
- **情感枚举联想**：情感参数提供常用枚举（happy / angry / sad …）下拉联想，同时保留自由输入。
