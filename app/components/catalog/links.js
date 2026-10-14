const sites = {
	'spotify.com': 'Spotify', 'music.apple.com': 'Apple Music', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube',
	'wikipedia.org': 'Wikipedia', 'wikidata.org': 'Wikidata', 'discogs.com': 'Discogs', 'last.fm': 'Last.fm',
	'bandcamp.com': 'Bandcamp', 'soundcloud.com': 'SoundCloud', 'allmusic.com': 'AllMusic', 'deezer.com': 'Deezer', 'tidal.com': 'Tidal',
}
export const externalLinks = links => {
	const unique = new Map()
	for (const link of links || []) {
		try {
			const url = new URL(link.url)
			if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) continue
			const host = url.hostname.replace(/^www\./, '')
			const name = Object.entries(sites).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] || host
			if (!unique.has(url.href)) unique.set(url.href, { name, url: url.href })
		} catch { /* Invalid links have no action. */ }
	}
	return [...unique.values()]
}
