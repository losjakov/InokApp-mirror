#!/usr/bin/env python3
"""db_read.py - A-87 (1a): the emulator smoke's reads of the app's SQLite file WITHOUT the `sqlite3` CLI (it came from a run-time
`apt-get install`, which died with the Ubuntu mirror on 11.11.2026). Python's own `sqlite3` module is on every runner image.

  python3 -I scripts/db_read.py <file.db> "<sql>[; <sql> ...]"   -> rows as the CLI prints them: columns joined by '|', NULL = ''
  python3 -I scripts/db_read.py --self-test

Exit 1 when the file is not a database or a statement fails (the CLI did the same), so `... | grep -q .` keeps its meaning.
"""
import sqlite3
import sys


def statements(sql):
    """The statements of a script, split where SQLite itself says a statement is complete (a ';' inside a string stays)."""
    out, cur = [], ''
    for part in sql.split(';'):
        cur += part + ';'
        if sqlite3.complete_statement(cur):
            if cur.strip(' \t\r\n;'):
                out.append(cur.strip())
            cur = ''
    if cur.strip(' \t\r\n;'):
        out.append(cur.strip())
    return out


def cell(v):
    if v is None:
        return ''
    if isinstance(v, bytes):
        return v.decode('utf-8', 'replace')
    return str(v)


def run(path, sql):
    con = sqlite3.connect(path)  # a COPY pulled off the device (WAL header: read-only mode would need its -shm)
    try:
        lines = []
        for st in statements(sql):
            for row in con.execute(st):
                lines.append('|'.join(cell(v) for v in row))
        return lines
    finally:
        con.close()


def self_test():
    import os
    import tempfile
    assert statements("select 1; select 'a;b' ;\n") == ['select 1;', "select 'a;b' ;"], statements("select 1; select 'a;b' ;\n")
    d = tempfile.mkdtemp()
    p = os.path.join(d, 't.db')
    con = sqlite3.connect(p)
    con.executescript("create table meta(key text, value text); insert into meta values('fts','trigram'),('export_version',null);"
                      "create table monastery(code int); insert into monastery values(1),(2);")
    con.commit(); con.close()
    got = run(p, "select key, value from meta; select 'monasteries', count(*) from monastery;")
    assert got == ['fts|trigram', 'export_version|', 'monasteries|2'], got
    bad = os.path.join(d, 'bad.db')
    open(bad, 'wb').write(b'not a database at all' * 10)
    try:
        run(bad, 'select 1'); raise AssertionError('a non-database must fail')
    except sqlite3.DatabaseError:
        pass
    print('db_read self-test: PASS')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    elif len(sys.argv) == 3:
        try:
            for ln in run(sys.argv[1], sys.argv[2]):
                print(ln)
        except sqlite3.Error as e:
            print(f'db_read: {e}', file=sys.stderr); sys.exit(1)
    else:
        print(__doc__, file=sys.stderr); sys.exit(2)
