# -*- coding: utf-8 -*-
"""打包 Jaygo AU 上传包：源码 + 安装包 + 说明"""
import os
import zipfile

SRC = r'D:\Workbuddy工作\JaygoAU'
EXE = r'D:\Workbuddy工作\JaygoAU\out\Jaygo AU Setup 0.1.0.exe'
README = r'D:\Workbuddy工作\JaygoAU-上传包_说明\上传到GitHub说明.md'
OUT = r'D:\Workbuddy工作\JaygoAU-上传包.zip'

# 源码中排除的目录/文件
EXCLUDE_DIRS = {'node_modules', 'dist', 'dist-electron', 'out', '.git', '__pycache__'}
EXCLUDE_FILES = {'.DS_Store', 'Thumbs.db'}
EXCLUDE_PREFIXES = ('vite.config.ts.timestamp-',)

def should_skip(rel: str, is_dir: bool) -> bool:
    if is_dir:
        return rel in EXCLUDE_DIRS or any(rel.startswith(p) for p in EXCLUDE_PREFIXES)
    if rel in EXCLUDE_FILES:
        return True
    if any(rel.startswith(p) for p in EXCLUDE_PREFIXES):
        return True
    if rel.endswith('.log'):
        return True
    return False

def add_dir(zf: zipfile.ZipFile, root: str, arc_prefix: str):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not should_skip(os.path.relpath(os.path.join(dirpath, d), root), True)]
        for f in filenames:
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, root).replace('\\', '/')
            if should_skip(rel, False):
                continue
            arc = f'{arc_prefix}/{rel}'
            # 源码文本用 deflate，其它（图片/ico 等）也 deflate（体积小无所谓）
            zf.write(full, arc, compress_type=zipfile.ZIP_DEFLATED)

def main():
    if os.path.exists(OUT):
        os.remove(OUT)
    count = 0
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 1) 源码
        add_dir(zf, SRC, 'JaygoAU-源码')
        count += 1
        # 2) 安装包（已压缩的 exe，不再压缩以加快速度）
        zf.write(EXE, 'Jaygo AU Setup 0.1.0.exe', compress_type=zipfile.ZIP_STORED)
        count += 1
        # 3) 上传说明
        zf.write(README, '上传到GitHub说明.md', compress_type=zipfile.ZIP_DEFLATED)
        count += 1
    size = os.path.getsize(OUT)
    print(f'OK: {OUT}')
    print(f'大小: {size/1024/1024:.1f} MB')
    print(f'打包项: {count}')

if __name__ == '__main__':
    main()
