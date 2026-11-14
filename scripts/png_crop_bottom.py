#!/usr/bin/env python3
"""png_crop_bottom.py <file.png> <keep_rows> — keep the top <keep_rows> rows of a PNG in place (stdlib only).

D58 (REVIEW cloud_13): the store shots drop the system navigation area under the app (the tablet's taskbar / dock, the phone's
gesture handle). Cutting rows at the BOTTOM needs no re-filtering: every kept row references only rows above it.
Handles the non-interlaced 8-bit RGB / RGBA files `adb exec-out screencap -p` writes; anything else is left untouched (exit 2).
"""
import struct
import sys
import zlib


def chunks(data: bytes):
    i = 8
    while i < len(data):
        n = struct.unpack('>I', data[i:i + 4])[0]
        yield data[i + 4:i + 8], data[i + 8:i + 8 + n]
        i += 12 + n


def chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)


def main(path: str, keep: int) -> int:
    data = open(path, 'rb').read()
    parts = list(chunks(data))
    ihdr = next(b for k, b in parts if k == b'IHDR')
    w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', ihdr)
    bpp = {2: 3, 6: 4}.get(ctype)
    if depth != 8 or bpp is None or interlace or not 0 < keep <= h:
        print(f'{path}: not cropped (w={w} h={h} depth={depth} type={ctype} interlace={interlace} keep={keep})')
        return 2
    raw = zlib.decompress(b''.join(b for k, b in parts if k == b'IDAT'))
    raw = raw[:keep * (1 + w * bpp)]
    out = data[:8] + chunk(b'IHDR', struct.pack('>IIBBBBB', w, keep, depth, ctype, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(out)
    print(f'{path}: {w}x{h} -> {w}x{keep}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1], int(sys.argv[2])))
