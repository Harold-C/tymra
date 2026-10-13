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
    # Validate immutable reviewed evidence before invoking the destructive entry.
    # It independently repeats these checks under its lock, including runtime identity.
    finalizer.plan(config)
    subprocess.run([sys.executable, str(helper), '--config', str(config_path),
                    '--output', str(output), '--apply'], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    complete(args.config, args.output)
