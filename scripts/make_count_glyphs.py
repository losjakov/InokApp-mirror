#!/usr/bin/env python3
"""A-117 (1), cloud_36: THE glyphs of the cluster count, bundled - a map without the network still prints «12» / «1.2k».

The count is the only text OUR layers draw; MapLibre cuts a GeoJSON source into tiles only after the glyphs of its text layers
arrived, so a glyph request that hangs (a weak signal) kept every clustered house off the map. Source: OpenFreeMap's
`Noto Sans Bold/0-255.pbf` (SIL Open Font License), cut to the characters `point_count_abbreviated` prints.
Usage: python3 scripts/make_count_glyphs.py <the downloaded 0-255.pbf>  ->  src/assets/glyphs/count-0-255.pbf
"""
import sys
from pathlib import Path

KEEP = {ord(c) for c in ' .0123456789k'}
OUT = Path(__file__).resolve().parent.parent / 'src/assets/glyphs/count-0-255.pbf'


def varint(b: bytes, i: int) -> tuple[int, int]:
    v = s = 0
    while True:
        x = b[i]; i += 1; v |= (x & 0x7F) << s; s += 7
        if x < 0x80: return v, i


def enc_varint(v: int) -> bytes:
    out = bytearray()
    while True:
        x = v & 0x7F; v >>= 7
        out.append(x | (0x80 if v else 0))
        if not v: return bytes(out)


def fields(b: bytes):
    """(field number, wire type, raw bytes of the whole field) of one protobuf message"""
    i = 0
    while i < len(b):
        start = i
        key, i = varint(b, i)
        f, w = key >> 3, key & 7
        if w == 0: _, i = varint(b, i)
        elif w == 2: n, i = varint(b, i); i += n
        else: raise ValueError(f'wire type {w}')
        yield f, w, b[start:i]


def payload(raw: bytes) -> bytes:
    _, i = varint(raw, 0)
    _, i = varint(raw, i)
    return raw[i:]


def glyph_id(g: bytes) -> int:
    for f, _, raw in fields(g):
        if f == 1: return varint(raw, 1)[0]
    return -1


def cut(pbf: bytes) -> bytes:
    out = bytearray()
    for f, _, raw in fields(pbf):
        if f != 1: continue  # stacks
        stack = bytearray()
        for sf, _, sraw in fields(payload(raw)):
            if sf == 1: stack += b'\x0a' + enc_varint(len(b'Inok Count')) + b'Inok Count'  # name
            elif sf == 3 and glyph_id(payload(sraw)) not in KEEP: continue
            else: stack += sraw
        out += b'\x0a' + enc_varint(len(stack)) + stack
    return bytes(out)


if __name__ == '__main__':
    data = cut(Path(sys.argv[1]).read_bytes())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(data)
    ids = sorted(glyph_id(payload(g)) for _, _, s in fields(data) for f, _, g in fields(payload(s)) if f == 3)
    print(f'{OUT.name}: {len(data)} b, glyphs {"".join(map(chr, ids))!r}')
