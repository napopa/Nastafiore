#!/usr/bin/env python3
"""Prepare audited Obtainium release assets; signing secrets remain local."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'com.napopa.castafiore'
CERTIFICATE = '3ba4d9b54be132fdeac85ad4b007529959cf0baf02a66024ad5ed8af2d992c50'
ASSET = 'Castafiore-napopa-universal.apk'


def validate(identity, certificate, version, code):
    if identity['package'] != PACKAGE or identity['version'] != version or identity['code'] != code:
        raise ValueError('APK package/version differs from the fork release configuration')
    if certificate != CERTIFICATE:
        raise ValueError('APK signer differs from the existing fork update key')
    if not {'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'}.issubset(identity['abis']):
        raise ValueError('Release requires one universal APK for all supported architectures')


def check_previous(previous, current):
    if previous and (previous['packageName'] != PACKAGE or previous['certificateSha256'] != CERTIFICATE or previous['versionCode'] >= current['code']):
        raise ValueError('Release must retain package/signer and increase Android versionCode')


def run(*command):
    return subprocess.check_output(command, cwd=ROOT, text=True)


def prepare(apk, output, previous=None):
    if run('git', 'status', '--porcelain').strip():
        raise ValueError('Commit the audited source before preparing a release')
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Keep release output outside the Git checkout')
    package = json.loads((ROOT / 'package.json').read_text())
    run('python3', 'scripts/sync-licenses.py', '--check')
    license_digest = json.loads((ROOT / 'public/licenses.json').read_text())['bundleSha256'].encode()
    version, code = package['version'], package['androidVersionCode']
    if not isinstance(code, int) or not 0 < code < 2147483648:
        raise ValueError('Set a valid integer androidVersionCode in package.json')
    sdk = Path(os.environ.get('ANDROID_HOME', Path.home() / '.local/share/castafiore-build/android-sdk'))
    tools = sdk / 'build-tools/35.0.0'
    badging = run(str(tools / 'aapt'), 'dump', 'badging', str(apk))
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    abis = re.search(r'^native-code:(.*)$', badging, re.M)
    if not match or not abis:
        raise ValueError('APK metadata is incomplete')
    identity = {'package': match[1], 'code': int(match[2]), 'version': match[3], 'abis': re.findall(r"'([^']+)'", abis[1])}
    verified = run(str(tools / 'apksigner'), 'verify', '--print-certs', str(apk))
    certificate = re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)', verified)
    validate(identity, certificate[1] if certificate else None, version, code)
    check_previous(json.loads(previous.read_text()) if previous else None, identity)
    signing = Path(os.environ.get('CASTAFIORE_SIGNING_PROPERTIES', Path.home() / '.local/share/castafiore-signing/signing.properties'))
    secrets = [line.partition('=')[2].encode() for line in signing.read_text().splitlines() if line.partition('=')[0] in {'storePassword', 'keyPassword'}]
    if not secrets or any(not secret for secret in secrets):
        raise ValueError('Local signing configuration is incomplete')
    with zipfile.ZipFile(apk) as archive:
        if license_digest not in archive.read('assets/index.android.bundle'):
            raise ValueError('APK does not contain the current fork licenses; rebuild before release')
        for name in archive.namelist():
            data = archive.read(name)
            if any(secret in data for secret in secrets):
                raise ValueError('Signing secret found in APK; release stopped')
    run('python3', 'scripts/check-publication.py', 'history')
    output.mkdir(parents=True, exist_ok=False)
    target = output / ASSET
    shutil.copy2(apk, target)
    shutil.copy2(ROOT / 'public/obtainium.json', output / 'obtainium.json')
    for name in ['LICENSE', 'LICENSE.upstream', 'LICENSE.google-cast', 'NOTICE']:
        shutil.copy2(ROOT / name, output / name)
    run('git', 'archive', '--format=tar.gz', '--prefix=Castafiore-napopa/', '--output=' + str(output / 'Castafiore-napopa-source.tar.gz'), 'HEAD')
    info = {'packageName': PACKAGE, 'version': version, 'versionCode': code, 'license': 'GPL-3.0-only', 'licenseNoticeSha256': license_digest.decode(), 'certificateSha256': CERTIFICATE, 'sourceCommit': run('git', 'rev-parse', 'HEAD').strip(), 'apkSha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'architectures': identity['abis']}
    (output / 'release-info.json').write_text(json.dumps(info, indent=2) + '\n')
    sums = '\n'.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in sorted(output.iterdir()))
    (output / 'SHA256SUMS').write_text(sums + '\n')
    print(f'Release assets ready: {output}; version {version}; code {code}; signer verified')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--apk', type=Path, default=ROOT / 'android/app/build/outputs/apk/release/app-release.apk')
    parser.add_argument('--previous', type=Path, help='Previous public release-info.json for update validation')
    args = parser.parse_args()
    try:
        prepare(args.apk.resolve(), args.output.resolve(), args.previous)
    except (ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
