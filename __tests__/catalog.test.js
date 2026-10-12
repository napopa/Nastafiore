import { artistFromMB, albumFromMB, trackFromMB, popularity, matchEdition, resolveAlbums } from '../app/catalog/model'

const artist = { id: 'artist-mbid', name: 'Same Name', disambiguation: 'British group' }
const group = { id: 'group-mbid', title: 'Full Album', 'primary-type': 'Album', 'artist-credit': [{ artist }] }
const edition = { releaseMbid: 'edition-a', releaseGroupMbid: 'group-mbid', title: 'Full Album', artist: artistFromMB(artist), tracks: [1, 2].map(n => ({ title: `Track ${n}`, recordingMbid: `r${n}`, disc: 1, position: n, duration: 180000 })) }
const songs = [1, 2].map(n => ({ id: `local-${n}`, albumId: 'local-album', artist: 'Same Name', title: `Track ${n}`, musicBrainzId: `r${n}`, track: n, discNumber: 1, duration: 180 }))

test('catalog identities never masquerade as Navidrome IDs and retain artist disambiguation', () => {
	expect(artistFromMB(artist)).toMatchObject({ kind: 'artist', mbid: 'artist-mbid', disambiguation: 'British group' })
	expect(albumFromMB(group)).toMatchObject({ kind: 'album', releaseGroupMbid: 'group-mbid' })
	expect(trackFromMB({ id: 'rec', title: 'Song', 'artist-credit': [{ artist }] })).toMatchObject({ recordingMbid: 'rec' })
	expect(albumFromMB(group)).not.toHaveProperty('id')
})

test('missing ListenBrainz statistics remain unavailable, and real zero remains zero', () => {
	expect(popularity({ total_listen_count: null, total_user_count: null })).toEqual({ listens: null, listeners: null })
	expect(popularity({ total_listen_count: 0, total_user_count: 3 })).toEqual({ listens: 0, listeners: 3 })
})

test('availability requires the complete edition, with partial and missing distinguished', () => {
	expect(matchEdition(edition, [{ id: 'local-album', musicBrainzId: 'edition-a', song: songs }]).availability).toBe('Available')
	expect(matchEdition(edition, [{ id: 'local-album', musicBrainzId: 'edition-a', song: songs.slice(0, 1) }]).availability).toBe('Partial')
	expect(matchEdition(edition, []).availability).toBe('Missing')
})

test('shared recordings from the wrong edition and duplicate local candidates cannot complete an album', () => {
	expect(matchEdition(edition, [{ id: 'local-album', musicBrainzId: 'edition-b', song: songs }]).availability).toBe('Missing')
	expect(matchEdition(edition, [{ id: 'local-album', song: [...songs, { ...songs[0], id: 'duplicate' }] }]).availability).not.toBe('Available')
	expect(matchEdition({ ...edition, tracks: [] }, [{ song: songs }]).availability).toBe('Missing')
})

test('untagged matches require artist, track order and duration and remain uncertain on missing evidence', () => {
	const untagged = songs.map(({ musicBrainzId: _id, ...song }) => song)
	expect(matchEdition(edition, [{ id: 'local-album', song: untagged }]).availability).toBe('Available')
	expect(matchEdition(edition, [{ song: untagged.map(s => ({ ...s, duration: undefined })) }]).availability).toBe('Missing')
	expect(matchEdition(edition, [{ song: untagged.map(s => ({ ...s, artist: 'Other artist' })) }]).availability).toBe('Missing')
})

test('explicit album identity wins over search, and recording metadata is the next fallback', async () => {
	const mb = { group: jest.fn(async () => albumFromMB(group)), release: jest.fn(), containingAlbums: jest.fn(async () => [albumFromMB(group)]), searchAlbums: jest.fn(async () => []) }
	expect((await resolveAlbums({ album: { musicBrainzReleaseGroupId: 'group-mbid' }, song: {} }, mb)).choices).toHaveLength(1)
	expect(mb.searchAlbums).not.toHaveBeenCalled()
	await resolveAlbums({ song: { musicBrainzId: 'recording' } }, mb)
	expect(mb.containingAlbums).toHaveBeenCalledWith('recording', undefined)
})

test.each(['Single', 'Compilation'])('%s retains the tagged release and requires selection among containing albums', async type => {
	const tagged = { ...albumFromMB(group), releaseGroupMbid: 'tagged', releaseType: type, secondaryTypes: type === 'Compilation' ? ['Compilation'] : [] }
	const mb = { group: async () => tagged, containingAlbums: async () => [albumFromMB(group)], searchAlbums: async () => [] }
	const result = await resolveAlbums({ album: { musicBrainzReleaseGroupId: 'tagged', releaseTypes: [type] }, song: { musicBrainzId: 'recording' } }, mb)
	expect(result.choices.map(a => a.releaseGroupMbid)).toEqual(['tagged', 'group-mbid'])
	expect(result.requiresSelection).toBe(true)
})

test('same-title album matches from different artists remain a chooser', async () => {
	const mb = { searchAlbums: async () => [albumFromMB(group), albumFromMB({ ...group, id: 'other', 'artist-credit': [{ artist: { ...artist, id: 'other-artist' } }] })] }
	expect((await resolveAlbums({ album: { name: 'Full Album', artist: 'Same Name' }, song: {} }, mb)).requiresSelection).toBe(true)
})
