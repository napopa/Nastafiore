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
