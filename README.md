# Castafiore (napopa)

Android and web/PWA fork of [Castafiore](https://github.com/sawyerf/Castafiore), preserving its Navidrome/Subsonic player, themes and navigation. Adds full MusicBrainz discovery, ListenBrainz popularity totals and reviewed full-album requests through Lidarr.

## Install and update with Obtainium

[Install with Obtainium](https://apps.obtainium.imranr.dev/redirect?r=obtainium%3A%2F%2Fapp%2F%257B%2522id%2522%253A%2522com.napopa.castafiore%2522%252C%2522url%2522%253A%2522https%253A%252F%252Fgithub.com%252Fnapopa%252FCastafiore%2522%252C%2522author%2522%253A%2522napopa%2522%252C%2522name%2522%253A%2522Castafiore%2520%2528napopa%2529%2522%252C%2522additionalSettings%2522%253A%257B%2522apkFilterRegEx%2522%253A%2522%255ECastafiore-napopa-universal%255C%255C.apk%2524%2522%252C%2522includePrereleases%2522%253Afalse%257D%257D)

With Obtainium installed, open that link, confirm the import and press Install. Android asks for permission to install apps from Obtainium the first time. Obtainium then tracks stable APK releases from this repository. No GitHub token or account is needed.

Alternatively, in Obtainium choose Add app and enter:

```text
https://github.com/napopa/Castafiore
```

[Latest signed APK](https://github.com/napopa/Castafiore/releases/latest) · [Obtainium import configuration](public/obtainium.json)

Package: `com.napopa.castafiore`. Display name: Castafiore (napopa). Android 7 or newer. One universal APK supports ARM, ARM64, x86 and x86_64 and coexists with the upstream app. Updates use the same signing key; signing material stays outside GitHub.

## Connect

Connect to Navidrome/Subsonic in Settings. For album requests, open Settings → Catalog integrations and enter your Lidarr URL and API key on the device. These values are supplied at runtime; no personal service addresses or credentials are bundled. Search switches between Library and Catalog, then Artists, Albums or Tracks. Missing music opens album review, and requesting does not interrupt playback.

[Catalog behavior, integration storage and verification](docs/catalog.md) · [Local builds and releases](docs/catalog.md#android-releases-for-obtainium)

The fork preserves upstream offline music, favorites, playlists, radio, lyrics, ListenBrainz discovery, translations and themes. Source and license attribution remain available in this repository. The upstream project is maintained by [sawyerf](https://github.com/sawyerf/Castafiore).
