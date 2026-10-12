# Integration setup and local builds

## Connections

Connect to your Navidrome or Subsonic server in Settings. MusicBrainz catalog browsing and public ListenBrainz statistics are available without a Lidarr connection.

To add Lidarr:

1. Select your Navidrome server and user.
2. Open Settings → Catalog integrations.
3. Enter your Lidarr HTTP(S) base URL and API key. The key is available in Lidarr under Settings → General → Security.
4. Select **Check connection and load settings**.
5. Choose the root folder, quality profile and metadata profile.
6. Select **Save integrations**.

An optional ListenBrainz token can be saved on the same screen. Settings are stored separately for each Navidrome server and user. Android stores integration credentials in SecureStore. On web, credentials last for the session unless **Remember credentials in this browser** is enabled. **Disconnect integrations** removes the saved credentials.

For web access, Lidarr must allow requests from the app's origin. An app served over HTTPS also needs an HTTPS Lidarr endpoint.

## Local builds

```sh
npm ci
npm test -- --runInBand
npm run eslint
npm run export:web
python3 scripts/create-signing.py
npm run export:android
```

Web output is `dist/`. The signed Android APK is `android/app/build/outputs/apk/release/app-release.apk`. The Android package is `com.napopa.castafiore`.

Android builds need SDK platform 35, build tools 35.0.0, NDK 27.1.12297006 and a supported JDK. The SDK location defaults to `~/.local/share/castafiore-build/android-sdk`; set `ANDROID_HOME` to use an existing SDK.

Signing material defaults to `~/.local/share/castafiore-signing/`. Set `CASTAFIORE_SIGNING_PROPERTIES` to use another private signing configuration. Keep the same signing key for future updates. The creation script refuses to overwrite an existing key. Production builds require the local signing configuration.

Run `python3 scripts/sync-licenses.py` after changing a legal notice. Builds and release preparation verify that the bundled texts match `LICENSE`, `LICENSE.google-cast` and `NOTICE`.

## Publication checks

Personal service addresses, credentials and signing material belong in local configuration. Generated build files and verification artifacts are excluded from Git.

Install Gitleaks from its official release, then enable the repository's publication checks:

```sh
python3 scripts/install-publication-hooks.py
python3 scripts/check-publication.py worktree
python3 scripts/check-publication.py history
```

The hooks scan staged content and pushed history. GitHub runs the same checks. Scanner output is withheld when a check detects private data.
