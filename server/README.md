# Jaygo AU 服务端后端

为「视音频转录」提供安全的 OSS 临时凭证，并为「在线更新」托管更新文件。
**本目录只在你的服务器上运行，绝不进入客户端安装包。**

## 它解决什么

- 转录功能需要把音视频上传到阿里云 OSS 生成 URL 给火山引擎拉取。
- 若把 OSS AK/SK 写进客户端，等于把密匙发给每个用户——绝不可取。
- 本服务用**服务端保管的真实 AK/SK** 签发「单次 / 短时 / 限单个对象」的预签名 URL，
  客户端只拿这个临时 URL 上传，永远接触不到长期密匙。
- 同时以静态目录托管 `latest.yml` / 安装包 / blockmap，供客户端 electron-updater 拉取更新。

## 1. 安装与运行

```bash
cd server
npm i            # 仅安装 ali-oss（也可复用项目根 node_modules，从根目录运行）
cp .env.example .env
# 编辑 .env，填入真实 OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / UPDATE_DIR
node jaygo-au-backend.mjs
```

生产环境建议用进程守护（任选其一）：

```bash
# pm2
npm i -g pm2 && pm2 start jaygo-au-backend.mjs --name jaygo-au

# 或 systemd（/etc/systemd/system/jaygo-au.service）启动 jaygo-au-backend.mjs
```

环境变量见 `.env.example`：

| 变量 | 说明 |
| --- | --- |
| `PORT` | 监听端口（默认 8787） |
| `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 阿里云 OSS（真实密匙，仅服务端） |
| `APP_TOKEN` | 可选：与客户端 `electron/main.ts` 的 `APP_CONFIG.appToken` 一致，过滤随机扫描（非保密） |
| `UPDATE_DIR` | 更新文件目录（electron-builder 产物放这里） |
| `OSS_PUT_EXPIRES` / `OSS_GET_EXPIRES` | 预签名有效期（秒，默认 300 / 3600） |

## 2. nginx 反代与静态托管

把 `/api/jaygo-au/` 反代到本服务，`/jaygo-au/updates/` 直接静态托管（**需支持 Range 请求**，nginx 默认支持）：

```nginx
server {
  listen 443 ssl;
  server_name ailabing.cn;

  # 更新文件静态托管（latest.yml / exe / blockmap）
  location /jaygo-au/updates/ {
    alias /www/wwwroot/ailabing.cn/jaygo-au/updates/;
    autoindex off;
    add_header Cache-Control "no-cache";
  }

  # OSS 临时凭证接口（反代到 node 服务）
  location /api/jaygo-au/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # 凭证接口允许跨域（Electron 渲染进程从 file:// 调用）
    add_header Access-Control-Allow-Origin "*" always;
    add_header Access-Control-Allow-Headers "Content-Type, x-app-token" always;
    if ($request_method = OPTIONS) { return 204; }
  }
}
```

> 客户端 `electron/main.ts` 里的 `APP_CONFIG.ossTokenEndpoint` / `ossDeleteEndpoint` / `updateFeedUrl`
> 默认指向 `https://ailabing.cn/api/jaygo-au/...` 与 `https://ailabing.cn/jaygo-au/updates`。
> 若改用其他域名，只改 `APP_CONFIG` 三处即可。

## 3. 阿里云 OSS Bucket CORS

客户端用预签名 URL 直接向 OSS 发 `PUT`。需在 OSS 控制台给 Bucket 配置跨域规则：

- 来源：`*`
- 允许 Methods：`PUT`、`GET`、`POST`、`DELETE`、`HEAD`
- 允许 Headers：`*`
- 暴露 Headers：可留空

（GET 预签名 URL 由火山引擎服务端拉取，不受此 CORS 限制。）

## 4. 发布新版本（在线更新）

```bash
# 在源码根目录：构建安装包 + latest.yml + blockmap 到 out/
npm run release

# 部署到服务器更新目录（scp，需已配置到服务器的免密 ssh）
npm run deploy:update
```

`deploy-update.sh` 会复制 `out/Jaygo.AU.Setup.*.exe`、`*.blockmap`、`latest.yml` 到服务器
`UPDATE_DIR`（默认 `/www/wwwroot/ailabing.cn/jaygo-au/updates`）。
客户端下次「检查更新」即可看到新版本，下载后点「重启并更新」自动静默安装并重开。

## 5. 安全小结

- 真实 OSS AK/SK 仅存在于服务器 `.env`，**不进 git、不进客户端包**。
- 预签名 URL 绑定随机 key、限单次 PUT/GET、短时有效；转录任务结束服务端立即删除对象。
- 更新完整性由下载文件 SHA512 与 `latest.yml` 比对保证（HTTPS 传输），无需代码签名证书。
- `APP_TOKEN` 仅作为轻量门槛过滤随机扫描，不可替代以上措施。
