#!/usr/bin/env bash
# 将本地 electron-builder 产物部署到服务器更新目录（供 electron-updater 拉取）
# 依赖：ssh / scp 可用，且已配置到服务器的免密登录（或设置 KEY 变量）
set -euo pipefail

OUT_DIR="${OUT_DIR:-release-out}"
SERVER="${SERVER:-root@47.115.58.109}"
REMOTE_DIR="${REMOTE_DIR:-/www/wwwroot/ailabing.cn/jaygo-au/updates}"
KEY="${KEY:-}"   # 可选：ssh 私钥路径，留空则用默认 ssh 配置

EXE=$(ls -t "$OUT_DIR"/Jaygo.AU.Setup.*.exe 2>/dev/null | head -1)
BLOCKMAP=$(ls -t "$OUT_DIR"/Jaygo.AU.Setup.*.exe.blockmap 2>/dev/null | head -1)
LATEST="$OUT_DIR/latest.yml"

if [ -z "$EXE" ] || [ ! -f "$LATEST" ]; then
  echo "未找到构建产物（请先在本目录运行：npm run release）。"
  exit 1
fi

SSH_OPTS=()
if [ -n "$KEY" ]; then SSH_OPTS+=(-i "$KEY"); fi

echo "部署以下文件到 $SERVER:$REMOTE_DIR ："
echo "  $EXE"
[ -n "$BLOCKMAP" ] && echo "  $BLOCKMAP"
echo "  $LATEST"

ssh "${SSH_OPTS[@]}" "$SERVER" "mkdir -p '$REMOTE_DIR'"
scp "${SSH_OPTS[@]}" "$EXE" "$SERVER:$REMOTE_DIR/"
[ -n "$BLOCKMAP" ] && scp "${SSH_OPTS[@]}" "$BLOCKMAP" "$SERVER:$REMOTE_DIR/"
scp "${SSH_OPTS[@]}" "$LATEST" "$SERVER:$REMOTE_DIR/"

echo "部署完成。请确保服务器 nginx 已将该目录以 /jaygo-au/updates 路径对外提供（需支持 Range 请求）。"
