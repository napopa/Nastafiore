import { abortError } from './shared'

export const createLidarr = request => ({
	artists: signal => request('/artist', { signal }),
	album: async (groupId, signal) => (await request(`/album?foreignAlbumId=${encodeURIComponent(groupId)}`, { signal })).find(a => a.foreignAlbumId === groupId) || null,
	lookupArtist: id => request(`/artist/lookup?term=${encodeURIComponent(`lidarr:${id}`)}`),
	lookupAlbum: id => request(`/album/lookup?term=${encodeURIComponent(`lidarr:${id}`)}`),
	settings: async () => {
		const [roots, qualities, metadata] = await Promise.all([request('/rootfolder'), request('/qualityprofile'), request('/metadataprofile')])
		return { roots, qualities, metadata }
	},
	addArtist: body => request('/artist', { method: 'POST', body }),
	addAlbum: body => request('/album', { method: 'POST', body }),
	monitor: id => request('/album/monitor', { method: 'PUT', body: { albumIds: [id], monitored: true } }),
	search: id => request('/command', { method: 'POST', body: { name: 'AlbumSearch', albumIds: [id] } }),
	commands: signal => request('/command', { signal }),
	command: (id, signal) => request(`/command/${id}`, { signal }),
	queue: async signal => {
		const items = []
		for (let page = 1; ; page++) {
			if (signal?.aborted) throw abortError()
			const data = await request(`/queue?page=${page}&pageSize=100&includeUnknownArtistItems=false&includeArtist=true&includeAlbum=true`, { signal })
			items.push(...(data.records || []))
			if (!data.records?.length || items.length >= data.totalRecords) return items
		}
	},
	tracks: (id, signal) => request(`/track?albumId=${id}`, { signal }),
	status: () => request('/system/status'),
})
