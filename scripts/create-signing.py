import os
from pathlib import Path
import secrets
import subprocess

signing_dir = Path(os.environ.get('CASTAFIORE_SIGNING_DIR', Path.home() / '.local/share/castafiore-signing'))
signing_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
properties = signing_dir / 'signing.properties'
keystore = signing_dir / 'castafiore.jks'
if properties.exists() or keystore.exists():
    raise SystemExit('Signing material already exists; reuse it for updates')
password = secrets.token_urlsafe(36)
environment = {**os.environ, 'CASTAFIORE_KEY_PASSWORD': password}
subprocess.run(['keytool', '-genkeypair', '-keystore', str(keystore), '-storetype', 'JKS', '-alias', 'castafiore', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-storepass:env', 'CASTAFIORE_KEY_PASSWORD', '-keypass:env', 'CASTAFIORE_KEY_PASSWORD', '-dname', 'CN=Castafiore napopa, OU=Local Android fork'], env=environment, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
keystore.chmod(0o600)
fd = os.open(properties, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write(f'storeFile={keystore}\nstorePassword={password}\nkeyAlias=castafiore\nkeyPassword={password}\n')
print(f'Created signing material outside Git: {signing_dir}')
