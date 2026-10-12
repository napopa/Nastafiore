import { createMusicBrainz } from '../app/catalog/musicbrainz'
import { createListenBrainz } from '../app/catalog/listenbrainz'

const artist = { id: 'a', name: 'Artist' }
const group = { id: 'g', title: 'Album', 'primary-type': 'Album', 'artist-credit': [{ artist }] }
const cache = { read: async (_key, load) => ({ data: await load(), updatedAt: 100, stale: false }) }
test('catalog search fetches only selected category and preserves pagination', async () => {
	const request = jest.fn(async () => ({ 'release-groups': [group], count: 90 }))
	const mb = createMusicBrainz({ request, cache })
	expect(await mb.search('albums', 'Album', 25)).toMatchObject({ items: [{ releaseGroupMbid: 'g' }], total: 90, offset: 25 })
	expect(request).toHaveBeenCalledTimes(1)
	expect(request.mock.calls[0][0]).toContain('/release-group?')
	expect(request.mock.calls[0][0]).toContain('offset=25')
})
test('discography and edition browse exhaust all pages and editions contain ordered tracks', async () => {
	const request = jest.fn(async path => {
		if (path.startsWith('/release/r?')) return { id: 'r', title: 'Edition', 'release-group': group, 'artist-credit': [{ artist }], media: [{ position: 1, tracks: [{ id: 't', position: 1, title: 'Song', recording: { id: 'rec', title: 'Song', length: 120000 } }] }] }
		if (path.includes('offset=100')) return { 'release-groups': [{ ...group, id: 'g2' }], 'release-group-count': 101 }
		return { 'release-groups': [group], 'release-group-count': 101 }
	})
	const mb = createMusicBrainz({ request, cache })
	expect((await mb.discography('a')).items).toHaveLength(2)
	expect(await mb.release('r')).toMatchObject({ releaseMbid: 'r', releaseGroupMbid: 'g', tracks: [{ recordingMbid: 'rec', position: 1, disc: 1 }] })
})
test('ListenBrainz batches counts, retains null and uses only public IDs in cache keys', async () => {
	const request = jest.fn(async (_path, opts) => opts.body.recording_mbids.map(id => ({ recording_mbid: id, total_listen_count: null, total_user_count: null })))
	const lb = createListenBrainz({ request, cache })
	const result = await lb.counts('recording', Array.from({ length: 101 }, (_v, n) => `id${n}`))
	expect(result.items.id0).toEqual({ listens: null, listeners: null })
	expect(request).toHaveBeenCalledTimes(2)
	expect(request.mock.calls[0][1]).toMatchObject({ method: 'POST', readOnly: true })
})
test('ListenBrainz outages leave metrics unavailable without losing catalog data', async () => {
	const lb = createListenBrainz({ request: async () => { throw new Error('offline') }, cache })
	expect(await lb.counts('artist', ['a'])).toMatchObject({ items: {}, unavailable: true })
})

test('edition tracklist retains medium format for Lidarr audio selection', async () => {
 const mb = createMusicBrainz({ cache, request: async () => ({ id: 'r', title: 'Edition', 'release-group': group, media: [{ position: 2, format: 'DVD', tracks: [{ id: 'v', position: 1, title: 'Video', recording: { id: 'rec' } }] }] }) })
 expect((await mb.release('r')).tracks[0]).toMatchObject({ mediumFormat: 'DVD', disc: 2 })
})
