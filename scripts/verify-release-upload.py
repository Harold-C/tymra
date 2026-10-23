#!/usr/bin/env python3
"""Delete only runner staging files after the uploaded artifact is downloaded and verified."""
import argparse
import hashlib
import json
import pathlib


def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            digest.update(block)
    return digest.hexdigest()


def verify_and_clean(stage, downloaded, revision):
    expected = {'manifest.json', 'image.tar.gz'}
    roots = [pathlib.Path(stage), pathlib.Path(downloaded)]
    if roots[0].resolve() == roots[1].resolve():
        raise ValueError('Download verification requires an independent copy')
    for root in roots:
        if root.absolute() != root.resolve() or {p.name for p in root.iterdir()} != expected:
            raise ValueError('Unexpected staging contents or symlink path')
        if any(not p.is_file() or p.is_symlink() or p.stat().st_nlink != 1 for p in root.iterdir()):
            raise ValueError('Expected ordinary files only')
    manifest = json.loads((roots[0] / 'manifest.json').read_text())
    if manifest['revision'] != revision:
        raise ValueError('Artifact belongs to another source revision')
    if sha(roots[0] / 'manifest.json') != sha(roots[1] / 'manifest.json'):
        raise ValueError('Uploaded manifest differs; keep staging material')
    if any(sha(root / 'image.tar.gz') != manifest['archiveSha256'] for root in roots):
        raise ValueError('Uploaded image differs; keep staging material')
    for root in roots:
        for name in expected:
            (root / name).unlink()
        root.rmdir()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    verify_and_clean('private-release', 'verified-release-upload', args.revision)
