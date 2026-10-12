import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { CatalogContext } from '../app/contexts/catalog'
import CatalogSettings from '../app/screens/Settings/Catalog'
jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({}), validateIntegration: x => x, lidarrConnection: () => ({ status: async () => ({ version: '3.0' }), settings: async () => ({ roots: [{ path: '/music' }], qualities: [{ id: 1, name: 'Lossless' }], metadata: [{ id: 2, name: 'Standard' }] }) }) }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.example', username: 'a', query: 'mock' }) }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../app/components/Header', () => () => null)
jest.mock('../app/components/ImageError', () => () => null)
test('integration settings check reads options and save only after explicit input', async () => {
	const value = { scope: 'a', ready: true, records: [], integration: null, saveIntegration: jest.fn(async () => {}), disconnect: jest.fn() }
	const view = render(<CatalogContext.Provider value={value}><CatalogSettings /></CatalogContext.Provider>)
	fireEvent.changeText(view.getByPlaceholderText('https://lidarr.example'), 'https://lidarr.example')
	fireEvent.changeText(view.getByPlaceholderText('Lidarr API key'), 'private-key')
	fireEvent.press(view.getByText('Check connection and load settings'))
	await waitFor(() => expect(view.getByText(/Connected to Lidarr/)).toBeTruthy())
	expect(value.saveIntegration).not.toHaveBeenCalled()
	fireEvent.press(view.getByText('Save integrations'))
	await waitFor(() => expect(value.saveIntegration).toHaveBeenCalledWith(expect.objectContaining({ rootFolderPath: '/music', qualityProfileId: 1, metadataProfileId: 2, apiKey: 'private-key' })))
})
