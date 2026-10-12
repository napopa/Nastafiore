import { createAcquisition } from '../app/catalog/acquisition'
import { createLidarr } from '../app/catalog/lidarr'

const album = { kind: 'album', releaseGroupMbid: 'group', title: 'Album', artist: { mbid: 'artist', name: 'Artist' }, releaseType: 'Album', secondaryTypes: [] }
const settings = { rootFolderPath: '/music', qualityProfileId: 1, metadataProfileId: 2 }
const profile = { id: 2, name: 'Standard', primaryAlbumTypes: [{ albumType: { name: 'Album' }, allowed: true }], secondaryAlbumTypes: [{ albumType: { name: 'Studio' }, allowed: true }], releaseStatuses: [{ releaseStatus: { name: 'Official' }, allowed: true }] }
const edition = { ...album, releaseMbid: 'release', editionDate: '2021', country: 'GB', editionTitle: 'Acquired edition', tracks: [1, 2].map(n => ({ trackMbid: `t${n}`, recordingMbid: `r${n}`, position: n, disc: 1 })) }
const fixture = (existing = null) => {
	let artists = existing ? [existing] : [], remote = null, command = null, queue = [], tracks = []
	const lookup = { foreignAlbumId: 'group', title: 'Album', albumType: 'Album', secondaryTypes: [], artist: { foreignArtistId: 'artist', artistName: 'Artist' }, releases: [{ foreignReleaseId: 'release', status: 'Official', trackCount: 2, monitored: true }] }
	const writes = []
	const lidarr = {
		artists: async () => artists,
		album: async () => remote,
		lookupAlbum: async () => [lookup],
		lookupArtist: async () => [lookup.artist],
		settings: async () => ({ roots: [{ path: '/music' }], qualities: [{ id: 1, name: 'Lossless' }], metadata: [profile] }),
		addArtist: jest.fn(async value => { writes.push(['artist', value]); const artist = { ...value, id: 1 }; artists.push(artist); return artist }),
		addAlbum: jest.fn(async value => { writes.push(['album', value]); remote = { ...value, id: 9, artistId: 1 }; return remote }),
		monitor: jest.fn(async id => { writes.push(['monitor', id]); remote.monitored = true }),
		search: jest.fn(async id => { writes.push(['search', id]); command = { id: 5, name: 'AlbumSearch', body: { albumIds: [id] }, status: 'queued', started: new Date().toISOString() }; return command }),
		commands: async () => command ? [command] : [],
		command: async () => command,
		queue: async () => queue,
		tracks: async () => tracks,
	}
	let records = []
	const journal = { load: async () => records, save: async data => { records = JSON.parse(JSON.stringify(data)) } }
	let available = false
	const library = { match: async () => ({ availability: available ? 'Available' : 'Missing', tracks: available ? [{ local: { id: 'real' } }] : [] }) }
	const mb = { release: async () => edition }
	const acquisition = createAcquisition({ lidarr, mb, library, journal, isActive: () => true })
	return { acquisition, lidarr, writes, journal, mb, library, setCommand: v => { command = v }, setQueue: v => { queue = v }, setTracks: v => { tracks = v }, setAvailable: v => { available = v }, setRemote: v => { remote = v } }
}

test('new artist monitors no other or future albums and searches only selected album', async () => {
	const f = fixture()
	const review = await f.acquisition.review(album, settings)
	await f.acquisition.submit(review)
	expect(f.writes[0]).toEqual(['artist', expect.objectContaining({ monitored: true, monitorNewItems: 'none', addOptions: { monitor: 'none', searchForMissingAlbums: false } })])
	expect(f.writes[1][1]).toMatchObject({ foreignAlbumId: 'group', monitored: true, addOptions: { searchForNewAlbum: false } })
	expect(f.writes.filter(w => w[0] === 'search')).toEqual([['search', 9]])
})
test.each([true, false])('existing artist monitored=%s retains profiles, path and state', async monitored => {
	const existing = { id: 1, foreignArtistId: 'artist', monitored, path: '/existing/path', qualityProfileId: 1, metadataProfileId: 2 }
	const f = fixture(existing)
	f.setRemote({ id: 9, artistId: 1, foreignAlbumId: 'group', monitored: false, ...{ releases: [{ foreignReleaseId: 'release', status: 'Official', trackCount: 2 }] } })
	const review = await f.acquisition.review(album, settings)
	expect(review).toMatchObject({ paused: !monitored, rootFolderPath: '/existing/path' })
	await f.acquisition.submit(review)
	expect(f.lidarr.addArtist).not.toHaveBeenCalled()
	expect(f.writes).toEqual([['monitor', 9], ['search', 9]])
	expect(existing).toMatchObject({ monitored, path: '/existing/path', qualityProfileId: 1, metadataProfileId: 2 })
})
test('absent lookup, excluded metadata profile and unsupported edition perform no writes', async () => {
	for (const kind of ['absent', 'excluded', 'edition']) {
		const f = fixture()
		if (kind === 'absent') f.lidarr.lookupAlbum = async () => []
		if (kind === 'excluded') f.lidarr.settings = async () => ({ roots: [{ path: '/music' }], qualities: [{ id: 1 }], metadata: [{ ...profile, primaryAlbumTypes: [{ albumType: { name: 'Album' }, allowed: false }] }] })
		await expect(f.acquisition.review(kind === 'edition' ? { ...album, releaseMbid: 'unsupported' } : album, settings)).rejects.toThrow('Unavailable in Lidarr')
		expect(f.writes).toEqual([])
	}
})
test('repeated taps and restored journal do not repeat acquisition writes or searches', async () => {
	const f = fixture()
	const review = await f.acquisition.review(album, settings)
	await Promise.all([f.acquisition.submit(review), f.acquisition.submit(review)])
	await f.acquisition.submit(review)
	expect(f.lidarr.search).toHaveBeenCalledTimes(1)
	const restored = createAcquisition({ lidarr: f.lidarr, mb: f.mb, library: f.library, journal: f.journal, isActive: () => true })
	await restored.submit(review)
	expect(f.lidarr.search).toHaveBeenCalledTimes(1)
})
test('artist creation committed before timeout is reconciled and never replayed', async () => {
	const f = fixture()
	const add = f.lidarr.addArtist
	f.lidarr.addArtist = jest.fn(async value => { await add(value); throw Object.assign(new Error('timeout'), { uncertain: true }) })
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	expect(f.lidarr.addArtist).toHaveBeenCalledTimes(1)
	expect(f.lidarr.search).toHaveBeenCalledTimes(1)
})
test('uncertain command creation reconciles from remote commands rather than resubmitting', async () => {
	const f = fixture()
	const search = f.lidarr.search
	f.lidarr.search = jest.fn(async id => { await search(id); throw Object.assign(new Error('timeout'), { uncertain: true }) })
	const review = await f.acquisition.review(album, settings)
	const result = await f.acquisition.submit(review)
	expect(result.commandId).toBe(5)
	await f.acquisition.submit(review)
	expect(f.lidarr.search).toHaveBeenCalledTimes(1)
})
test('uncertain write without visible remote state remains uncertain on restart', async () => {
	const f = fixture()
	f.lidarr.addArtist = jest.fn(async () => { throw Object.assign(new Error('timeout'), { uncertain: true }) })
	const review = await f.acquisition.review(album, settings)
	expect((await f.acquisition.submit(review)).stage).toBe('Uncertain')
	const restored = createAcquisition({ lidarr: f.lidarr, mb: f.mb, library: f.library, journal: f.journal, isActive: () => true })
	await restored.submit(review)
	expect(f.lidarr.addArtist).toHaveBeenCalledTimes(1)
})
test('no source found and failed imports stay manual, no foreground read causes search', async () => {
	const f = fixture()
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	f.setCommand({ id: 5, status: 'completed' })
	expect((await f.acquisition.refresh('group')).stage).toBe('No source found')
	f.setQueue([{ albumId: 9, status: 'completed', trackedDownloadStatus: 'warning', statusMessages: [{ title: 'Import failed' }] }])
	expect((await f.acquisition.refresh('group')).stage).toBe('Import failed')
	expect(f.lidarr.search).toHaveBeenCalledTimes(1)
})
test('download completion, a discovery track and wrong acquired edition cannot establish availability', async () => {
	const f = fixture()
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	f.setQueue([{ albumId: 9, status: 'completed' }])
	f.setTracks([{ hasFile: true, foreignTrackId: 't1' }])
	f.setAvailable(true)
	expect((await f.acquisition.refresh('group')).stage).not.toBe('Available')
	f.setTracks([1, 2].map(n => ({ hasFile: true, foreignTrackId: `t${n}` })))
	f.setAvailable(false)
	expect((await f.acquisition.refresh('group')).stage).toBe('Waiting for Navidrome')
	f.setAvailable(true)
	const completed = await f.acquisition.refresh('group')
	expect(completed.stage).toBe('Available')
	expect(completed.acquiredEdition).toMatchObject({ releaseMbid: 'release', editionDate: '2021', country: 'GB' })
})
test('paused/background app performs no acquisition polling', async () => {
	const f = fixture()
	const controller = createAcquisition({ lidarr: f.lidarr, mb: f.mb, library: f.library, journal: f.journal, isActive: () => false })
	f.lidarr.queue = jest.fn(async () => [])
	await controller.refresh('group')
	expect(f.lidarr.queue).not.toHaveBeenCalled()
})
test('foreground changes during a read stop the next polling requests', async () => {
	const f = fixture()
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	let active = true
	const original = f.lidarr.album
	f.lidarr.album = async id => { active = false; return original(id) }
	f.lidarr.queue = jest.fn(async () => [])
	const controller = createAcquisition({ lidarr: f.lidarr, mb: f.mb, library: f.library, journal: f.journal, isActive: () => active })
	await controller.refresh('group')
	expect(f.lidarr.queue).not.toHaveBeenCalled()
})
test('a partial import is reported separately from search with no source', async () => {
	const f = fixture()
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	f.setCommand({ id: 5, status: 'completed' })
	f.setTracks([{ hasFile: true, foreignTrackId: 't1' }, { hasFile: false, foreignTrackId: 't2' }])
	expect((await f.acquisition.refresh('group')).stage).toBe('Partial import')
})
test('a crash between preparation steps leaves a manual retry instead of freezing forever', async () => {
	const f = fixture()
	await f.journal.save([{ groupId: 'group', catalog: album, stage: 'Preparing', artistId: 1, operation: null }])
	const controller = createAcquisition({ lidarr: f.lidarr, mb: f.mb, library: f.library, journal: f.journal, isActive: () => true })
	expect((await controller.list())[0].stage).toBe('Failed')
})
test('expired command history cannot hide a completed import', async () => {
	const f = fixture()
	await f.acquisition.submit(await f.acquisition.review(album, settings))
	f.lidarr.command = async () => { throw Object.assign(new Error('gone'), { status: 404 }) }
	f.setTracks([1, 2].map(n => ({ hasFile: true, foreignTrackId: `t${n}` })))
	f.setAvailable(true)
	expect((await f.acquisition.refresh('group')).stage).toBe('Available')
})
test('Lidarr adapter uses target-only monitor and manual search resources', async () => {
	const request = jest.fn(async () => [])
	const lidarr = createLidarr(request)
	await lidarr.monitor(9)
	await lidarr.search(9)
	expect(request.mock.calls).toEqual([
		['/album/monitor', { method: 'PUT', body: { albumIds: [9], monitored: true } }],
		['/command', { method: 'POST', body: { name: 'AlbumSearch', albumIds: [9] } }],
	])
})
