#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only; additional permission in LICENSE.google-cast.
"""Keep the app's offline license texts identical to the source notices."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {'notice': 'NOTICE', 'gpl': 'LICENSE', 'cast': 'LICENSE.google-cast', 'upstream': 'LICENSE.upstream'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    notices = {key: (ROOT / file).read_text() for key, file in FILES.items()}
    notices['bundleSha256'] = hashlib.sha256(json.dumps(notices, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    text = json.dumps(notices, indent=2, ensure_ascii=False) + '\n'
    target = ROOT / 'public/licenses.json'
    if args.check:
        if not target.is_file() or target.read_text() != text:
            parser.exit(1, 'Offline license texts are stale; run python3 scripts/sync-licenses.py\n')
        print('Offline license texts match all source notices')
    else:
        target.write_text(text)
