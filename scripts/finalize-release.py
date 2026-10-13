#!/usr/bin/env python3
"""Finalize an accepted Tymra release. Default: checked plan; --apply: bounded deletion.

Deletes only explicitly inventoried transfer payloads. No image/container/volume prune,
database writes, service restart or whole-directory deletion is implemented here.
"""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import re
import shlex
import stat
import subprocess
import tempfile

PAYLOAD = re.compile(r'(?:image(?:-final|-changed-layers(?:-[0-9a-f]{40})?)?\.tar(?:\.gz|\.zst)?|private-ci-image\.tar\.gz|private-ci-(?:image-package|package)\.zip|tymra-booking-reference-continue\.tar\.gz|tymra-release\.tar(?:\.gz|\.zst)?(?:\.part-\d{2})?)$')
FULL_IMAGE = {'image.tar.gz', 'image-final.tar.gz', 'image.tar.zst', 'image-final.tar.zst', 'tymra-release.tar.gz', 'tymra-release.tar.zst', 'private-ci-image.tar.gz'}
CHECKS = ('deployment', 'runtime_config', 'health', 'business', 'rollback_compatibility')


def real(value):
    path = pathlib.Path(value)
    if not path.is_absolute() or path.resolve() != path:
        raise ValueError('Use an absolute path without symlink ancestors')
    return path


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def guard(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise ValueError('Payload must be an ordinary nonlinked file')
    return [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns]


def checked(item):
    path = real(item['path'])
    before = guard(path)
    if sha(path) != item['sha256'] or guard(path) != before:
        raise ValueError('Missing, changed or corrupt recovery/cleanup material')
    return path, before


def read_checked(item):
    path, _ = checked(item)
    return json.loads(path.read_text())


def evidence(items):
    if not items:
        raise ValueError('Hashed validation evidence is required')
    return [str(checked(item)[0]) for item in items]


def plan(config):
    if config.get('project') != 'tymra':
        raise ValueError('This entry point is exclusively for Tymra')
    roots = [real(p) for p in config['roots']]
    if not roots or len(set(roots)) != len(roots) or any(a in b.parents for a in roots for b in roots if a != b):
        raise ValueError('Explicit nonoverlapping payload roots are required')
    protected = set(evidence(config['protected_files']))
    # Bind acceptance to BOTH selected releases; a timestamp alone cannot select rollback.
    acceptance = read_checked(config['acceptance'])
    protected.add(config['acceptance']['path'])
    if acceptance.get('status') != 'passed' or any(acceptance.get('checks', {}).get(k) is not True for k in CHECKS):
        raise ValueError('Deployment and business acceptance must pass before cleanup')
    if not config['runtime']['config_sha256'] or acceptance.get('runtime_config_sha256') != config['runtime']['config_sha256']:
        raise ValueError('Acceptance must bind the exact running service configurations')
    for role in ('current', 'rollback'):
        version = config[role]
        if acceptance.get(role) != {k: version[k] for k in ('release', 'revision', 'image')}:
            raise ValueError('Acceptance refers to different current/rollback identities')
        archive, _ = checked(version['archive'])
        if archive.name not in FULL_IMAGE or not any(r in archive.parents for r in roots):
            raise ValueError('Recovery requires a complete compressed image, not delta layers or a ZIP')
        proof = read_checked(version['verification'])
        if (proof.get('status') != 'passed' or proof.get('kind') != 'full-image-restore'
                or proof.get('image') != version['image'] or proof.get('revision') != version['revision']
                or proof.get('archive_sha256') != version['archive']['sha256']
                or any(proof.get('checks', {}).get(k) is not True for k in ('all_layers', 'execution_config', 'isolated_restore'))):
            raise ValueError('Complete image verification and actual isolated restore are required')
        protected.update(evidence(proof['evidence']))
        protected.update([str(archive), version['verification']['path']])
    if config['current']['release'] == config['rollback']['release']:
        raise ValueError('Choose the previous verified release explicitly')
    protected.update(evidence(acceptance['evidence']))
    targets, seen = [], set()
    for item in config['retire']:
        path = real(item['path'])
        if str(path) in protected or not any(r in path.parents for r in roots) or not PAYLOAD.fullmatch(path.name):
            raise ValueError('Deletion target is protected, outside release roots or not a recognized payload')
        if path in seen:
            raise ValueError('Duplicate deletion target')
        seen.add(path)
        if not path.exists():
            continue  # Repeat completion is safe, but remaining targets are still hash checked.
        _, stamp = checked(item)
        targets.append({'path': str(path), 'sha256': item['sha256'], 'guard': stamp})
    return {'policy': 'tymra-release-payload-retention-v1', 'current': config['current']['release'],
            'rollback': config['rollback']['release'], 'protected': sorted(protected),
            'remove': targets, 'remove_bytes': sum(x['guard'][2] for x in targets)}


def run(command):
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise ValueError('Verification command failed: ' + pathlib.Path(command[0]).name)
    return result.stdout


def docker(config, args, runtime=False):
    target = config['runtime'] if runtime else config
    command = target['docker'] + args
    return run(['ssh', '-o', 'BatchMode=yes', target['ssh'], shlex.join(command)] if target.get('ssh') else command)


def config_sha256(container):
    # Return only a digest; never write container environment values into receipts.
    value = {k: container[k] for k in ('Config', 'HostConfig', 'Mounts')}
    value['Mounts'] = sorted(value['Mounts'], key=lambda m: (m['Destination'], m.get('Source', '')))
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def verify_runtime(config):
    runtime = config['runtime']
    ids = docker(config, ['ps', '-aq'], True).decode().split()
    containers = json.loads(docker(config, ['inspect', *ids], True)) if ids else []
    expected = set(runtime['containers'])
    project = [c for c in containers if (c['Config'].get('Labels') or {}).get('com.docker.compose.project') == 'tymra']
    applications = [c for c in project if (c['Config'].get('Labels') or {}).get('com.docker.compose.service') in {'web', 'worker', 'api', 'scheduler'}]
    services = [(c['Config'].get('Labels') or {}).get('com.docker.compose.service') for c in applications]
    if (sorted(services) != ['api', 'scheduler', 'web', 'worker']
            or {c['Name'].lstrip('/') for c in applications} != expected):
        raise ValueError('Inventory all Tymra application services before finalization')
    for c in applications:
        service = (c['Config'].get('Labels') or {}).get('com.docker.compose.service')
        health = c['State'].get('Health', {}).get('Status')
        if (c['Image'] != config['current']['image'] or not c['State']['Running']
                or (service in {'web', 'api'} and health != 'healthy')
                or (health is not None and health != 'healthy')
                or config_sha256(c) != runtime['config_sha256'].get(c['Name'].lstrip('/'))):
            raise ValueError('Application image or live health does not match acceptance')
    for role in ('current', 'rollback'):
        version = config[role]
        image = json.loads(docker(config, ['image', 'inspect', version['image']], True))[0]
        proof = read_checked(version['verification'])
        if (image['Id'] != version['image']
                or (image['Config'].get('Labels') or {}).get('org.opencontainers.image.revision') != version['revision']
                or image['RootFS']['Layers'] != proof.get('rootfs_layers')):
            raise ValueError('Current/rollback image is missing or has a different revision')
    return sorted([{'id': c['Id'], 'image': c['Image'], 'started': c['State']['StartedAt'],
                    'running': c['State']['Running'], 'restarts': c['RestartCount'],
                    'config_sha256': config_sha256(c)}
                   for c in containers], key=lambda c: c['id'])


def ensure_unused(config, paths):
    if not paths:
        return
    ids = docker(config, ['ps', '-aq']).decode().split()
    containers = json.loads(docker(config, ['inspect', *ids])) if ids else []
    for c in containers:
        for mount in c.get('Mounts', []):
            source = pathlib.Path(mount['Source'])
            if any(path == source or source in path.parents or path in source.parents for path in map(pathlib.Path, paths)):
                raise ValueError('A container mounts a cleanup path; preserve it')
    opened = subprocess.run([config.get('lsof', 'lsof'), '-F', 'pn', *paths], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if opened.returncode != 1 or opened.stdout or opened.stderr:
        raise ValueError('Cannot confirm all transfer files are closed')


def apply(config, prepared, runtime_check=verify_runtime, unused_check=ensure_unused):
    if plan(config) != prepared:
        raise ValueError('Cleanup inventory changed')
    before = runtime_check(config)
    unused_check(config, [x['path'] for x in prepared['remove']])
    for item in prepared['remove']:
        if guard(real(item['path'])) != item['guard']:
            raise ValueError('Payload changed before deletion')
    for item in prepared['remove']:
        path, stamp = checked(item)
        if stamp != item['guard']:
            raise ValueError('Payload changed immediately before deletion')
        path.unlink()
    # Recheck recovery material/evidence and all production container identities afterward.
    remaining = plan(config)
    after = runtime_check(config)
    if remaining['remove'] or before != after:
        raise ValueError('Post-cleanup verification changed; inspect preserved recovery material')
    return {**prepared, 'status': 'passed', 'runtime_unchanged': True,
            'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = json.loads(real(args.config).read_text())
    output = real(args.output)
    lock = real(config['roots'][0]) / '.tymra-release-finalization.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        os.close(fd)
        prepared = plan(config)
        if output in {real(args.config), lock} or str(output) in prepared['protected'] or any(str(output) == x['path'] for x in config['retire']):
            raise ValueError('Receipt must not overwrite recovery or cleanup material')
        result = apply(config, prepared) if args.apply else prepared
        if not args.apply:
            verify_runtime(config)
            ensure_unused(config, [x['path'] for x in prepared['remove']])
        fd, name = tempfile.mkstemp(prefix='.tymra-receipt-', dir=output.parent)
        with os.fdopen(fd, 'w') as stream:
            json.dump(result, stream, indent=2)
        os.replace(name, output)
        print(json.dumps({'status': result.get('status', 'planned'), 'files': len(result['remove']),
                          'bytes': result['remove_bytes'], 'current': result['current'], 'rollback': result['rollback']}))
    finally:
        lock.unlink()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, IndexError) as error:
        raise SystemExit(str(error))
