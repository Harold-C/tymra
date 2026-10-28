"""Publish a complete, validated release proof without exposing a partial JSON file."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import time


def atomic_publish(destination, value):
    destination = Path(destination)
    encoded = (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()
    if destination.exists() or destination.is_symlink():
        raise FileExistsError('Existing proof must be inspected, never overwritten')
    descriptor, temporary = tempfile.mkstemp(prefix='.' + destination.name + '.', dir=destination.parent)
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        # link() publishes the complete inode atomically and refuses an existing
        # destination. Unlike exists()+replace(), concurrent writers cannot win
        # by overwriting an already accepted proof.
        os.link(temporary, destination, follow_symlinks=False)
        temporary.unlink()
        directory = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def validate_backup(directory, value, backup_root=Path('/srv/apps/tymra/backups')):
    candidate = json.loads((directory/'candidate.json').read_text())
    snapshot = json.loads((directory/'backup-cutover.json').read_text())
    source = Path(snapshot['path'])
    if source.parent != backup_root or source.resolve() != source:
        raise ValueError('Snapshot is outside the fixed backup root')
    if value.get('status') != 'passed' or value.get('allFileHashesVerified') is not True:
        raise ValueError('Full independent verification is required')
    if value.get('source') != str(source) or value.get('files') != len(snapshot['files']) or len(snapshot['files']) != 8:
        raise ValueError('Proof does not match this exact fresh snapshot')
    if value.get('candidateRevision') != candidate['revision'] or value.get('candidateImage') != candidate['image']:
        raise ValueError('Proof belongs to a different immutable candidate')
    manifest = source/'manifest.json'
    if json.loads(manifest.read_text()) != snapshot:
        raise ValueError('Fresh snapshot manifest changed')
    if hashlib.sha256(manifest.read_bytes()).hexdigest() != value.get('sourceManifestSha256'):
        raise ValueError('Independent manifest SHA does not match the fresh source')


def validate_argus(directory, value, now=None):
    expected = json.loads((directory/'predeployment-gates.json').read_text())['pairedArgus']
    if value.get('source') != expected['source'] or value.get('image') != expected['image'] or value.get('ready') is not True:
        raise ValueError('Exact paired Argus identity and readiness are required')
    stamp = value.get('verifiedAtEpoch')
    if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or not math.isfinite(stamp):
        raise ValueError('Invalid paired-service timestamp')
    if not 0 <= (time.time() if now is None else now) - stamp <= 120:
        raise ValueError('Paired-service proof is not fresh')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--kind', required=True, choices=['backup-offhost', 'paired-argus'])
    args = parser.parse_args()
    directory = args.directory
    root = Path('/srv/apps/tymra/releases')
    relative = str(directory.relative_to(root))
    if not re.fullmatch(r'tymra-release-\d{8}-[1-9]\d*(?:/attempt-[1-9]\d*)?', relative):
        raise ValueError('Unexpected release-proof directory')
    if not directory.is_dir() or directory.resolve() != directory or directory.stat().st_mode & 0o022:
        raise ValueError('Protected canonical release directory required')
    raw = sys.stdin.buffer.read(65537)
    if len(raw) > 65536:
        raise ValueError('Release proof exceeds the bounded receipt size')
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError('Release proof must be a JSON object')
    if args.kind == 'backup-offhost':
        validate_backup(directory, value)
        name = 'backup-offhost-verification.json'
    else:
        validate_argus(directory, value)
        name = 'paired-argus-production-verified.json'
    value['publicationVersion'] = 'atomic-release-proof-v1'
    atomic_publish(directory/name, value)
    print(json.dumps({'status': 'published', 'name': name, 'atomic': True,
                      'sha256': hashlib.sha256((directory/name).read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
