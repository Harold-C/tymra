#!/usr/bin/env python3
"""Install the checked helpers and connect an existing Tymra release.py completion stage."""
import argparse
import hashlib
import os
import pathlib
import tempfile

BIN = pathlib.Path('/srv/apps/tymra/bin')
RELEASES = pathlib.Path('/srv/apps/tymra/releases')
HOOK = "elif mode=='complete':run(['python3','/srv/apps/tymra/bin/complete-release.py','--config',str(BASE/'retention-finalization.json'),'--output',str(BASE/'retention-completion.json')]);print('Accepted release finalization completed')\n"
ANCHOR = "else:raise RuntimeError('Unsupported bounded release stage')"


def write(path, content, mode):
    fd, name = tempfile.mkstemp(prefix='.retention-install-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(content)
            os.fchmod(stream.fileno(), mode)
        os.replace(name, path)
        if hashlib.sha256(path.read_bytes()).digest() != hashlib.sha256(content.encode()).digest():
            raise ValueError('Installed helper readback failed')
    finally:
        pathlib.Path(name).unlink(missing_ok=True)


def install(helper):
    if helper.resolve() != helper or helper.name != 'release.py' or helper.parent.parent != RELEASES:
        raise ValueError('Select an existing direct Tymra release helper without symlinks')
    source = helper.read_text()
    if source.count(ANCHOR) != 1:
        raise ValueError('Unknown release helper dispatcher; review before installing')
    updated = source if HOOK in source else source.replace(ANCHOR, HOOK + ANCHOR)
    compile(updated, str(helper), 'exec')
    files = {name: pathlib.Path(__file__).with_name(name).read_text()
             for name in ['finalize-release.py', 'complete-release.py']}
    for name, content in files.items():
        compile(content, name, 'exec')
    if BIN.resolve() != BIN:
        raise ValueError('Helper installation directory must not be a symlink')
    BIN.mkdir(mode=0o700, exist_ok=True)
    backup = helper.with_name('release.py.before-retention')
    if not backup.exists():
        with backup.open('x') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(source)
    for name, content in files.items():
        write(BIN / name, content, 0o700)
    if source != updated:
        write(helper, updated, helper.stat().st_mode & 0o777)
    print('Installed helpers and connected the accepted-release complete stage')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-helper', type=pathlib.Path, required=True)
    install(parser.parse_args().release_helper)
