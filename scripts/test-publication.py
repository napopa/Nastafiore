#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import secrets
import shutil
import string
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('publication', SOURCE / 'scripts/check-publication.py')
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class PublicationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='castafiore-publication-')
        self.root = Path(self.temp.name)
        (self.root / 'scripts').mkdir()
        for name in ['check-publication.py', 'public-url-hosts.txt']:
            shutil.copy2(SOURCE / 'scripts' / name, self.root / 'scripts' / name)
        self.git('init', '--quiet')
        self.git('config', 'user.name', 'Publication test')
        self.git('config', 'user.email', 'test@example.org')
        self.git('add', 'scripts')
        self.git('commit', '--quiet', '-m', 'Initialize public scanner')

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(['git', *args], cwd=self.root, capture_output=True, check=True)

    def scan(self, mode, input=None):
        return subprocess.run(['python3', 'scripts/check-publication.py', mode], cwd=self.root, input=input, capture_output=True, text=True)

    def test_public_apis_and_examples_are_accepted(self):
        for url in [b'https://musicbrainz.org/ws/2', b'https://lidarr.example/api/v1', b'http://127.0.0.1:8781']:
            self.assertEqual(publication.inspect_blob('app/example.js', url), [])

    def test_private_hostname_and_private_ip_are_rejected_without_echo(self):
        for suffix in [b'personal.internal/api', b'192.168.42.50/api']:
            url = b'https:' + b'//' + suffix
            findings = publication.inspect_blob('app/example.js', url)
            self.assertEqual(findings[0][2], 'unapproved URL hostname')
            self.assertNotIn(suffix.decode(), str(findings))

    def test_emulator_and_mock_hosts_are_limited_to_fixture_files(self):
        for suffix in [b'10.0.2.2:8782', b'lidarr.mock/api']:
            url = b'http:' + b'//' + suffix
            self.assertEqual(publication.inspect_blob('scripts/mock-native.py', url), [])
            self.assertTrue(publication.inspect_blob('app/config.js', url))

    def test_signing_and_credential_files_cannot_be_force_added(self):
        for path in ['signing.properties', 'credentials.json', '.env.production', 'private.jks']:
            self.assertTrue(publication.inspect_blob(path, b'dummy'))
        self.assertEqual(publication.inspect_blob('.env.example', b''), [])

    def test_short_literal_passwords_are_rejected(self):
        value = b'pass' + b'word="1234"'
        self.assertEqual(publication.inspect_blob('app/config.js', value)[0][2], 'literal credential')

    def test_embedded_url_passwords_are_rejected(self):
        value = b'https:' + b'//user:weak@example.org'
        self.assertEqual(publication.inspect_blob('app/config.js', value)[0][2], 'embedded URL credentials')

    def test_staged_secret_is_blocked_even_when_worktree_is_clean(self):
        token = 'ghp_' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36))
        file = self.root / 'config.js'
        file.write_text('const apiKey = "' + token + '"\n')
        self.git('add', 'config.js')
        file.write_text('const configuredAtRuntime = true\n')
        result = self.scan('staged')
        self.assertEqual(result.returncode, 1)
        self.assertIn('Gitleaks rejected', result.stderr)
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_deleted_historical_secret_still_blocks_publication(self):
        token = 'ghp_' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(36))
        file = self.root / 'config.js'
        file.write_text('const apiKey = "' + token + '"\n')
        self.git('add', 'config.js')
        self.git('commit', '--quiet', '-m', 'Synthetic secret for regression')
        self.git('rm', '--quiet', 'config.js')
        self.git('commit', '--quiet', '-m', 'Remove synthetic secret')
        result = self.scan('history')
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_private_url_in_commit_message_blocks_publication(self):
        url = 'https:' + '//personal.internal/api'
        self.git('commit', '--quiet', '--allow-empty', '-m', 'Synthetic endpoint ' + url)
        result = self.scan('history')
        self.assertEqual(result.returncode, 1)
        self.assertIn('unapproved URL hostname', result.stderr)
        self.assertNotIn(url, result.stdout + result.stderr)

    def test_push_of_unreachable_commit_is_also_checked(self):
        base = self.git('rev-parse', 'HEAD').stdout.decode().strip()
        url = 'https:' + '//personal.internal/api'
        self.git('commit', '--quiet', '--allow-empty', '-m', 'Synthetic endpoint ' + url)
        pushed = self.git('rev-parse', 'HEAD').stdout.decode().strip()
        self.git('reset', '--quiet', '--hard', base)
        self.assertEqual(self.scan('history').returncode, 0)
        result = self.scan('push', f'HEAD {pushed} refs/heads/test {"0" * 40}\n')
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(url, result.stdout + result.stderr)

    def test_clean_snapshot_passes(self):
        self.assertEqual(self.scan('staged').returncode, 0)
        self.assertEqual(self.scan('history').returncode, 0)


if __name__ == '__main__':
    unittest.main()
