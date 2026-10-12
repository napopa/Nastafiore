import { artistFromMB, albumFromMB, trackFromMB } from './model'

const queryString = query => Object.entries(query).filter(([_key, value]) => value !== undefined).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
const quote = text => `"${String(text || '').replace(/[\\"]/g, '\\$&')}"`
const stamp = result => ({ updatedAt: result.updatedAt, stale: result.stale })

export const createMusicBrainz = ({ request, cache }) => {
	const read = (entity, query, signal) => {
		const path = `/${entity}?${queryString({ ...query, fmt: 'json' })}`
		return cache.read(`mb:${path}`, () => request(path, { signal }))
	}
	const browse = async (entity, query, listKey, signal) => {
		let items = [], offset = 0, total = Infinity, metadata
		while (offset < total) {
			const packet = await read(entity, { ...query, limit: 100, offset }, signal)
			const page = packet.data[listKey] || []
			items.push(...page)
			total = packet.data[`${entity}-count`] ?? packet.data.count ?? items.length
			metadata = { ...stamp(packet), stale: metadata?.stale || packet.stale }
			if (!page.length) break
			offset += 100
		}
		return { items, metadata }
	}
	const api = {
		async search(category, text, offset = 0, signal) {
			const [entity, key, normalize] = { artists: ['artist', 'artists', artistFromMB], albums: ['release-group', 'release-groups', albumFromMB], tracks: ['recording', 'recordings', trackFromMB] }[category]
			const packet = await read(entity, { query: text, limit: 25, offset }, signal)
			return { items: (packet.data[key] || []).map(normalize), total: packet.data.count ?? packet.data[`${entity}-count`] ?? 0, offset, metadata: stamp(packet) }
		},
		async searchAlbums(title, artist, signal) {
			const result = await api.search('albums', `releasegroup:${quote(title)}${artist ? ` AND artist:${quote(artist)}` : ''}`, 0, signal)
			return result.items
		},
		async group(id, signal) {
			const packet = await read(`release-group/${id}`, { inc: 'artist-credits' }, signal)
			return { ...albumFromMB(packet.data), metadata: stamp(packet) }
		},
		async artist(id, signal) {
			const packet = await read(`artist/${id}`, { inc: 'url-rels+genres' }, signal)
			return { ...artistFromMB(packet.data), genres: packet.data.genres || [], links: (packet.data.relations || []).filter(r => r.url).map(r => ({ type: r.type, url: r.url.resource })), metadata: stamp(packet) }
		},
		async discography(id, signal) {
			const result = await browse('release-group', { artist: id, inc: 'artist-credits' }, 'release-groups', signal)
			return { ...result, items: result.items.map(albumFromMB) }
		},
		async editions(groupId, signal) {
			const result = await browse('release', { 'release-group': groupId, inc: 'artist-credits+media+labels' }, 'releases', signal)
			return { ...result, items: result.items.map(r => ({ releaseMbid: r.id, title: r.title, date: r.date, country: r.country, status: r.status, disambiguation: r.disambiguation, trackCount: (r.media || []).reduce((sum, m) => sum + (m['track-count'] || 0), 0), format: (r.media || []).map(m => m.format).filter(Boolean).join(', ') })).sort((a, b) => (a.status === 'Official' ? -1 : 1) - (b.status === 'Official' ? -1 : 1) || (a.date || '').localeCompare(b.date || '')) }
		},
		async release(id, signal) {
			const packet = await read(`release/${id}`, { inc: 'recordings+artist-credits+release-groups+media' }, signal)
			const r = packet.data
			const group = albumFromMB({ ...r['release-group'], 'artist-credit': r['artist-credit'] })
			return { ...group, releaseMbid: r.id, editionTitle: r.title, editionDate: r.date, country: r.country, status: r.status, tracks: (r.media || []).flatMap(m => (m.tracks || []).map(t => ({ ...trackFromMB({ ...t.recording, title: t.title || t.recording?.title, 'artist-credit': t['artist-credit'] || t.recording?.['artist-credit'] || r['artist-credit'], length: t.length ?? t.recording?.length }), trackMbid: t.id, position: t.position, disc: m.position, releaseMbid: r.id, releaseGroupMbid: group.releaseGroupMbid }))), metadata: stamp(packet) }
		},
		async containingAlbums(recordingId, signal) {
			const result = await browse('release', { recording: recordingId, inc: 'release-groups+artist-credits' }, 'releases', signal)
			return [...new Map(result.items.filter(r => r['release-group']).map(r => {
				const group = albumFromMB({ ...r['release-group'], 'artist-credit': r['artist-credit'] })
				return [group.releaseGroupMbid, { ...group, metadata: result.metadata }]
			})).values()]
		},
	}
	return api
}
