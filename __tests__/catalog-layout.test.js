import React from 'react'
import { Modal, Linking } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { CatalogContext } from '../app/contexts/catalog'
import Artist from '../app/screens/Catalog/Artist'
import Album from '../app/screens/Catalog/Album'
import Row from '../app/components/catalog/Row'
import OptionsPopup from '../app/components/popup/OptionsPopup'
import RequestSheet from '../app/components/catalog/RequestSheet'

jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({}), validateIntegration: x => x }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.example', query: 'mock' }) }))
jest.mock('../app/contexts/settings', () => ({ useSettings: () => ({ isDesktop: false }) }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: x => x }) }))
const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../app/components/ImageError', () => () => null)

const artist = { kind: 'artist', mbid: 'a', name: 'Artist' }
const album = { kind: 'album', releaseGroupMbid: 'g', title: 'Album', date: '2000', releaseType: 'Album', artist }
const track = { kind: 'track', recordingMbid: 'r1', title: 'Song 1', artist, position: 1, disc: 1, availability: 'Missing', local: null }
const wrap = (value, child) => <CatalogContext.Provider value={value}>{child}</CatalogContext.Provider>
const artistContext = (extra = {}) => ({
	play: jest.fn(), openRequest: jest.fn(), runtime: {
		mb: { artist: async id => ({ ...artist, mbid: id, ...extra }), discography: async () => ({ items: [album] }) },
		lb: { counts: async () => ({ items: {} }), topTracks: async () => ({ items: Array.from({ length: 55 }, (_, i) => ({ ...track, title: `Song ${i + 1}`, recordingMbid: `r${i + 1}` })) }) },
		library: { artist: async a => a, track: async t => t },
	},
})
const albumContext = () => ({
	play: jest.fn(), openRequest: jest.fn(), runtime: {
		mb: { group: jest.fn(async () => album), editions: async () => ({ items: [{ releaseMbid: 'e1', date: '2000', country: 'US', format: 'CD' }, { releaseMbid: 'e2', date: '2001', country: 'GB', format: 'Digital', disambiguation: 'Deluxe' }] }), release: jest.fn(async id => ({ ...album, releaseMbid: id, tracks: [track, { ...track, title: 'Song 2', recordingMbid: 'r2', position: 2 }, { ...track, title: 'Song 3', recordingMbid: 'r3', disc: 2 }] })) },
		lb: { counts: async () => ({ items: { r1: { listens: 1 }, r2: { listens: 9 }, r3: { listens: 3 } } }) },
		library: { match: async e => ({ availability: e.releaseMbid === 'e1' ? 'Partial' : 'Available', tracks: e.tracks.map((t, i) => ({ ...t, local: e.releaseMbid === 'e2' || i === 0 ? { id: `local-${i}` } : null })) }) },
	},
})

test('popular tracks start at five, expand to fifty, collapse and reset on artist change', async () => {
	const value = artistContext(), view = render(wrap(value, <Artist route={{ params: { artist } }} />))
	await view.findByText('Song 5')
	expect(view.queryByText('Song 6')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Show more' }))
	expect(view.getByText('Song 50')).toBeTruthy()
	expect(view.queryByText('Song 51')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Show less' }))
	expect(view.queryByText('Song 6')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Show more' }))
	view.rerender(wrap(value, <Artist route={{ params: { artist: { ...artist, mbid: 'b' } } }} />))
	await waitFor(() => expect(view.queryByText('Song 6')).toBeNull())
	await view.findByText('Song 5')
})

test('discovery taps open contextual actions and dismiss before navigation or request review', () => {
	const value = artistContext(), view = render(wrap(value, <Row item={{ ...track, local: { id: 'real' } }} context="discovery" rank={1} />))
	fireEvent.press(view.getByText('Song 1'))
	expect(value.play).not.toHaveBeenCalled()
	fireEvent.press(view.getByRole('button', { name: 'View album' }))
	expect(mockNavigate).toHaveBeenCalledWith('CatalogAlbum', { track: expect.objectContaining({ recordingMbid: 'r1' }) })
	expect(view.queryByText('Request full album')).toBeNull()
	fireEvent.press(view.getByText('Song 1'))
	fireEvent.press(view.getByRole('button', { name: 'Request full album' }))
	expect(value.openRequest).toHaveBeenCalledWith(expect.objectContaining({ recordingMbid: 'r1' }))
	expect(view.queryByText('View album')).toBeNull()
})

test('discovery offers Play only for a matched local item', () => {
	const value = artistContext(), view = render(wrap(value, <Row item={track} context="discovery" />))
	fireEvent.press(view.getByText('Song 1'))
	expect(view.queryByRole('button', { name: 'Play' })).toBeNull()
	fireEvent.press(view.getByText('Cancel'))
	view.rerender(wrap(value, <Row item={{ ...track, local: { id: 'real' } }} context="discovery" />))
	fireEvent.press(view.getByText('Song 1'))
	fireEvent.press(view.getByRole('button', { name: 'Play' }))
	expect(value.play).toHaveBeenCalledWith([{ id: 'real' }])
	expect(view.queryByText('View album')).toBeNull()
})

test('album rows have no acquisition control and missing-track taps have no side effect', () => {
	const value = artistContext(), view = render(wrap(value, <Row item={track} context="album" />))
	expect(view.queryByText('Request full album')).toBeNull()
	fireEvent.press(view.getByText('Song 1'))
	expect(value.openRequest).not.toHaveBeenCalled()
	expect(value.play).not.toHaveBeenCalled()
	view.rerender(wrap(value, <Row item={{ ...track, local: { id: 'real' } }} context="album" />))
	fireEvent.press(view.getByText('Song 1'))
	expect(value.play).toHaveBeenCalledWith([{ id: 'real' }])
})

test('search keeps row playback while its ellipsis exposes secondary actions', () => {
	const value = artistContext(), view = render(wrap(value, <Row item={{ ...track, local: { id: 'real' } }} />))
	fireEvent.press(view.getByText('Song 1'))
	expect(value.play).toHaveBeenCalledWith([{ id: 'real' }])
	expect(view.queryByText('Request full album')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Options for Song 1' }))
	expect(view.getByText('View album')).toBeTruthy()
})

test('external links are labeled and deduplicated in overflow, with unsafe links excluded', async () => {
	const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
	const value = artistContext({ links: [{ type: 'streaming', url: 'https://open.spotify.com/artist/a' }, { type: 'other', url: 'https://open.spotify.com/artist/a' }, { type: 'other', url: 'https://example.org/music' }, { url: 'javascript:alert(1)' }] })
	const view = render(wrap(value, <Artist route={{ params: { artist } }} />))
	await view.findByText('Popular tracks')
	expect(view.queryByText('External links')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Artist options' }))
	fireEvent.press(view.getByText('External links'))
	expect(view.getAllByText('Spotify')).toHaveLength(1)
	expect(view.getByText('example.org')).toBeTruthy()
	fireEvent.press(view.getByText('Spotify'))
	expect(open).toHaveBeenCalledWith('https://open.spotify.com/artist/a')
	expect(value.openRequest).not.toHaveBeenCalled()
	open.mockRestore()
})

test('artist overflow hides links without valid URLs and keeps provenance out of the page', async () => {
	const value = artistContext({ links: [{ url: 'file:///tmp/example' }], metadata: { updatedAt: 1000 } })
	const view = render(wrap(value, <Artist route={{ params: { artist } }} />))
	await view.findByText('Popular tracks')
	expect(view.queryByText(/Metadata updated/)).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Artist options' }))
	expect(view.queryByText('External links')).toBeNull()
	fireEvent.press(view.getByText('Catalog information'))
	expect(view.getByText(/MusicBrainz supplies/)).toBeTruthy()
})

test('album uses one request control, one heading per disc, compact sorting and edition sheet', async () => {
	const value = albumContext(), view = render(wrap(value, <Album route={{ params: { album } }} />))
	await view.findByText('Partial')
	expect(view.getAllByText('Request full album')).toHaveLength(1)
	expect(view.getAllByText('Disc 1')).toHaveLength(1)
	expect(view.getAllByText('Disc 2')).toHaveLength(1)
	fireEvent.press(view.getByRole('button', { name: 'Sort tracks' }))
	fireEvent.press(view.getByRole('button', { name: 'Popularity' }))
	expect(view.queryByText('Disc 1')).toBeNull()
	expect(view.getAllByText(/^Song \d$/).map(t => t.props.children)).toEqual(['Song 2', 'Song 3', 'Song 1'])
	expect(view.getByText('2.1')).toBeTruthy()
	fireEvent.press(view.getByRole('button', { name: 'Select edition' }))
	expect(view.getByRole('button', { name: /2000.*US.*CD/ }).props.accessibilityState.selected).toBe(true)
	fireEvent.press(view.getByRole('button', { name: /2001.*GB.*Digital.*Deluxe/ }))
	await view.findByText('Play album')
	expect(view.queryByText('Request full album')).toBeNull()
	fireEvent.press(view.getByRole('button', { name: 'Album options' }))
	fireEvent.press(view.getByText('Request full album'))
	expect(value.openRequest).toHaveBeenCalledWith(expect.objectContaining({ releaseMbid: 'e2' }))
})

test('recording-only View album keeps ambiguous containing albums explicit', async () => {
	const value = albumContext()
	value.runtime.mb.containingAlbums = jest.fn(async () => [album, { ...album, releaseGroupMbid: 's', title: 'Single', releaseType: 'Single' }])
	const view = render(wrap(value, <Album route={{ params: { track } }} />))
	await view.findByText(/Select.*album/)
	expect(value.runtime.mb.group).not.toHaveBeenCalled()
	fireEvent.press(view.getByRole('button', { name: /Single/ }))
	await waitFor(() => expect(value.runtime.mb.group).toHaveBeenCalledWith('s', expect.anything()))
	await view.findByText('Partial')
	expect(value.openRequest).not.toHaveBeenCalled()
})

test('View album resolves a known release through MusicBrainz without acquisition', async () => {
	const value = albumContext(), view = render(wrap(value, <Album route={{ params: { track: { ...track, releaseMbid: 'e2' } } }} />))
	await view.findByText('Tracks')
	await view.findByText('Play album')
	expect(value.runtime.mb.release).toHaveBeenCalledWith('e2', expect.anything())
	expect(value.runtime.mb.group).toHaveBeenCalledWith('g', expect.anything())
	expect(value.openRequest).not.toHaveBeenCalled()
})

test('catalog options use a separate header and Android back dismisses the sheet', () => {
	const close = jest.fn(), view = render(<OptionsPopup visible close={close} options={[{ name: 'Chosen edition', selected: true }]} catalogHeader={{ title: 'Catalog album', subtitle: 'Catalog artist' }} />)
	expect(view.getByText('Catalog album')).toBeTruthy()
	expect(view.getByText('Catalog artist')).toBeTruthy()
	expect(view.getByRole('button', { name: 'Chosen edition' }).props.accessibilityState.selected).toBe(true)
	fireEvent(view.UNSAFE_getByType(Modal), 'requestClose')
	expect(close).toHaveBeenCalledTimes(1)
})

test('an unavailable library leaves album and track availability unknown', async () => {
	const value = albumContext()
	value.runtime.library.match = async () => { throw new Error('Library offline') }
	const view = render(wrap(value, <Album route={{ params: { album } }} />))
	await waitFor(() => expect(view.getAllByText('Availability unknown')).toHaveLength(4))
	expect(view.queryAllByText('Missing')).toHaveLength(0)
	expect(view.queryByText('Play album')).toBeNull()
	expect(value.openRequest).not.toHaveBeenCalled()
})

test('opening editions from a local album keeps its known release selected', async () => {
	const value = albumContext()
	value.runtime.library.complete = async () => ({ album: { musicBrainzId: 'e2' } })
	const view = render(wrap(value, <Album route={{ params: { localAlbum: { id: 'local-album', name: 'Album' } } }} />))
	await view.findByText('Play album')
	fireEvent.press(view.getByRole('button', { name: 'Select edition' }))
	expect(view.getByRole('button', { name: /2001.*GB.*Digital.*Deluxe/ }).props.accessibilityState.selected).toBe(true)
})

test.each(['original', 'other'])('the containing-album chooser preserves the known edition only for the %s group', async choice => {
	const value = albumContext()
	const single = { ...album, releaseType: 'Single' }, other = { ...album, title: 'Other album', releaseGroupMbid: 'other' }
	value.runtime.mb.group = async id => id === 'g' ? single : other
	value.runtime.mb.containingAlbums = async () => [single, other]
	const view = render(wrap(value, <Album route={{ params: { track: { ...track, releaseMbid: 'e2' } } }} />))
	await view.findByText('Select an album')
	fireEvent.press(view.getByRole('button', { name: choice === 'original' ? /Album.*Single/ : /Other album/ }))
	await view.findByText(choice === 'original' ? 'Play album' : 'Partial')
	fireEvent.press(view.getByRole('button', { name: 'Select edition' }))
	expect(view.getByRole('button', { name: choice === 'original' ? /2001.*GB/ : /2000.*US/ }).props.accessibilityState.selected).toBe(true)
})

test('a name-only artist route clears prior tracks and menus before identity selection', async () => {
	const value = artistContext()
	value.runtime.mb.search = async () => ({ items: [{ ...artist, mbid: 'b', name: 'New identity' }] })
	const view = render(wrap(value, <Artist route={{ params: { artist } }} />))
	await view.findByText('Song 5')
	fireEvent.press(view.getByText('Show more'))
	fireEvent.press(view.getByRole('button', { name: 'Artist options' }))
	view.rerender(wrap(value, <Artist route={{ params: { artist: { kind: 'artist', name: 'Unresolved artist' } } }} />))
	await view.findByText('New identity')
	expect(view.queryByText('Song 50')).toBeNull()
	expect(view.queryByText('Catalog information')).toBeNull()
	expect(view.getByText('Unresolved artist')).toBeTruthy()
	fireEvent.press(view.getByText('New identity'))
	await view.findByText('Song 5')
	expect(view.queryByText('Song 6')).toBeNull()
})

test('request review dismisses through the options-sheet backdrop without submitting', () => {
	const close = jest.fn(), submit = jest.fn()
	const view = render(<RequestSheet request={{ phase: 'review', review: { catalog: album, existing: true, qualityProfile: 'Lossless', metadataProfile: 'Standard', rootFolderPath: '/music' } }} onClose={close} onSubmit={submit} />)
	fireEvent.press(view.getByRole('button', { name: 'Dismiss options' }))
	expect(close).toHaveBeenCalledTimes(1)
	expect(submit).not.toHaveBeenCalled()
})
