export const createLidarr = request => ({
	artists: () => request('/artist'),
	album: async groupId => (await request(`/album?foreignAlbumId=${encodeURIComponent(groupId)}`)).find(a => a.foreignAlbumId === groupId) || null,
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
	commands: () => request('/command'),
	command: id => request(`/command/${id}`),
	queue: async () => {
		const items = []
		for (let page = 1; ; page++) {
			const data = await request(`/queue?page=${page}&pageSize=100&includeUnknownArtistItems=false&includeArtist=true&includeAlbum=true`)
			items.push(...(data.records || []))
			if (!data.records?.length || items.length >= data.totalRecords) return items
		}
	},
	tracks: id => request(`/track?albumId=${id}`),
	status: () => request('/system/status'),
})
