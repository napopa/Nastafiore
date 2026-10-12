#!/usr/bin/env python3
"""Install persistent local publication guards shared by this repo's worktrees."""
from pathlib import Path
import shutil
import subprocess

source = Path(__file__).resolve().parents[1]
common = Path(subprocess.check_output(['git', 'rev-parse', '--git-common-dir'], text=True).strip()).resolve()
configured = subprocess.run(['git', 'config', '--get', 'core.hooksPath'], capture_output=True, text=True).stdout.strip()
if configured:
    raise SystemExit('An existing hooksPath is configured; preserve it and integrate these guards explicitly')
marker = '# Castafiore publication guard'
hooks = common / 'hooks'
for name in ['pre-commit', 'pre-push']:
    existing = hooks / name
    if existing.exists() and marker not in existing.read_text():
        raise SystemExit('An existing Git hook was found; preserve it and integrate these guards explicitly')
policy = common / 'publication-guard/scripts'
policy.mkdir(parents=True, exist_ok=True)
for name in ['check-publication.py', 'public-url-hosts.txt']:
    shutil.copy2(source / 'scripts' / name, policy / name)
hooks.mkdir(exist_ok=True)
for name, mode in [('pre-commit', 'staged'), ('pre-push', 'push')]:
    file = hooks / name
    file.write_text('#!/bin/sh\n' + marker + '\nset -eu\nhook_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec python3 "$hook_dir/../publication-guard/scripts/check-publication.py" ' + mode + '\n')
    file.chmod(0o755)
print('Publication guards installed in shared Git metadata; all local worktrees are covered')
