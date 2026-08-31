#!/usr/bin/env python3
"""将源 PNG 四角白色背景转为透明，并生成真正的多尺寸 ICO（PNG 编码）。

思路：
1. 把近白色像素标记为“背景候选”。
2. 从图像四边界开始 BFS，找到所有与边界连通的背景候选，这些就是外部白色四角 -> 透明。
3. 未访问到的白色像素属于图标内部（如白色 J 笔画）-> 保留。
4. 紫色主体、阴影等非白色像素 -> 保留。
"""
import io
import struct
import sys
from collections import deque
from pathlib import Path
from PIL import Image

SRC = Path(r'D:\Workbuddy工作\JaygoAU\build-src\Modern_minimalist_app_icon_for_2026-08-30T05-36-32.png')
DST_PNG = Path(r'D:\Workbuddy工作\JaygoAU\build-src\icon-transparent.png')
DST_ICO = Path(r'D:\Workbuddy工作\JaygoAU\build\icon.ico')
SIZES = [16, 32, 48, 64, 128, 256]


def make_transparent(img: Image.Image, threshold: int = 70) -> Image.Image:
    """把与边界连通的白色背景转为透明，保留图标本体。"""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()

    # bg[y][x] = 1 表示该像素是背景候选（白色/近白）
    bg = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b, _ = px[x, y]
            dist = max(abs(r - 255), abs(g - 255), abs(b - 255))
            if dist < threshold:
                bg[base + x] = 1

    visited = bytearray(w * h)
    q = deque()

    def idx(x, y):
        return y * w + x

    # 边界入队
    for x in range(w):
        if bg[idx(x, 0)] and not visited[idx(x, 0)]:
            visited[idx(x, 0)] = 1
            q.append((x, 0))
        if bg[idx(x, h - 1)] and not visited[idx(x, h - 1)]:
            visited[idx(x, h - 1)] = 1
            q.append((x, h - 1))
    for y in range(h):
        if bg[idx(0, y)] and not visited[idx(0, y)]:
            visited[idx(0, y)] = 1
            q.append((0, y))
        if bg[idx(w - 1, y)] and not visited[idx(w - 1, y)]:
            visited[idx(w - 1, y)] = 1
            q.append((w - 1, y))

    # BFS 标记所有与边界连通的外部背景
    while q:
        x, y = q.popleft()
        if x > 0:
            i = idx(x - 1, y)
            if bg[i] and not visited[i]:
                visited[i] = 1
                q.append((x - 1, y))
        if x < w - 1:
            i = idx(x + 1, y)
            if bg[i] and not visited[i]:
                visited[i] = 1
                q.append((x + 1, y))
        if y > 0:
            i = idx(x, y - 1)
            if bg[i] and not visited[i]:
                visited[i] = 1
                q.append((x, y - 1))
        if y < h - 1:
            i = idx(x, y + 1)
            if bg[i] and not visited[i]:
                visited[i] = 1
                q.append((x, y + 1))

    # 应用 alpha：外部背景透明，其余保留
    for y in range(h):
        base = y * w
        for x in range(w):
            if bg[base + x] and visited[base + x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)

    return img


def build_ico(images: list[Image.Image], sizes: list[int]) -> bytes:
    """把 PIL 图像列表打包成包含 PNG 编码数据的 ICO 文件。"""
    count = len(images)
    data = bytearray(struct.pack('<HHH', 0, 1, count))

    png_blobs = []
    offset = 6 + 16 * count

    for img, size in zip(images, sizes):
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        blob = buf.getvalue()
        png_blobs.append(blob)

        w_byte = 0 if size >= 256 else size
        h_byte = 0 if size >= 256 else size
        data.extend(struct.pack('<BBBBHHII', w_byte, h_byte, 0, 0, 1, 32, len(blob), offset))
        offset += len(blob)

    for blob in png_blobs:
        data.extend(blob)

    return bytes(data)


def main():
    if not SRC.exists():
        print(f'源文件不存在: {SRC}')
        sys.exit(1)

    img = Image.open(SRC)
    print(f'源图尺寸: {img.size}')

    transparent = make_transparent(img)
    transparent.save(DST_PNG)
    print(f'透明 PNG 已保存: {DST_PNG}')

    images = [transparent.resize((s, s), Image.LANCZOS) for s in SIZES]

    ico_data = build_ico(images, SIZES)
    DST_ICO.write_bytes(ico_data)
    print(f'ICO 已保存: {DST_ICO} ({len(ico_data)} bytes)')


if __name__ == '__main__':
    main()
