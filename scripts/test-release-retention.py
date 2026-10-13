import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, pathlib.Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


f = load('finalizer', 'finalize-release.py')
u = load('upload', 'verify-release-upload.py')


class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.config = {'project': 'tymra', 'roots': [str(self.root)], 'docker': ['docker'],
                       'runtime': {'docker': ['docker'], 'containers': ['tymra-web-1'],
                                   'config_sha256': {'tymra-web-1': 'config-digest'}}}
        self.config['protected_files'] = [self.write('compose.json', b'protected runtime configuration')]
        evidence = self.write('restore-evidence.json', b'actual validation output')
        for role in ('current', 'rollback'):
            archive = self.write(role + '/image.tar.gz', (role + ' full archive').encode())
            proof = {'status': 'passed', 'kind': 'full-image-restore', 'image': role, 'revision': role,
                     'archive_sha256': archive['sha256'], 'rootfs_layers': ['sha256:layer'],
                     'checks': {k: True for k in ('all_layers', 'execution_config', 'isolated_restore')},
                     'evidence': [evidence]}
            self.config[role] = {'release': role, 'revision': role, 'image': role, 'archive': archive,
                                 'verification': self.write(role + '/proof.json', json.dumps(proof).encode())}
        self.acceptance = {'status': 'passed', 'checks': {k: True for k in f.CHECKS},
                           'evidence': [evidence], 'runtime_config_sha256': self.config['runtime']['config_sha256']}
        for role in ('current', 'rollback'):
            self.acceptance[role] = {k: self.config[role][k] for k in ('release', 'revision', 'image')}
        self.save_acceptance()
        self.config['retire'] = [self.write('old/image.tar.gz', b'old archive'),
                                  self.write('current/image-changed-layers.tar.gz', b'transfer delta'),
                                  self.write('current/private-ci-image-package.zip', b'duplicate download')]
        self.write('old/database.dump', b'keep database')
        self.write('old/source.tar.gz', b'keep source')
        self.write('new/image.tar.gz', b'new unaccepted candidate')

    def write(self, name, data):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return {'path': str(path), 'sha256': f.sha(path)}

    def save_acceptance(self):
        self.config['acceptance'] = self.write('acceptance.json', json.dumps(self.acceptance).encode())

    def apply(self, prepared):
        return f.apply(self.config, prepared, lambda _: ['unchanged runtime'], lambda *_: None)

    def test_explicit_cleanup_preserves_recovery_data_evidence_and_new_candidate(self):
        prepared = f.plan(self.config)
        self.assertEqual(len(prepared['remove']), 3)
        self.assertEqual(self.apply(prepared)['status'], 'passed')
        for path in ['current/image.tar.gz', 'rollback/image.tar.gz', 'compose.json',
                     'restore-evidence.json', 'old/database.dump', 'old/source.tar.gz', 'new/image.tar.gz']:
            self.assertTrue((self.root / path).exists(), path)
        self.assertEqual(f.plan(self.config)['remove'], [])
        self.assertEqual(self.apply(f.plan(self.config))['status'], 'passed')

    def test_every_failed_gate_stale_identity_and_changed_config_block_deletion(self):
        for key in f.CHECKS:
            with self.subTest(key=key):
                self.acceptance['checks'][key] = False
                self.save_acceptance()
                with self.assertRaises(ValueError): f.plan(self.config)
                self.acceptance['checks'][key] = True
        self.acceptance['rollback']['image'] = 'wrong rollback'
        self.save_acceptance()
        with self.assertRaises(ValueError): f.plan(self.config)
        self.acceptance['rollback']['image'] = 'rollback'
        self.save_acceptance()
        (self.root / 'compose.json').write_bytes(b'changed ingress configuration')
        with self.assertRaises(ValueError): f.plan(self.config)

    def test_missing_corrupt_or_delta_rollback_never_counts_as_recovery(self):
        archive = self.root / 'rollback/image.tar.gz'
        archive.write_bytes(b'corrupt')
        with self.assertRaises(ValueError): f.plan(self.config)
        archive.unlink()
        with self.assertRaises(FileNotFoundError): f.plan(self.config)
        self.config['rollback']['archive'] = self.write('rollback/image-changed-layers.tar.gz', b'delta')
        with self.assertRaises(ValueError): f.plan(self.config)

    def test_checksum_only_receipt_without_restore_is_rejected(self):
        item = self.config['rollback']['verification']
        proof = json.loads(pathlib.Path(item['path']).read_text())
        proof['checks']['isolated_restore'] = False
        self.config['rollback']['verification'] = self.write('rollback/proof.json', json.dumps(proof).encode())
        with self.assertRaises(ValueError): f.plan(self.config)

    def test_outside_root_protected_backup_and_symlink_targets_fail(self):
        for item in [self.config['current']['archive'], self.write('old/database.tar.gz', b'db')]:
            config = copy.deepcopy(self.config); config['retire'] = [item]
            with self.assertRaises(ValueError): f.plan(config)
        with tempfile.TemporaryDirectory() as outside:
            path = pathlib.Path(outside).resolve() / 'image.tar.gz'
            path.write_bytes(b'another project payload')
            config = copy.deepcopy(self.config)
            config['retire'] = [{'path': str(path), 'sha256': f.sha(path)}]
            with self.assertRaises(ValueError): f.plan(config)
        target = self.root / 'old/image.tar.gz'; target.unlink()
        target.symlink_to(self.root / 'compose.json')
        with self.assertRaises(ValueError): f.plan(self.config)

    def test_changed_target_open_file_or_runtime_failure_prevents_unlink(self):
        prepared = f.plan(self.config)
        def fail(*_): raise ValueError('not safe')
        for runtime, unused in [(fail, lambda *_: None), (lambda _: [], fail)]:
            with self.assertRaises(ValueError): f.apply(self.config, prepared, runtime, unused)
        self.assertTrue((self.root / 'old/image.tar.gz').exists())
        (self.root / 'old/image.tar.gz').write_bytes(b'changed during transfer')
        with self.assertRaises(ValueError): self.apply(prepared)

    def test_live_config_or_application_inventory_drift_is_rejected(self):
        container = {'Id': 'container', 'Name': '/tymra-web-1', 'Image': 'current', 'RestartCount': 0,
                     'Config': {'Labels': {'com.docker.compose.project': 'tymra', 'com.docker.compose.service': 'web'}},
                     'HostConfig': {}, 'Mounts': [], 'State': {'Running': True, 'StartedAt': 'before', 'Health': {'Status': 'healthy'}}}
        self.config['runtime']['config_sha256']['tymra-web-1'] = f.config_sha256(container)
        containers = []
        for service in ['web', 'api', 'worker', 'scheduler']:
            c = copy.deepcopy(container)
            c['Name'] = '/tymra-' + service + '-1'
            c['Id'] = service
            c['Config']['Labels']['com.docker.compose.service'] = service
            containers.append(c)
        self.config['runtime']['containers'] = [c['Name'].lstrip('/') for c in containers]
        self.config['runtime']['config_sha256'] = {c['Name'].lstrip('/'): f.config_sha256(c) for c in containers}
        def docker(_, args, runtime=False):
            if args == ['ps', '-aq']: return b'container'
            if args[0] == 'inspect': return json.dumps(containers).encode()
            role = args[-1]
            return json.dumps([{'Id': role, 'Config': {'Labels': {'org.opencontainers.image.revision': role}},
                                'RootFS': {'Layers': ['sha256:layer']}}]).encode()
        with patch.object(f, 'docker', docker):
            self.assertEqual(len(f.verify_runtime(self.config)), 4)
            containers[0]['HostConfig']['NetworkMode'] = 'changed'
            with self.assertRaises(ValueError): f.verify_runtime(self.config)
            self.config['runtime']['containers'] = ['missing-worker']
            with self.assertRaises(ValueError): f.verify_runtime(self.config)

    def test_partial_service_inventory_cannot_pass(self):
        container = {'Name': '/tymra-web-1', 'Config': {'Labels': {
            'com.docker.compose.project': 'tymra', 'com.docker.compose.service': 'web'}}}
        with patch.object(f, 'docker', side_effect=[b'web', json.dumps([container]).encode()]):
            with self.assertRaises(ValueError): f.verify_runtime(self.config)

    def test_real_legacy_payload_names_remain_bounded(self):
        for name in ['private-ci-image.tar.gz', 'private-ci-package.zip', 'tymra-booking-reference-continue.tar.gz']:
            self.assertTrue(f.PAYLOAD.fullmatch(name))
        for name in ['evidence.tar.gz', 'database.tar.gz', 'source.tar.gz', 'runtime-private.json']:
            self.assertFalse(f.PAYLOAD.fullmatch(name))

    def test_completion_never_runs_cleanup_when_acceptance_failed(self):
        completion = load('completion', 'complete-release.py')
        self.acceptance['checks']['business'] = False
        self.save_acceptance()
        config_path = self.write('finalization.json', json.dumps(self.config).encode())['path']
        with patch.object(completion.subprocess, 'run') as run:
            with self.assertRaises(ValueError): completion.complete(config_path, self.root / 'done.json')
            run.assert_not_called()

    def test_installation_connects_existing_dispatcher_and_is_repeatable(self):
        installer = load('installer', 'install-release-finalization.py')
        release = self.root / 'releases' / 'accepted'
        release.mkdir(parents=True)
        helper = release / 'release.py'
        original = "if mode=='verify':verify()\n" + installer.ANCHOR + '\n'
        helper.write_text(original)
        with patch.object(installer, 'BIN', self.root / 'bin'), patch.object(installer, 'RELEASES', release.parent):
            installer.install(helper)
            installed = helper.read_text()
            installer.install(helper)
        self.assertEqual(helper.read_text(), installed)
        self.assertEqual(installed.count(installer.HOOK), 1)
        self.assertEqual((release / 'release.py.before-retention').read_text(), original)
        self.assertTrue((self.root / 'bin' / 'complete-release.py').is_file())

    def test_installer_refuses_unknown_dispatcher_before_mutation(self):
        installer = load('installer', 'install-release-finalization.py')
        release = self.root / 'releases' / 'accepted'
        release.mkdir(parents=True)
        helper = release / 'release.py';helper.write_text('print("unrecognized helper")\n')
        with patch.object(installer, 'BIN', self.root / 'bin'), patch.object(installer, 'RELEASES', release.parent):
            with self.assertRaises(ValueError): installer.install(helper)
        self.assertFalse((self.root / 'bin').exists())

    def test_upload_cleanup_requires_independent_matching_download(self):
        for corrupt in (False, True):
            stage, downloaded = self.root / ('stage-' + str(corrupt)), self.root / ('download-' + str(corrupt))
            for root in (stage, downloaded):
                root.mkdir(); (root / 'image.tar.gz').write_bytes(b'image payload')
                (root / 'manifest.json').write_text(json.dumps({'revision': 'fixed-sha', 'archiveSha256': f.sha(root / 'image.tar.gz')}))
            if corrupt:
                (downloaded / 'image.tar.gz').write_bytes(b'broken download')
                with self.assertRaises(ValueError): u.verify_and_clean(stage, downloaded, 'fixed-sha')
                self.assertTrue((stage / 'image.tar.gz').exists())
            else:
                with self.assertRaises(ValueError): u.verify_and_clean(stage, downloaded, 'another-sha')
                self.assertTrue(stage.exists())
                u.verify_and_clean(stage, downloaded, 'fixed-sha')
                self.assertFalse(stage.exists()); self.assertFalse(downloaded.exists())


if __name__ == '__main__':
    unittest.main()
