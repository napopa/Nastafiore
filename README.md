# Nastafiore

Nastafiore is an independent fork of [Castafiore](https://github.com/sawyerf/Castafiore), originally created by sawyerf and its contributors. It preserves Castafiore's Navidrome/Subsonic player, themes and navigation, and adds full MusicBrainz catalog discovery, ListenBrainz popularity totals and reviewed full-album requests through Lidarr.

Nastafiore supports Android and web browsers. It retains upstream offline music, favorites, playlists, radio, lyrics and translations.

## Connect

Connect to Navidrome/Subsonic in Settings. For album requests, open Settings → Catalog integrations and enter your Lidarr URL and API key on the device. Personal service addresses and credentials are supplied at runtime.

Search switches between Library and Catalog, then Artists, Albums or Tracks. Missing music opens album-request review. Requesting an album leaves current playback uninterrupted; imported music plays through Navidrome after its availability is verified.

[Catalog behavior, integration storage and local build instructions](docs/catalog.md)

## License and attribution

Nastafiore is distributed under [GNU GPL version 3 only](LICENSE), with a [limited Google Cast linking permission](LICENSE.google-cast) to retain Android casting. New copyrightable fork contributions use these terms. Distributed modified versions must provide corresponding source under GPLv3. Commercial use and sale remain permitted.

The original Castafiore material retains its [Unlicense](LICENSE.upstream). Credit for the original project belongs to sawyerf and the upstream contributors. Third-party dependencies and assets retain their own licenses. [NOTICE](NOTICE) records the attribution and licensing scope. The app includes these texts under Settings → License and source.

Releases include matching source and build scripts. Personal credentials and signing material are supplied locally.
