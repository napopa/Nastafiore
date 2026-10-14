import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaInsetsContext, SafeAreaFrameContext } from 'react-native-safe-area-context'
import Navigation from '../app/components/Navigation'

jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.example', query: 'mock' }) }))
jest.mock('../app/contexts/settings', () => ({ useSettings: () => ({ isDesktop: false }) }))
jest.mock('../app/contexts/theme', () => ({ useTheme: () => ({ primaryText: '#fff', secondaryText: '#aaa', primaryBack: '#111', secondaryBack: '#222', primaryTouch: '#f00', innerTouch: '#fff' }) }))
jest.mock('../app/contexts/song', () => ({ useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn() }))
jest.mock('../app/catalog/storage', () => ({ integrationStore: { load: async () => null } }))
jest.mock('../app/catalog/runtime', () => ({ createCatalogRuntime: () => ({ acquisition: null }), validateIntegration: x => x }))
jest.mock('../app/components/bar/TabBar', () => () => null)
jest.mock('../app/components/ImageError', () => () => null)
jest.mock('react-native-edge-to-edge', () => ({ SystemBars: () => null }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: x => x }) }))
jest.mock('../app/screens/Stacks', () => {
	const React = require('react'), { Pressable, Text } = require('react-native')
	const { useCatalog } = require('../app/contexts/catalog')
	const HomeStack = () => {
		const catalog = useCatalog()
		return <Pressable onPress={() => catalog.openRequest({ kind: 'album', releaseGroupMbid: 'g', title: 'Album' })}><Text>Review album</Text></Pressable>
	}
	return { HomeStack, SearchStack: () => null, PlaylistsStack: () => null, SettingsStack: () => null }
})

test('request sheets opened from root screens receive real navigation and safe-area contexts', async () => {
	const view = render(<SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: 390, height: 844 }}><SafeAreaInsetsContext.Provider value={{ top: 20, bottom: 10, left: 0, right: 0 }}><Navigation /></SafeAreaInsetsContext.Provider></SafeAreaFrameContext.Provider>)
	fireEvent.press(await view.findByText('Review album'))
	await view.findByText(/Configure Lidarr/)
	fireEvent.press(view.getByText('Close'))
	expect(view.queryByText('Request full album')).toBeNull()
})
