import React from 'react'
import { Pressable, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { CatalogText, CatalogButton, Cover, Counts } from './ui'

export default function Row({ item }) {
	const navigation = useNavigation()
	const catalog = useCatalog()
	const theme = useTheme()
	const open = () => {
		if (item.kind === 'artist') navigation.navigate('CatalogArtist', { artist: item })
		else if (item.kind === 'album') navigation.navigate('CatalogAlbum', { album: item })
		else if (item.local) catalog.play([item.local])
		else catalog.openRequest(item)
	}
	return <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.secondaryBack, gap: 8 }}>
		<Pressable onPress={open} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
			{item.kind === 'album' ? <Cover album={item} size={56} /> : null}
			<View style={{ flex: 1, gap: 3 }}>
				<CatalogText title>{item.title || item.name}</CatalogText>
				<CatalogText>{item.kind === 'artist' ? [item.type, item.country, item.disambiguation].filter(Boolean).join(' · ') : [item.artist?.name, item.date?.slice(0, 4), item.releaseType, item.availability].filter(Boolean).join(' · ')}</CatalogText>
				<Counts value={item.popularity} recording={item.kind === 'track'} />
			</View>
		</Pressable>
		{item.kind === 'track' ? <CatalogButton onPress={() => catalog.openRequest(item)}>Request full album</CatalogButton> : null}
	</View>
}
