import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_proof', Path(__file__).with_name('atomic-release-proof.py'))
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class ReleaseProofTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.root = Path(self.directory.name).resolve()

    def tearDown(self):
        self.directory.cleanup()

    def test_old_direct_write_exposes_an_incomplete_proof(self):
        destination = self.root/'old.json'
        raw = json.dumps({'status': 'passed', 'files': 8}).encode()
        with destination.open('wb') as stream:
            stream.write(raw[:10])
            stream.flush()
            with self.assertRaises(json.JSONDecodeError):
                json.loads(destination.read_bytes())
            stream.write(raw[10:])
        self.assertEqual(json.loads(destination.read_bytes())['files'], 8)

    def test_atomic_publication_is_invisible_until_the_complete_file_is_synced(self):
        destination = self.root/'proof.json'
        waiting, resume = threading.Event(), threading.Event()
        original_sync = os.fsync
        errors = []

        def delayed_sync(descriptor):
            if not waiting.is_set():
                waiting.set()
                if not resume.wait(5):
                    raise TimeoutError('Test writer did not resume')
            return original_sync(descriptor)

        def writer():
            try:
                proof.atomic_publish(destination, {'status': 'passed', 'data': 'x' * 32000})
            except Exception as error:
                errors.append(error)

        with patch.object(proof.os, 'fsync', delayed_sync):
            thread = threading.Thread(target=writer)
            thread.start()
            self.assertTrue(waiting.wait(5))
            self.assertFalse(destination.exists(), 'Consumer must not see a partially published proof')
            resume.set()
            while thread.is_alive():
                if destination.exists():
                    self.assertEqual(json.loads(destination.read_bytes())['status'], 'passed')
            thread.join(5)
        self.assertEqual(errors, [])
        self.assertEqual(json.loads(destination.read_bytes())['data'], 'x' * 32000)
        self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
        self.assertEqual(destination.stat().st_nlink, 1)
        self.assertEqual(list(self.root.glob('.*')), [])

    def test_existing_proofs_and_symlinks_are_not_overwritten(self):
        destination = self.root/'proof.json'
        destination.write_text('{"original":true}')
        with self.assertRaises(FileExistsError):
            proof.atomic_publish(destination, {'new': True})
        self.assertEqual(destination.read_text(), '{"original":true}')
        link = self.root/'link.json'
        link.symlink_to(destination)
        with self.assertRaises(FileExistsError):
            proof.atomic_publish(link, {'new': True})
        self.assertTrue(link.is_symlink())

    def test_two_concurrent_publishers_cannot_overwrite_each_other(self):
        destination = self.root/'proof.json'
        barrier = threading.Barrier(2)
        lock = threading.Lock()
        count = 0
        outcomes = []
        original_sync = os.fsync

        def together(descriptor):
            nonlocal count
            with lock:
                count += 1
                ordinal = count
            if ordinal <= 2:
                barrier.wait(5)
            return original_sync(descriptor)

        def writer(value):
            try:
                proof.atomic_publish(destination, {'writer': value})
                outcomes.append('published')
            except FileExistsError:
                outcomes.append('refused')

        with patch.object(proof.os, 'fsync', together):
            threads = [threading.Thread(target=writer, args=(n,)) for n in [1, 2]]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(5)
                self.assertFalse(thread.is_alive())
        self.assertCountEqual(outcomes, ['published', 'refused'])
        self.assertIn(json.loads(destination.read_bytes())['writer'], [1, 2])
        self.assertEqual(list(self.root.glob('.*')), [])

    def test_invalid_numbers_do_not_create_a_proof(self):
        destination = self.root/'proof.json'
        with self.assertRaises(ValueError):
            proof.atomic_publish(destination, {'invalid': float('nan')})
        self.assertFalse(destination.exists())

    def test_backup_identity_and_manifest_are_bound_before_publication(self):
        backups = self.root/'backups'
        source = backups/'fresh'
        source.mkdir(parents=True)
        snapshot = {'path': str(source), 'files': {str(n): {'sha256': str(n)} for n in range(8)}}
        (source/'manifest.json').write_text(json.dumps(snapshot))
        (self.root/'backup-cutover.json').write_text(json.dumps(snapshot))
        (self.root/'candidate.json').write_text(json.dumps({'revision': 'fixed-source', 'image': 'fixed-image'}))
        value = {'status': 'passed', 'allFileHashesVerified': True, 'source': str(source), 'files': 8,
                 'candidateRevision': 'fixed-source', 'candidateImage': 'fixed-image',
                 'sourceManifestSha256': hashlib.sha256((source/'manifest.json').read_bytes()).hexdigest()}
        proof.validate_backup(self.root, value, backups)
        for key, bad in [('source', '/wrong'), ('files', 7), ('candidateRevision', 'other'),
                         ('candidateImage', 'other'), ('sourceManifestSha256', 'wrong'), ('allFileHashesVerified', False)]:
            with self.assertRaises(ValueError):
                proof.validate_backup(self.root, {**value, key: bad}, backups)

    def test_exact_fresh_argus_readiness_is_required(self):
        (self.root/'predeployment-gates.json').write_text(json.dumps({'pairedArgus': {'source': 'fixed', 'image': 'image'}}))
        value = {'source': 'fixed', 'image': 'image', 'ready': True, 'verifiedAtEpoch': 1000}
        proof.validate_argus(self.root, value, now=1001)
        for overrides in [{'source': 'other'}, {'image': 'other'}, {'ready': False},
                          {'verifiedAtEpoch': 800}, {'verifiedAtEpoch': 1002}, {'verifiedAtEpoch': float('nan')}]:
            with self.assertRaises(ValueError):
                proof.validate_argus(self.root, {**value, **overrides}, now=1001)


if __name__ == '__main__':
    unittest.main()
