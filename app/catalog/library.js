import { normalized, matchEdition } from './model'

export const createLibrary = read => {
	const search = async (query, category, signal) => {
		const result = []
		for (let offset = 0; ; offset += 100) {
			const response = await read('search3', { query, artistCount: 0, albumCount: 0, songCount: 0, [`${category}Count`]: 100, [`${category}Offset`]: offset }, signal)
			const page = response.searchResult3?.[category] || []
			result.push(...page)
			if (page.length < 100) return result
		}
	}
	const api = {
		async complete(item, signal) {
			if (item.kind) return { song: item, album: {} }
			if (item.song || item.isDir || item.mediaType === 'album') {
				const album = (await read('getAlbum', { id: item.id }, signal)).album
				return { song: album?.song?.[0] || {}, album }
			}
			const song = (await read('getSong', { id: item.id }, signal)).song
			return { song, album: song?.albumId ? (await read('getAlbum', { id: song.albumId }, signal)).album : {} }
		},
		async track(track, signal) {
			const songs = await search(track.title, 'song', signal)
			const candidates = songs.filter(s => s.id && (s.musicBrainzId && track.recordingMbid ? s.musicBrainzId === track.recordingMbid : normalized(s.title) === normalized(track.title) && normalized(s.artist) === normalized(track.artist?.name) && s.duration > 0 && track.duration > 0 && Math.abs(s.duration * 1000 - track.duration) <= 2000))
			const local = candidates.length === 1 ? candidates[0] : null
			return { ...track, local, availability: local ? 'Available' : 'Missing' }
		},
		async albumsFor(album, signal) {
			const titles = [...new Set([album.title, album.editionTitle].filter(Boolean))]
			const found = (await Promise.all(titles.map(title => search(title, 'album', signal)))).flat()
			const candidates = [...new Map(found.filter(a => {
				const releaseId = a.musicBrainzReleaseId || a.mbzReleaseId || a.musicBrainzId
				if (album.releaseMbid && releaseId) return releaseId === album.releaseMbid
				return titles.some(title => normalized(a.name || a.title) === normalized(title)) && (!album.artist?.name || normalized(a.artist) === normalized(album.artist.name))
			}).map(a => [a.id, a])).values()]
			const result = []
			for (const candidate of candidates) result.push((await read('getAlbum', { id: candidate.id }, signal)).album)
			return result.filter(Boolean)
		},
		async match(edition, signal) { return matchEdition(edition, await api.albumsFor(edition, signal)) },
		async albumStatus(group, mb, signal) {
			const albums = await api.albumsFor(group, signal)
			let best = { availability: 'Missing', local: null }, uncertain = false
			for (const album of albums) {
				const releaseId = album.musicBrainzReleaseId || album.musicBrainzId
				if (!releaseId) { uncertain = true; continue }
				const edition = await mb.release(releaseId, signal)
				if (edition.releaseGroupMbid !== group.releaseGroupMbid) continue
				const matched = matchEdition(edition, [album])
				if (matched.availability === 'Available') return { ...group, availability: 'Available', local: album, releaseMbid: edition.releaseMbid }
				if (matched.availability === 'Partial') best = { availability: 'Partial', local: album, releaseMbid: edition.releaseMbid }
			}
			return { ...group, ...best, availability: best.availability === 'Missing' && uncertain ? null : best.availability }
		},
		async artist(artist, signal) {
			const candidates = (await search(artist.name, 'artist', signal)).filter(a => a.musicBrainzId ? a.musicBrainzId === artist.mbid : normalized(a.name) === normalized(artist.name))
			if (candidates.length !== 1) return { ...artist, local: null }
			const local = candidates[0]
			const info = (await read('getArtistInfo2', { id: local.id }, signal)).artistInfo2
			return { ...artist, local, biography: info?.biography || '', image: info?.largeImageUrl || null }
		},
	}
	return api
}
