#!/usr/bin/env python3
"""Install the checked helpers and connect an existing Tymra release.py completion stage."""
import argparse
import hashlib
import os
import pathlib
import re
import tempfile

BIN = pathlib.Path('/srv/apps/tymra/bin')
RELEASES = pathlib.Path('/srv/apps/tymra/releases')
HOOK = "elif mode=='complete':run(['python3','/srv/apps/tymra/bin/complete-release.py','--config',str(BASE/'retention-finalization.json'),'--output',str(BASE/'retention-completion.json')]);print('Accepted release finalization completed')\n"
ANCHOR = "else:raise RuntimeError('Unsupported bounded release stage')"
DICT_ANCHOR = "    if sys.argv[1] not in operations:raise RuntimeError('Unsupported bounded release stage')"
DICT_HOOK = "    operations['complete']=lambda:run(['python3','/srv/apps/tymra/bin/complete-release.py','--config',str(BASE/'retention-finalization.json'),'--output',str(BASE/'retention-completion.json')])\n"
REUSE_PATTERN = r"(?m)^        prior=BACKUPS/'[^']+'$"
REUSE_SELECTION = """        live_release=env(inspect([APPS[0]])[0])['TYMRA_RELEASE_VERSION']
        assert pathlib.Path(live_release).name==live_release, 'Invalid running release identity'
        accepted_policy=json.loads((BASE.parent/live_release/'retention-finalization.json').read_text())
        prior=pathlib.Path(accepted_policy['backup_retention']['keep'])
        assert prior.parent==BACKUPS and prior.resolve()==prior, 'Invalid retained evidence path'"""


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
    if source.count(DICT_ANCHOR) == 1 and 'operations={' in source and 'operations[sys.argv[1]]()' in source:
        updated = source if DICT_HOOK in source else source.replace(DICT_ANCHOR, DICT_HOOK + DICT_ANCHOR)
    elif source.count(ANCHOR) == 1:
        updated = source if HOOK in source else source.replace(ANCHOR, HOOK + ANCHOR)
    else:
        raise ValueError('Unknown release helper dispatcher; review before installing')
    if re.search(REUSE_PATTERN, updated):
        if not all(token in source for token in ['def env(', 'def inspect(', 'APPS=', 'BACKUPS=']):
            raise ValueError('Unknown evidence reuse helper; review before installing')
        updated = re.sub(REUSE_PATTERN, lambda _: REUSE_SELECTION, updated)
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
