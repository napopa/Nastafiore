import { popularity, trackFromMB } from './model'

export const createListenBrainz = ({ request, cache }) => ({
	async counts(entity, ids, signal) {
		const unique = [...new Set(ids.filter(Boolean))]
		const items = {}
		let metadata
		try {
			for (let offset = 0; offset < unique.length; offset += 100) {
				const batch = unique.slice(offset, offset + 100)
				const key = entity.replace(/-/g, '_')
				const packet = await cache.read(`lb:${entity}:${batch.join(',')}`, loadSignal => request(`/popularity/${entity}`, { method: 'POST', body: { [`${key}_mbids`]: batch }, readOnly: true, signal: loadSignal }), { popularity: true, signal })
				for (const row of packet.data) items[row[`${key}_mbid`]] = popularity(row)
				metadata = { updatedAt: packet.updatedAt, stale: metadata?.stale || packet.stale }
			}
			return { items, metadata }
		} catch (error) {
			if (error.name === 'AbortError') throw error
			return { items, metadata, unavailable: true }
		}
	},
	async topTracks(artistId, signal) {
		try {
			const packet = await cache.read(`lb:top:${artistId}`, loadSignal => request(`/popularity/top-recordings-for-artist/${artistId}`, { signal: loadSignal }), { popularity: true, signal })
			return { items: packet.data.map(r => ({ ...trackFromMB({ id: r.recording_mbid, title: r.recording_name, length: r.length, 'artist-credit': [{ artist: { id: r.artist_mbids?.[0] || artistId, name: r.artist_name } }] }), releaseMbid: r.release_mbid, albumTitle: r.release_name, popularity: popularity(r) })), metadata: { updatedAt: packet.updatedAt, stale: packet.stale } }
		} catch (error) {
			if (error.name === 'AbortError') throw error
			return { items: [], unavailable: true }
		}
	},
})
