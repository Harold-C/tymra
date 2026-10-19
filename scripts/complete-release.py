#!/usr/bin/env python3
"""Required accepted-release completion; never deploys, restarts or marks acceptance passed."""
import argparse
import importlib.util
import json
import pathlib
import subprocess
import sys


def complete(config_path, output):
    helper = pathlib.Path(__file__).with_name('finalize-release.py')
    spec = importlib.util.spec_from_file_location('finalizer', helper)
    finalizer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(finalizer)
    config = json.loads(finalizer.real(config_path).read_text())
    # Cheap early rejection; the destructive entry performs ALL recovery, inventory,
    # file-handle and runtime checks under its exclusive lock. Do not hash tens of GB
    # in a parent process only to discard its verification cache and hash them again.
    acceptance = finalizer.read_checked(config['acceptance'])
    if (acceptance.get('status') != 'passed'
            or any(acceptance.get('checks', {}).get(k) is not True for k in finalizer.CHECKS)
            or not config.get('backup_retention')):
        raise ValueError('Accepted deployment and complete backup-retention configuration are required')
    subprocess.run([sys.executable, str(helper), '--config', str(config_path),
                    '--output', str(output), '--apply'], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    complete(args.config, args.output)
