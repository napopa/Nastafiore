import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { CatalogContext } from '../app/contexts/catalog'
import Album from '../app/screens/Catalog/Album'
import Artist from '../app/screens/Catalog/Artist'
jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({}), validateIntegration: x => x }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.example', query: 'mock' }) }))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../app/components/Header', () => () => null)
jest.mock('../app/components/ImageError', () => () => null)
const artist = { kind: 'artist', mbid: 'a', name: 'Artist' }
const album = { kind: 'album', releaseGroupMbid: 'g', title: 'Album', releaseType: 'Album', secondaryTypes: [], artist }
const release = id => ({ ...album, releaseMbid: id, tracks: [1, 2].map(n => ({ kind: 'track', title: `Song ${n}`, recordingMbid: `r${n}`, trackMbid: `t${n}`, position: n, disc: 1, artist })) })
test('album defaults to track order, shows partial availability and switches editions before offering playback', async () => {
	const runtime = { mb: { group: async () => album, editions: async () => ({ items: [{ releaseMbid: 'e1', date: '2000', country: 'US' }, { releaseMbid: 'e2', date: '2001', country: 'GB' }] }), release: async id => release(id) }, lb: { counts: async () => ({ items: { r1: { listens: 1 }, r2: { listens: 9 } } }) }, library: { match: jest.fn(async edition => ({ availability: edition.releaseMbid === 'e1' ? 'Partial' : 'Available', tracks: edition.tracks.map((t, n) => ({ ...t, local: edition.releaseMbid === 'e2' || n === 0 ? { id: `local${n}` } : null })) })) } }
	const value = { runtime, play: jest.fn(), openRequest: jest.fn() }
	const view = render(<CatalogContext.Provider value={value}><Album route={{ params: { album } }} /></CatalogContext.Provider>)
	await waitFor(() => expect(view.getByText('Partial')).toBeTruthy())
	expect(view.getAllByText(/Song/).map(node => node.props.children)).toEqual(['Song 1', 'Song 2'])
	fireEvent.press(view.getByText('Popularity'))
	expect(view.getAllByText(/Song/).map(node => node.props.children)).toEqual(['Song 2', 'Song 1'])
	fireEvent.press(view.getByText(/Edition:/))
	fireEvent.press(view.getByText(/2001.*GB/))
	await waitFor(() => expect(runtime.library.match).toHaveBeenCalledWith(expect.objectContaining({ releaseMbid: 'e2' }), expect.anything()))
	fireEvent.press(await view.findByText('Play album'))
	expect(value.play).toHaveBeenCalledWith([{ id: 'local0' }, { id: 'local1' }])
})
test('artist preserves local biography and groups full discography by release type', async () => {
	const value = { runtime: { mb: { artist: async () => artist, discography: async () => ({ items: [album, { ...album, title: 'Single', releaseGroupMbid: 's', releaseType: 'Single' }] }) }, lb: { counts: async () => ({ items: {} }), topTracks: async () => ({ items: [] }) }, library: { artist: async a => ({ ...a, biography: 'Local biography retained.' }) } }, play: jest.fn(), openRequest: jest.fn() }
	const view = render(<CatalogContext.Provider value={value}><Artist route={{ params: { artist } }} /></CatalogContext.Provider>)
	await waitFor(() => expect(view.getByText('Local biography retained.')).toBeTruthy())
	expect(view.getByText('Discography · Album')).toBeTruthy()
	expect(view.getByText('Discography · Single')).toBeTruthy()
})
