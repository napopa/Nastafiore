#!/usr/bin/env python3
"""Scan publishable Git content without printing secret values or private hosts."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
URL = re.compile(rb'https?://(?P<userinfo>[^\s\x00\'"<>/@]+@)?(?P<host>[A-Za-z0-9.-]+)\b')
CREDENTIAL = re.compile(rb'(?i)(password|api[_-]?key|listenbrainztoken|access[_-]?token|secret)[\'\"]?\s*[:=]\s*[\'\"]([^\'\"\r\n]+)[\'\"]')
FIXTURE_VALUES = {'demo', 'key', 'private', 'private-key', 'old-key', 'top-secret', 'test-secret', 'session', 'lb-private', 'public-token', 'dummy-test-key', 'dummy-native-key'}
PRIVATE_FILE = re.compile(r'(^|/)(?:signing\.properties|key\.properties|credentials\.json|secrets\.json|RKStorage|SecureStore\.xml)$|\.(?:jks|keystore|p12|pfx|pem|key)$', re.I)
PUBLIC_HOSTS = {line.strip() for line in (ROOT / 'scripts/public-url-hosts.txt').read_text().splitlines() if line.strip() and not line.startswith('#')}


def inspect_blob(path, data):
    findings = []
    name = Path(path).name
    if PRIVATE_FILE.search(path) or name.startswith('.env') and not name.endswith('.example'):
        findings.append((path, 0, 'private configuration or signing file'))
    if b'\x00' in data:
        return findings
    fixture = path.startswith(('__tests__/', 'scripts/'))
    for match in CREDENTIAL.finditer(data):
        label = path.startswith('app/i18next/') and match.group(1) == b'Password'
        dummy = fixture and match.group(2).decode(errors='replace').strip() in FIXTURE_VALUES
        if not label and not dummy:
            findings.append((path, data.count(b'\n', 0, match.start()) + 1, 'literal credential'))
    for match in URL.finditer(data):
        host = match.group('host').decode().lower()
        if match.group('userinfo') and not (fixture and match.group('userinfo') == b'user:private-key@'):
            findings.append((path, data.count(b'\n', 0, match.start()) + 1, 'embedded URL credentials'))
        example = host.endswith(('.example', '.test', '.invalid'))
        local = host in {'localhost', '127.0.0.1'} or fixture and (host == '10.0.2.2' or host.endswith('.mock'))
        if host not in PUBLIC_HOSTS and not example and not local:
            findings.append((path, data.count(b'\n', 0, match.start()) + 1, 'unapproved URL hostname'))
    return findings


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def blobs(mode):
    if mode == 'worktree':
        for raw in git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split(b'\0'):
            if raw:
                path = os.fsdecode(raw)
                file = ROOT / path
                if file.is_symlink():
                    yield path, os.fsencode(os.readlink(file))
                elif file.is_file():
                    yield path, file.read_bytes()
        return
    objects = {}
    if mode == 'staged':
        for item in git('ls-files', '--stage', '-z').split(b'\0'):
            if item:
                header, path = item.split(b'\t', 1)
                objects.setdefault(header.split()[1], []).append(os.fsdecode(path))
    else:
        for item in git('rev-list', '--objects', '--all').splitlines():
            oid, _, path = item.partition(b' ')
            objects.setdefault(oid, []).append(os.fsdecode(path))
    payload = b''.join(oid + b'\n' for oid in objects)
    result = subprocess.run(['git', 'cat-file', '--batch'], input=payload, stdout=subprocess.PIPE, cwd=ROOT, check=True).stdout
    position = 0
    while position < len(result):
        end = result.index(b'\n', position)
        oid, kind, length = result[position:end].split()
        length = int(length)
        data = result[end + 1:end + 1 + length]
        position = end + 2 + length
        if kind == b'blob':
            for path in objects[oid]:
                yield path, data
        elif mode == 'history' and kind == b'commit':
            yield f'commit/{oid.decode()}', data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['worktree', 'staged', 'history'], nargs='?', default='worktree')
    args = parser.parse_args()
    findings = set()
    scanned = 0
    text = []
    for path, data in blobs(args.mode):
        scanned += 1
        findings.update(inspect_blob(path, data))
        if b'\x00' not in data:
            text.append(data)
    for path, line, reason in sorted(findings):
        print(f'{path}:{line}: {reason}; value withheld', file=sys.stderr)
    executable = shutil.which('gitleaks')
    if not executable:
        candidate = Path.home() / '.local/bin/gitleaks'
        executable = str(candidate) if candidate.is_file() else None
    if not executable:
        print('Publication check requires Gitleaks; install it before committing or pushing', file=sys.stderr)
        return 2
    command = [executable, 'stdin', '--redact=100', '--no-banner', '--ignore-gitleaks-allow']
    scan = subprocess.run(command, input=b'\n'.join(text), cwd=ROOT, capture_output=True, timeout=120)
    if scan.returncode:
        print('Gitleaks rejected the scan; secret values and raw scanner output withheld', file=sys.stderr)
    if findings or scan.returncode:
        return 1
    print(f'Publication check passed: {scanned} Git objects, approved public/example URLs, no detected secrets')
    return 0


if __name__ == '__main__':
    sys.exit(main())
