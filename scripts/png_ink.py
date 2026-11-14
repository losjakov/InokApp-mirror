#!/usr/bin/env python3
"""Prints the share (0..1) of non-white pixels of an 8-bit RGB/RGBA PNG (stdlib only — the Actions runner has no
Pillow). Used by emulator_smoke.sh to assert that a screenshot is not a blank white WebView. Exit 1 on a bad PNG."""
import struct, sys, zlib

def ink(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, w = 8, b'', 0
    while pos < len(data):
        n, typ = struct.unpack('>I4s', data[pos:pos + 8]); body = data[pos + 8:pos + 8 + n]; pos += 12 + n
        if typ == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and ctype in (2, 6), f'unsupported PNG depth/type {depth}/{ctype}'
            bpp = 3 if ctype == 2 else 4
        elif typ == b'IDAT': idat += body
    raw = zlib.decompress(idat); stride = w * bpp; prev = bytearray(stride); dark = total = 0; off = 0
    while off < len(raw):
        f = raw[off]; line = bytearray(raw[off + 1:off + 1 + stride]); off += 1 + stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0; b = prev[i]; c = prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c; pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        for i in range(0, stride, bpp):
            total += 1
            if min(line[i], line[i + 1], line[i + 2]) < 240: dark += 1
        prev = line
    return dark / max(total, 1)

if __name__ == '__main__':
    print(f'{ink(sys.argv[1]):.4f}')
