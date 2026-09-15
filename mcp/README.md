# Jaygo AU — Model Context Protocol (MCP) Server

> 让外部 AI Agent（Claude Desktop、Cursor、Windsurf、Cline / Roo Code、Antigravity 等）无缝调用 **Jaygo AU** 的音视频处理、智能提取、分镜规划与剪映 Pro 工程导出能力！

---

## 🌟 核心能力概览

Jaygo AU MCP Server 基于官方 `@modelcontextprotocol/sdk` 构建，遵循标准 **JSON-RPC 2.0 (stdio)** 协议，对外暴露 **6 大原子级核心工具**：

| 工具名称 | 描述说明 | 典型应用场景 |
| :--- | :--- | :--- |
| `jaygo_extract_media` | **无水印超清原画提取**：全面支持抖音、哔哩哔哩（DASH 1080P/4K）、快手、小红书（3000px 相机母带原图）及网络直链，提取真实无水印原片、文案与图片集 | Agent 获取爆款素材、爬取高清素材、分析同行文案 |
| `jaygo_download_media` | **超清流式直存与无损混流**：高速下载原画视频或提取纯原声音频。针对 DASH 分离流自动调用底层 FFmpeg 无损混音 | Agent 自动下载素材库、提取口播纯音频做声音复刻 |
| `jaygo_export_jianying` | **一键生成剪映 Pro 本地草稿**：自动将素材、配音、字幕时间轴打包生成标准的剪映 Pro 工程（`draft_content.json`），用户打开剪映软件直接成片 | Agent 完成脚本生成、配音生成后，一键交付剪映剪辑工程 |
| `jaygo_plan_illustrations` | **AI 视频分镜与提示词规划**：输入口播文案，自动按节奏切分分镜、分配景别（特写/中景/全景）并生成国潮、写实、黏土等风格的高精度中英文绘画 Prompt | Agent 自动化制作文生图分镜、小说推文推导 |
| `jaygo_detect_silence` | **FFmpeg 声学静音气口分析**：毫秒级精准分析音视频中的停顿气口与有效人声段落 | Agent 自动口播粗剪、一键气口跳剪、对齐字幕时间轴 |
| `jaygo_system_status` | **环境与能力自检**：探测系统版本、本地剪映 Pro 安装及草稿目录、FFmpeg 引擎状态及可用画风列表 | Agent 初次运行时探查宿主环境能力 |

---

## 🚀 客户端接入指南

### 1. Claude Desktop 配置

在 Claude Desktop 配置文件中添加配置：
- **Windows 路径**：`%APPDATA%\Claude\claude_desktop_config.json`
- **macOS 路径**：`~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "jaygo-au": {
      "command": "node",
      "args": [
        "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/node_modules/tsx/dist/cli.mjs",
        "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/mcp/server.ts"
      ]
    }
  }
}
```

> 💡 **提示**：也可以使用全局 `npx` 启动：
> ```json
> {
>   "mcpServers": {
>     "jaygo-au": {
>       "command": "npx",
>       "args": [
>         "-y",
>         "tsx",
>         "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/mcp/server.ts"
>       ]
>     }
>   }
> }
> ```

---

### 2. Cursor IDE 配置

在项目根目录创建或编辑 `.cursor/mcp.json`（或在 Cursor Settings -> MCP 中添加）：

```json
{
  "mcpServers": {
    "jaygo-au": {
      "command": "node",
      "args": [
        "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/node_modules/tsx/dist/cli.mjs",
        "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/mcp/server.ts"
      ]
    }
  }
}
```

---

### 3. Windsurf / Cline / Roo Code / Antigravity 配置

在相应的 MCP 设置面板中添加：
- **Server Name**: `jaygo-au`
- **Command**: `node`
- **Args**: `["D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/node_modules/tsx/dist/cli.mjs", "D:/WorkBuddy/2026-08-31-16-10-05/JaygoAU_temp/JaygoAU-源码/mcp/server.ts"]`

---

## 🛠️ 工具参数与调用规范

### 工具 1: `jaygo_extract_media`
- **功能**：提取无水印视频/图集信息。
- **入参**：
  - `url` (string, 必填)：短视频作品分享链接或包含链接的口令文本。
- **返回**：包含 `platform`, `title`, `author`, `primaryVideoUrl`, `primaryAudioUrl`, `resolutions`（多分辨率规格及体积估算）, `images`（高清母带原图）等。

### 工具 2: `jaygo_download_media`
- **功能**：下载媒体文件到磁盘，自动处理 DASH 混音。
- **入参**：
  - `url` (string, 必填)：分享链接。
  - `output_path` (string, 可选)：保存文件路径或目录（默认保存到 Downloads）。
  - `resolution_id` (string, 可选)：指定清晰度 ID（如 `bili_80`），默认选择最高清原画。
  - `type` (string, 可选)：`video`（默认）或 `audio`（提取创作者口播纯音频）。
- **返回**：`{ ok: true, savedPath: string, sizeMb: string, resolution: string }`

### 工具 3: `jaygo_export_jianying`
- **功能**：生成剪映 Pro 草稿项目，用户无需手动导入直接成片。
- **入参**：
  - `project_name` (string, 必填)：草稿工程名称。
  - `video_paths` (string[], 可选)：本地视频文件绝对路径列表。
  - `audio_path` (string, 可选)：配音音频文件绝对路径。
  - `aspect_ratio` (string, 可选)：`9:16`、`16:9`、`1:1` 等，默认 `9:16`。
  - `subtitles` (array, 可选)：台词字幕数组，每个项包含 `text`、`startMs`、`endMs`。
- **返回**：`{ ok: true, draftPath: string, projectName: string }`

### 工具 4: `jaygo_plan_illustrations`
- **功能**：根据口播文案规划视觉分镜与提示词。
- **入参**：
  - `script_text` (string, 必填)：台词文案正文。
  - `style_slug` (string, 可选)：`chinese-guochao`（国潮）、`cinematic_real`（写实）、`claymation`（黏土）、`anime_cartoon`（日漫）、`cyberpunk`（赛博朋克）、`watercolor_book`（绘本）。
  - `aspect_ratio` (string, 可选)：`9:16`、`16:9`、`1:1`。
- **返回**：分镜列表，含单镜头景别、时长估算、中英文画图提示词。

### 工具 5: `jaygo_detect_silence`
- **功能**：基于 FFmpeg 声学算法分析气口与语音段。
- **入参**：
  - `file_path` (string, 必填)：音频或视频文件绝对路径。
  - `threshold_db` (number, 可选)：判定阈值，默认 `-35` dB。
  - `min_silence_ms` (number, 可选)：最小静音毫秒数，默认 `500` ms。
- **返回**：`silenceSegments`（静音段列表）与 `speechSegments`（人声有效段列表）。

### 工具 6: `jaygo_system_status`
- **功能**：自检运行环境。
- **入参**：无需参数。
- **返回**：系统平台、剪映 Pro 安装与草稿路径、FFmpeg 引擎状态等。

---

## 🔒 安全规范

- **零密钥依赖**：Jaygo AU MCP Server 运行于本地机器，无需配置任何第三方商业平台密匙或密码即可直接使用核心能力。
- **严禁硬编码敏感凭证**：请勿在提交或分享此工程时写入个人 API Key、密码或私有凭据。
