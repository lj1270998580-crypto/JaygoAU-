"""生成标准 Windows Shell Link (.lnk)，不依赖 COM / PowerShell / 管理员权限。

关键点：必须提供有效的 IDList（含各路径组件的 ItemID），
仅有 LinkInfo 的 .lnk 在部分系统上无法被 Explorer 解析（双击无反应）。
"""
import struct
import os

CLSID = bytes([0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
               0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46])

HAS_IDLIST = 0x00000001
HAS_LINKINFO = 0x00000002
HAS_NAME = 0x00000004
HAS_RELPATH = 0x00000008
HAS_WORKDIR = 0x00000010
IS_UNICODE = 0x00000080

FILE_ATTRIBUTE_DIRECTORY = 0x10
FILE_ATTRIBUTE_ARCHIVE = 0x20


def uni(s: str) -> bytes:
    """StringData 条目：字符数(2) + UTF-16LE 字符串 + 终止符。"""
    return struct.pack('<H', len(s)) + s.encode('utf-16-le') + b'\x00\x00'


def short_8dot3(name: str) -> bytes:
    """生成 8.3 短名（大写，必要时截断加 ~1）。"""
    base, ext = os.path.splitext(name)
    ext = ext[1:] if ext.startswith('.') else ext
    if len(base) > 8 or len(ext) > 3 or ' ' in base:
        base = base[:6].upper().replace(' ', '_') + '~1'
        ext = ext[:3].upper()
    return (base + ('.' + ext if ext else '')).upper().encode('ascii')


def item_id(name: str, is_file: bool) -> bytes:
    """构造文件系统 ItemID（0x31 目录 / 0x32 文件）。"""
    d = struct.pack('<B', 0x32 if is_file else 0x31)      # 类型
    d += b'\x00'                                          # reserved
    d += struct.pack('<I', FILE_ATTRIBUTE_ARCHIVE if is_file else FILE_ATTRIBUTE_DIRECTORY)
    d += b'\x00' * 2                                      # unknown
    d += b'\x00' * 8                                      # CreationTime
    d += b'\x00' * 8                                      # LastModified
    d += b'\x00' * 8                                      # LastAccess
    d += b'\x00' * 2                                      # unknown2
    d += short_8dot3(name) + b'\x00'                      # 8.3 短名
    if len(d) % 2:
        d += b'\x00'                                      # 偶对齐
    d += name.encode('utf-16-le') + b'\x00\x00'           # 长名
    if len(d) % 2:
        d += b'\x00'
    return struct.pack('<H', len(d) + 2) + d              # 前缀长度（含自身）


def id_list(path: str) -> bytes:
    """由绝对路径构造完整 IDList：驱动器项 + 各路径组件项 + 终止符。"""
    drive = path[:3]                                      # 形如 "D:\\"
    parts = [p for p in path[3:].split('\\') if p]

    body = b''
    # 驱动器 ItemID
    dd = b'\x2F' + drive.encode('ascii') + b'\x00'
    body += struct.pack('<H', len(dd) + 2) + dd

    for i, p in enumerate(parts):
        body += item_id(p, is_file=(i == len(parts) - 1))

    body += b'\x00\x00'                                   # TerminalID
    return struct.pack('<H', len(body) + 2) + body


def link_info(path: str) -> bytes:
    ansi = path.encode('ascii', 'replace') + b'\x00'
    u = path.encode('utf-16-le') + b'\x00\x00'
    suffix = b'\x00'
    suffix_u = b'\x00\x00'

    hdr = 0x24                                            # 含 Unicode 偏移的完整头
    off_ansi = hdr
    off_suffix = off_ansi + len(ansi)
    off_uni = off_suffix + len(suffix)
    off_suffix_u = off_uni + len(u)
    total = off_suffix_u + len(suffix_u)

    d = struct.pack('<I', total)
    d += struct.pack('<I', hdr)
    d += struct.pack('<I', 0x00000001)                    # VolumeIDAndLocalBasePath
    d += struct.pack('<I', 0)                             # VolumeIDOffset
    d += struct.pack('<I', off_ansi)
    d += struct.pack('<I', 0)                             # CommonNetworkRelativeLinkOffset
    d += struct.pack('<I', off_suffix)
    d += struct.pack('<I', off_uni)
    d += struct.pack('<I', off_suffix_u)
    d += ansi + suffix + u + suffix_u
    return d


def make_lnk(target: str, working_dir: str, description: str = '') -> bytes:
    flags = HAS_IDLIST | HAS_LINKINFO | HAS_NAME | HAS_RELPATH | HAS_WORKDIR | IS_UNICODE

    out = struct.pack('<I', 0x0000004C)                   # HeaderSize
    out += CLSID
    out += struct.pack('<I', flags)
    out += struct.pack('<I', FILE_ATTRIBUTE_ARCHIVE)
    out += b'\x00' * 8 * 3                                # 三个 FILETIME
    out += struct.pack('<I', 0)                           # FileSize
    out += struct.pack('<I', 0)                           # IconIndex
    out += struct.pack('<I', 1)                           # ShowCommand = 正常
    out += struct.pack('<H', 0)                           # HotKey
    out += struct.pack('<H', 0) + struct.pack('<I', 0) + struct.pack('<I', 0)

    out += id_list(target)
    out += link_info(target)
    out += uni(description)                                # NAME_STRING
    out += uni(os.path.basename(target))                   # RELATIVE_PATH
    out += uni(working_dir)                                # WORKING_DIR
    return out


if __name__ == '__main__':
    target = r'D:\JaygoAU\Jaygo AU.exe'
    workdir = r'D:\JaygoAU'
    desc = 'Jaygo AU - 火山引擎声音复刻与语音合成'

    desktop = os.path.join(os.path.expanduser('~'), 'Desktop')
    dest = os.path.join(desktop, 'Jaygo AU.lnk')

    if os.path.lexists(dest):
        os.remove(dest)
    data = make_lnk(target, workdir, desc)
    with open(dest, 'wb') as f:
        f.write(data)

    print('已创建:', dest)
    print('大小:', len(data), 'bytes')

    # 自校验：解析回来确认结构自洽
    hs = struct.unpack('<I', data[:4])[0]
    fl = struct.unpack('<I', data[20:24])[0]
    idl_size = struct.unpack('<H', data[76:78])[0]
    print('HeaderSize:', hex(hs), '(期望 0x4c)')
    print('LinkFlags :', hex(fl))
    print('IDListSize:', idl_size, '(>2 表示含有效 IDList)')
    print('目标可达  :', os.path.exists(target))
