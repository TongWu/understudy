#!/usr/bin/env python3
"""Assemble the standalone Understudy app from the modular sources.

Reads ``shell.html`` and splices in:
  * every ``css/*.css`` (sorted by filename) at ``<!--__CSS__-->``
  * every ``js/*.js``   (sorted by filename) at ``<!--__JS__-->``

and writes ``../dist/understudy.html``. Filenames carry the load order, so a
module may rely on anything with a lower number and nothing with a higher one.

The assembled file is the product: one HTML file, no server, no install, opens
from ``file://``. It is committed, so a checkout ships without running this.
"""
from __future__ import annotations

import argparse
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, os.pardir, 'dist', 'understudy.html')
VERSION_MARKER = '__UNDERSTUDY_VERSION__'


def _read_dir(sub: str, ext: str) -> str:
    d = os.path.join(HERE, sub)
    if not os.path.isdir(d):
        return ''
    names = sorted(n for n in os.listdir(d) if n.endswith(ext))
    parts = []
    for name in names:
        with open(os.path.join(d, name), encoding='utf-8') as fh:
            parts.append('/* ==== %s/%s ==== */\n%s' % (sub, name, fh.read().rstrip()))
    return '\n\n'.join(parts)


def build(version: str) -> str:
    with open(os.path.join(HERE, 'shell.html'), encoding='utf-8') as fh:
        shell = fh.read()
    css = _read_dir('css', '.css')
    js = _read_dir('js', '.js')
    shell = shell.replace('<!--__CSS__-->', '<style>\n%s\n</style>' % css)
    shell = shell.replace('<!--__JS__-->', '<script>\n%s\n</script>' % js)
    return shell.replace(VERSION_MARKER, version)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--output', default=OUT, metavar='PATH')
    ap.add_argument('--version', default=None, metavar='VALUE')
    args = ap.parse_args()

    version = args.version
    if version is None:
        with open(os.path.join(HERE, os.pardir, 'VERSION'), encoding='utf-8') as fh:
            version = fh.read().strip()

    out = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    html = build(version)
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(html)
    print('wrote %s (%d bytes, version %s)' % (out, len(html.encode('utf-8')), version))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
