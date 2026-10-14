import React from 'react'
import { Pressable, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import IconButton from '~/components/button/IconButton'
import OptionsPopup from '~/components/popup/OptionsPopup'
import mainStyles from '~/styles/main'
import { CatalogText, Cover, Counts, coverUrl } from './ui'

export default function Row({ item, context = 'search', rank, showDisc = false }) {
	const navigation = useNavigation(), catalog = useCatalog(), theme = useTheme()
	const [optionsOpen, setOptionsOpen] = React.useState(false), [hover, setHover] = React.useState(false)
	const title = item.title || item.name
	const dismissThen = action => () => { setOptionsOpen(false); action() }
	const open = () => {
		if (item.kind === 'artist') navigation.navigate('CatalogArtist', { artist: item })
		else if (item.kind === 'album') navigation.navigate('CatalogAlbum', { album: item })
		else if (context === 'discovery') setOptionsOpen(true)
		else if (item.local) catalog.play([item.local])
		else if (context !== 'album') catalog.openRequest(item)
	}
	const number = rank ?? (item.position != null ? (showDisc ? `${item.disc || 1}.${item.position}` : item.position) : null)
	return <>
		<View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 64, backgroundColor: hover ? theme.secondaryBack : 'transparent' }}>
			<Pressable onPress={open} accessibilityRole="button" accessibilityLabel={title} disabled={context === 'album' && !item.local} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={({ pressed }) => [mainStyles.opacity({ pressed }), { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, minHeight: 44, gap: 12 }]}>
				{number != null ? <CatalogText style={{ minWidth: showDisc ? 32 : 20, textAlign: 'center' }}>{String(number)}</CatalogText> : null}
				{item.kind === 'album' ? <Cover album={item} size={50} /> : null}
				<View style={{ flex: 1, gap: 3 }}>
					<CatalogText variant="row" numberOfLines={2}>{title}</CatalogText>
					<CatalogText numberOfLines={2}>{item.kind === 'artist' ? [item.type, item.country, item.disambiguation].filter(Boolean).join(' · ') : [context === 'album' ? null : item.artist?.name, item.date?.slice(0, 4), item.releaseType, item.availability || (item.kind === 'track' ? 'Availability unknown' : null)].filter(Boolean).join(' · ')}</CatalogText>
				</View>
				{item.kind !== 'artist' ? <Counts value={item.popularity} compact /> : null}
			</Pressable>
			{item.kind === 'track' && context !== 'album' ? <IconButton accessibilityLabel={`Options for ${title}`} icon="ellipsis-h" color={theme.secondaryText} style={{ alignItems: 'center' }} onPress={() => setOptionsOpen(true)} /> : null}
		</View>
		{context !== 'album' && item.kind === 'track' ? <OptionsPopup visible={optionsOpen} close={() => setOptionsOpen(false)} catalogHeader={{ title, subtitle: item.artist?.name, image: coverUrl(item) }} options={[
			{ name: 'Play', icon: 'play', hidden: !item.local, onPress: dismissThen(() => catalog.play([item.local])) },
			{ name: 'View album', icon: 'music', onPress: dismissThen(() => navigation.navigate('CatalogAlbum', { track: item })) },
			{ name: 'Request full album', icon: 'download', onPress: dismissThen(() => catalog.openRequest(item)) },
		]} /> : null}
	</>
}
