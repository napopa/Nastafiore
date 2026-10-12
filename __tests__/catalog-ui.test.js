import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { CatalogContext } from '../app/contexts/catalog'
import Search from '../app/components/catalog/Search'
import Row from '../app/components/catalog/Row'
import RequestSheet from '../app/components/catalog/RequestSheet'
jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({}), validateIntegration: x => x }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.example', query: 'mock', username: 'a' }) }))
jest.mock('../app/contexts/settings', () => ({ useSettings: () => ({ isDesktop: false }) }))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../app/utils/api', () => ({ getApi: jest.fn(async () => ({ searchResult3: { artist: [] } })) }))
jest.mock('../app/components/lists/SongsList', () => () => null)
jest.mock('../app/components/lists/HorizontalArtists', () => () => null)
jest.mock('../app/components/lists/HorizontalAlbums', () => () => null)
jest.mock('../app/components/ImageError', () => () => null)

const album = { kind: 'album', releaseGroupMbid: 'g', title: 'Full Album', artist: { mbid: 'a', name: 'Artist' }, releaseType: 'Album', date: '2020' }
const context = overrides => ({ scope: 'a', openRequest: jest.fn(), play: jest.fn(), runtime: { mb: { search: jest.fn(async (_category, _query, offset) => ({ items: offset ? [] : [{ kind: 'artist', mbid: 'a', name: 'Artist' }], total: 50, metadata: { updatedAt: Date.now() } })) }, lb: { counts: async () => ({ items: {} }) }, library: { track: async t => t } }, ...overrides })
const wrap = (value, child) => <CatalogContext.Provider value={value}>{child}</CatalogContext.Provider>

test('Catalog search fetches only chosen category, paginates and cancels outdated reads', async () => {
	const value = context()
	const view = render(wrap(value, <Search />))
	fireEvent.press(view.getByText('Catalog'))
	fireEvent.changeText(view.getByPlaceholderText('Search catalog'), 'Artist')
	await waitFor(() => expect(value.runtime.mb.search).toHaveBeenCalledWith('artists', 'Artist', 0, expect.anything()))
	fireEvent.press(view.getByText('Albums'))
	await waitFor(() => expect(value.runtime.mb.search).toHaveBeenCalledWith('albums', 'Artist', 0, expect.anything()))
	fireEvent.press(await view.findByText('Load more'))
	await waitFor(() => expect(value.runtime.mb.search).toHaveBeenCalledWith('albums', 'Artist', 25, expect.anything()))
	const signal = value.runtime.mb.search.mock.calls.at(-1)[3]
	view.unmount()
	expect(signal.aborted).toBe(true)
})
test('available catalog track plays its actual local item; missing track opens full album review', () => {
	const value = context()
	const track = { kind: 'track', recordingMbid: 'r', title: 'Song', artist: album.artist, availability: 'Available', local: { id: 'real-item' } }
	const view = render(wrap(value, <Row item={track} />))
	fireEvent.press(view.getByText('Song'))
	expect(value.play).toHaveBeenCalledWith([{ id: 'real-item' }])
	view.rerender(wrap(value, <Row item={{ ...track, local: null, availability: 'Missing' }} />))
	fireEvent.press(view.getByText('Song'))
	expect(value.openRequest).toHaveBeenCalledWith(expect.objectContaining({ recordingMbid: 'r' }))
})
test('library browsing remains reachable without a search query', async () => {
	const view = render(wrap(context(), <Search />))
	await act(async () => {})
	await waitFor(() => expect(view.getByText('Browse artists')).toBeTruthy())
})
test('ambiguous request sheet requires album selection and review before mutation', () => {
	const onChoose = jest.fn(), onSubmit = jest.fn()
	const view = render(<RequestSheet request={{ phase: 'choose', choices: [album, { ...album, releaseGroupMbid: 'other', title: 'Tagged Single', releaseType: 'Single' }] }} onChoose={onChoose} onSubmit={onSubmit} onClose={() => {}} />)
	expect(view.queryByText('Confirm album request')).toBeNull()
	fireEvent.press(view.getByText('Full Album'))
	expect(onChoose).toHaveBeenCalledWith(album)
	expect(onSubmit).not.toHaveBeenCalled()
	view.rerender(<RequestSheet request={{ phase: 'review', review: { catalog: album, existing: true, paused: true, qualityProfile: 'Lossless', metadataProfile: 'Standard', rootFolderPath: '/music', remote: { monitored: false } } }} onChoose={onChoose} onSubmit={onSubmit} onClose={() => {}} />)
	expect(view.getByText(/Artist remains paused/)).toBeTruthy()
	fireEvent.press(view.getByText('Confirm album request'))
	expect(onSubmit).toHaveBeenCalledTimes(1)
})
test('status sheet offers Play only after verified import and exposes manual retry for no source', () => {
	const onPlay = jest.fn()
	const view = render(<RequestSheet request={{ phase: 'status', record: { catalog: album, stage: 'No source found' } }} onPlay={onPlay} onClose={() => {}} />)
	expect(view.queryByText('Play')).toBeNull()
	expect(view.getByText('Review and retry manually')).toBeTruthy()
	view.rerender(<RequestSheet request={{ phase: 'status', record: { catalog: album, stage: 'Available', acquiredEdition: { editionDate: '2021', country: 'GB' }, playable: [{ id: 'real' }] } }} onPlay={onPlay} onClose={() => {}} />)
	expect(view.getByText(/Acquired edition: 2021.*GB/)).toBeTruthy()
	fireEvent.press(view.getByText('Play'))
	expect(onPlay).toHaveBeenCalledTimes(1)
})

test('server switch clears prior playable results and resets pagination', async () => {
 const { getApi } = require('../app/utils/api')
 getApi.mockImplementation(async (_config, _path, params) => ({ searchResult3: { song: Array.from({ length: 25 }, (_v, n) => ({ id: `A${params.songOffset + n}` })) } }))
 const first = context()
 const view = render(wrap(first, <Search />))
 fireEvent.press(view.getByText('Tracks'))
 fireEvent.changeText(view.getByPlaceholderText('Search library'), 'Song')
 fireEvent.press(await view.findByText('Load more'))
 await waitFor(() => expect(getApi).toHaveBeenLastCalledWith(expect.anything(), 'search3', expect.objectContaining({ songOffset: 25 })))
 getApi.mockClear()
 view.rerender(wrap(context({ scope: 'b' }), <Search />))
 expect(view.UNSAFE_getByType(require('../app/components/lists/SongsList')).props.songs).toEqual([])
 await waitFor(() => expect(getApi).toHaveBeenCalledWith(expect.anything(), 'search3', expect.objectContaining({ songOffset: 0 })))
})
