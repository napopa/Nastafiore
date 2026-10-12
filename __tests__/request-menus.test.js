import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import OptionsSongsList from '../app/components/options/OptionsSongsList'
import OptionsPlayer from '../app/components/options/OptionsPlayer'
import OptionsQueue from '../app/components/options/OptionsQueue'
const mockOpenRequest = jest.fn()
const mockClose = jest.fn()
jest.mock('../app/contexts/catalog', () => ({ useCatalog: () => ({ openRequest: mockOpenRequest }) }))
jest.mock('../app/contexts/config', () => ({ useConfig: () => ({ url: 'https://nav.mock', query: 'mock' }) }))
jest.mock('../app/contexts/settings', () => ({ useSettings: () => ({}), useSetSettings: () => jest.fn() }))
jest.mock('../app/contexts/song', () => ({ useSong: () => ({ queue: [], index: 0 }), useSongDispatch: () => jest.fn() }))
jest.mock('../app/utils/player', () => ({ playSong: jest.fn(), removeFromQueue: jest.fn() }))
jest.mock('../app/utils/cache', () => ({ isSongCached: async () => false }))
jest.mock('../app/utils/api', () => ({ getApi: jest.fn(), getApiNetworkFirst: jest.fn() }))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: jest.fn() }) }))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: x => x }) }))
jest.mock('../app/components/popup/OptionsPopup', () => {
	const React = require('react'), { Text, Pressable, View } = require('react-native')
	return React.forwardRef(function Popup({ options }, ref) {
		React.useImperativeHandle(ref, () => ({ close: mockClose }))
		return <View>{options.filter(o => !o.hidden).map(o => <Pressable key={o.name} onPress={o.onPress}><Text>{o.name}</Text></Pressable>)}</View>
	})
})
const song = { id: 'real-id', title: 'Song', albumId: 'real-album' }
test.each(['tracks', 'playlist', 'queue', 'now-playing'])('%s menu opens album review using the original local item', async location => {
	const view = render(location === 'queue' ? <OptionsQueue queue={[song]} indexOptions={0} setIndexOptions={() => {}} closePlayer={() => {}} /> : location === 'now-playing' ? <OptionsPlayer song={song} isOpen setIsOpen={() => {}} closePlayer={() => {}} /> : <OptionsSongsList songs={[song]} indexOptions={0} setIndexOptions={() => {}} idPlaylist={location === 'playlist' ? 'playlist' : null} />)
	await waitFor(() => expect(view.getByText('Request full album')).toBeTruthy())
	fireEvent.press(view.getByText('Request full album'))
	expect(mockOpenRequest).toHaveBeenCalledWith(song)
	expect(mockClose).toHaveBeenCalled()
})
