const credit = item => (item['artist-credit'] || []).filter(c => c.artist).map(c => artistFromMB(c.artist))
export const artistFromMB = item => ({ kind: 'artist', mbid: item.id, name: item.name, disambiguation: item.disambiguation || '', country: item.country, type: item.type, lifeSpan: item['life-span'], popularity: null, local: null })
export const albumFromMB = item => ({ kind: 'album', releaseGroupMbid: item.id, title: item.title, artist: credit(item)[0] || null, artists: credit(item), date: item['first-release-date'] || '', releaseType: item['primary-type'] || 'Other', secondaryTypes: item['secondary-types'] || [], disambiguation: item.disambiguation || '', popularity: null, availability: 'Missing', local: null })
export const trackFromMB = item => ({ kind: 'track', recordingMbid: item.id, title: item.title, artist: credit(item)[0] || null, duration: item.length, popularity: null, availability: 'Missing', local: null })
export const popularity = item => ({ listens: item?.total_listen_count ?? null, listeners: item?.total_user_count ?? null })
export const normalized = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export const specialRelease = album => album?.releaseType === 'Single' || album?.releaseType === 'EP' || album?.secondaryTypes?.includes('Compilation') || album?.releaseType === 'Compilation'

const matchesTrack = (track, song, albumArtist) => {
	if (!song.id || song.isDir) return false
	if (Number(song.track) !== Number(track.position) || Number(song.discNumber || 1) !== Number(track.disc || 1)) return false
	if (song.musicBrainzId && track.recordingMbid) return song.musicBrainzId === track.recordingMbid
	return normalized(song.title) === normalized(track.title) && normalized(song.artist) === normalized(track.artist?.name || albumArtist?.name) && track.duration > 0 && song.duration > 0 && Math.abs(song.duration * 1000 - track.duration) <= 2000
}

export const matchEdition = (edition, localAlbums) => {
	let best = { availability: 'Missing', tracks: (edition.tracks || []).map(t => ({ ...t, local: null, availability: 'Missing' })), local: null }
	for (const album of localAlbums) {
		const releaseId = album.musicBrainzReleaseId || album.mbzReleaseId || album.musicBrainzId
		if (releaseId && releaseId !== edition.releaseMbid) continue
		const used = new Set()
		const tracks = (edition.tracks || []).map(track => {
			const candidates = (album.song || []).filter(s => !used.has(s.id) && matchesTrack(track, s, edition.artist))
			const local = candidates.length === 1 ? candidates[0] : null
			if (local) used.add(local.id)
			return { ...track, local, availability: local ? 'Available' : 'Missing' }
		})
		const count = tracks.filter(t => t.local).length
		const full = count > 0 && count === tracks.length && (releaseId === edition.releaseMbid || (album.song || []).length === tracks.length)
		if (count > best.tracks.filter(t => t.local).length) best = { availability: full ? 'Available' : 'Partial', tracks, local: album }
	}
	return best
}

export const resolveAlbums = async ({ album = {}, song = {} }, mb, signal) => {
	let choices = []
	const groupId = album.musicBrainzReleaseGroupId || song.musicBrainzReleaseGroupId || song.releaseGroupMbid
	const releaseId = album.musicBrainzReleaseId || album.musicBrainzId || song.releaseMbid
	if (groupId) choices = [await mb.group(groupId, signal)]
	else if (releaseId) {
		const release = await mb.release(releaseId, signal)
		choices = [await mb.group(release.releaseGroupMbid, signal)]
	}
	const taggedSpecial = specialRelease(choices[0]) || album.isCompilation || (album.releaseTypes || []).some(t => ['Single', 'EP', 'Compilation'].includes(t))
	const recordingId = song.recordingMbid || song.musicBrainzId
	if (recordingId && (!choices.length || taggedSpecial)) choices.push(...await mb.containingAlbums(recordingId, signal))
	if (!choices.length) choices = await mb.searchAlbums(album.name || album.title || song.album || song.title, album.artist || song.artist?.name || song.artist, signal)
	choices = [...new Map(choices.filter(Boolean).map(a => [a.releaseGroupMbid, a])).values()]
	return { choices, requiresSelection: taggedSpecial || choices.length !== 1 }
}
