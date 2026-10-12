#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest

source = Path(__file__).resolve().parent / 'prepare-android-release.py'
spec = importlib.util.spec_from_file_location('release', source)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseChecks(unittest.TestCase):
    def setUp(self):
        self.identity = {'package': release.PACKAGE, 'version': '2026.10.12', 'code': 2026101201, 'abis': ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64']}

    def test_correct_universal_signed_fork_is_accepted(self):
        release.validate(self.identity, release.CERTIFICATE, '2026.10.12', 2026101201)

    def test_wrong_package_version_code_and_architecture_are_rejected(self):
        for field, value in [('package', 'com.example.upstream'), ('version', '0.0.1'), ('code', 1), ('abis', ['x86_64'])]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.validate({**self.identity, field: value}, release.CERTIFICATE, '2026.10.12', 2026101201)

    def test_debug_or_rotated_signer_is_rejected(self):
        with self.assertRaises(ValueError):
            release.validate(self.identity, '0' * 64, '2026.10.12', 2026101201)

    def test_future_updates_require_same_package_and_signer_and_increased_code(self):
        previous = {'packageName': release.PACKAGE, 'certificateSha256': release.CERTIFICATE, 'versionCode': 2026101201}
        with self.assertRaises(ValueError):
            release.check_previous(previous, self.identity)
        release.check_previous(previous, {**self.identity, 'code': 2026101202})
        for field in ['packageName', 'certificateSha256']:
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.check_previous({**previous, field: 'different'}, {**self.identity, 'code': 2026101202})


if __name__ == '__main__':
    unittest.main()
