import React from 'react'
import { Text, Pressable } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { CatalogProvider, useCatalog } from '../app/contexts/catalog'
import { playSong } from '../app/utils/player'
let mockConfig = { url: 'https://nav.example', query: 'mock', username: 'a' }
jest.mock('../app/contexts/config', () => ({ useConfig: () => mockConfig }))
jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({}), validateIntegration: x => x }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/components/ImageError', () => () => null)
const album = { kind: 'album', releaseGroupMbid: 'group', title: 'Album', artist: { mbid: 'artist', name: 'Artist' }, releaseType: 'Album' }
const Consumer = () => {
	const catalog = useCatalog()
	return <><Text>{catalog?.integration?.apiKey || 'no-integration'}</Text><Pressable onPress={() => catalog.openRequest(album)}><Text>Request test album</Text></Pressable></>
}
test('opening and submitting a reviewed request leaves existing playback untouched', async () => {
	const acquisition = { list: async () => [], review: jest.fn(async () => ({ catalog: album, rootFolderPath: '/music' })), submit: jest.fn(async () => ({ catalog: album, groupId: 'group', stage: 'Searching' })) }
	const runtime = { acquisition }
	const store = { load: async () => ({ apiKey: 'private' }) }
	const view = render(<CatalogProvider store={store} runtimeFactory={() => runtime}><Consumer /></CatalogProvider>)
	await waitFor(() => expect(view.getByText('private')).toBeTruthy())
	fireEvent.press(view.getByText('Request test album'))
	await waitFor(() => expect(view.getByText('Confirm album request')).toBeTruthy())
	expect(acquisition.submit).not.toHaveBeenCalled()
	fireEvent.press(view.getByText('Confirm album request'))
	await waitFor(() => expect(view.getByText('Searching')).toBeTruthy())
	expect(acquisition.submit).toHaveBeenCalledTimes(1)
	expect(playSong).not.toHaveBeenCalled()
})
test('server/user switch hides old credentials immediately and discards delayed load', async () => {
	const pending = {}
	const store = { load: config => new Promise(resolve => { pending[config.username] = resolve }) }
	const factory = () => ({ acquisition: null })
	const view = render(<CatalogProvider store={store} runtimeFactory={factory}><Consumer /></CatalogProvider>)
	mockConfig = { ...mockConfig, username: 'b' }
	view.rerender(<CatalogProvider store={store} runtimeFactory={factory}><Consumer /></CatalogProvider>)
	pending.a({ apiKey: 'old-key' })
	pending.b(null)
	await waitFor(() => expect(view.getByText('no-integration')).toBeTruthy())
	expect(view.queryByText('old-key')).toBeNull()
	mockConfig = { ...mockConfig, username: 'a' }
})
test('catalog playback rejects stale local matches after a server switch', async () => {
 const { integrationScope } = require('../app/catalog/integrations')
 const oldScope = integrationScope(mockConfig)
 const Probe = () => { const catalog = useCatalog(); return <Pressable onPress={() => catalog.play([{ id: 'old-item', catalogScope: oldScope }])}><Text>Play old item</Text></Pressable> }
 const store = { load: async () => null }, factory = () => ({ acquisition: null })
 const view = render(<CatalogProvider store={store} runtimeFactory={factory}><Probe /></CatalogProvider>)
 await waitFor(() => expect(view.getByText('Play old item')).toBeTruthy())
 mockConfig = { ...mockConfig, username: 'different-user' }
 view.rerender(<CatalogProvider store={store} runtimeFactory={factory}><Probe /></CatalogProvider>)
 playSong.mockClear()
 fireEvent.press(view.getByText('Play old item'))
 expect(playSong).not.toHaveBeenCalled()
 mockConfig = { ...mockConfig, username: 'a' }
 view.unmount()
})
