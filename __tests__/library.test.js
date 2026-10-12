import { createLibrary } from '../app/catalog/library'
const track = { kind: 'track', recordingMbid: 'rec', title: 'Song', artist: { name: 'Artist' }, duration: 100000 }
test('resolve local request identities from complete song and album responses', async () => {
	const read = jest.fn(async (path, query) => path === 'getSong' ? { song: { id: query.id, albumId: 'album', musicBrainzId: 'rec' } } : { album: { id: 'album', musicBrainzId: 'release', song: [] } })
	const library = createLibrary(read)
	expect(await library.complete({ id: 'local-song' })).toMatchObject({ song: { musicBrainzId: 'rec' }, album: { musicBrainzId: 'release' } })
	expect(read).toHaveBeenCalledWith('getAlbum', { id: 'album' }, undefined)
})
test('catalog track playback uses a unique actual local item and rejects ambiguous matches', async () => {
	const song = { id: 'real-id', title: 'Song', artist: 'Artist', musicBrainzId: 'rec', duration: 100 }
	let songs = [song]
	const library = createLibrary(async () => ({ searchResult3: { song: songs } }))
	expect((await library.track(track)).local.id).toBe('real-id')
	songs = [song, { ...song, id: 'other-id' }]
	expect((await library.track(track)).local).toBeNull()
})
test('album availability reads every local candidate, never infers completion from a search hit', async () => {
	const read = jest.fn(async path => path === 'search3' ? { searchResult3: { album: [{ id: 'a', name: 'Album', artist: 'Artist' }] } } : { album: { id: 'a', musicBrainzId: 'edition', song: [] } })
	const library = createLibrary(read)
	expect(await library.albumsFor({ title: 'Album', artist: { name: 'Artist' } })).toMatchObject([{ song: [] }])
	expect(read).toHaveBeenCalledWith('getAlbum', { id: 'a' }, undefined)
})
test('album requests include the first recording from the complete album response', async () => {
	const library = createLibrary(async () => ({ album: { id: 'album', musicBrainzId: 'single-release', song: [{ id: 'song', musicBrainzId: 'recording' }] } }))
	expect(await library.complete({ id: 'album', mediaType: 'album' })).toMatchObject({ song: { musicBrainzId: 'recording' } })
})
test('catalog album availability verifies local edition identity rather than title alone', async () => {
	const group = { kind: 'album', releaseGroupMbid: 'group', title: 'Album', artist: { name: 'Artist' } }
	const local = { id: 'local-album', name: 'Album', artist: 'Artist', musicBrainzId: 'edition', song: [{ id: 's', title: 'Song', artist: 'Artist', track: 1, musicBrainzId: 'rec', duration: 100 }] }
	const library = createLibrary(async path => path === 'search3' ? { searchResult3: { album: [local] } } : { album: local })
	const mb = { release: async () => ({ ...group, releaseMbid: 'edition', tracks: [{ title: 'Song', position: 1, disc: 1, recordingMbid: 'rec', duration: 100000 }] }) }
	expect(await library.albumStatus(group, mb)).toMatchObject({ availability: 'Available', local: { id: 'local-album' } })
	mb.release = async () => ({ ...group, releaseGroupMbid: 'other', releaseMbid: 'edition', tracks: [] })
	expect((await library.albumStatus(group, mb)).availability).toBe('Missing')
})

test('explicit edition identity survives differing release and group titles', async () => {
 const edition = { title: 'Album', editionTitle: 'Album (Deluxe Edition)', releaseMbid: 'edition', artist: { name: 'Artist' }, tracks: [{ position: 1, recordingMbid: 'rec' }] }
 const local = { id: 'local', name: 'Album (Deluxe Edition)', artist: 'Alternate credit', musicBrainzId: 'edition', song: [{ id: 'song', track: 1, musicBrainzId: 'rec' }] }
 const read = jest.fn(async (path, query) => path === 'search3' ? { searchResult3: { album: query.query === edition.editionTitle ? [local] : [] } } : { album: local })
 expect(await createLibrary(read).match(edition)).toMatchObject({ availability: 'Available', local: { id: 'local' } })
 expect(read).toHaveBeenCalledWith('search3', expect.objectContaining({ query: edition.editionTitle }), undefined)
})
