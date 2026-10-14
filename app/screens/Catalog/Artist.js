import React from 'react'
import { ScrollView, ActivityIndicator, View, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConfig } from '~/contexts/config'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { urlCover } from '~/utils/url'
import PresHeader from '~/components/PresHeader'
import OptionsPopup from '~/components/popup/OptionsPopup'
import Information from '~/components/catalog/Information'
import { externalLinks } from '~/components/catalog/links'
import mainStyles from '~/styles/main'
import Row from '~/components/catalog/Row'
import { CatalogText, CatalogButton, Counts } from '~/components/catalog/ui'

export default function Artist({ route: { params } }) {
	const catalog = useCatalog(), theme = useTheme(), insets = useSafeAreaInsets(), config = useConfig()
	const [selected, setSelected] = React.useState(params.artist), [choices, setChoices] = React.useState([]), [data, setData] = React.useState(null), [sort, setSort] = React.useState('Release date'), [busy, setBusy] = React.useState(true), [error, setError] = React.useState('')
	const [albumStatuses, setAlbumStatuses] = React.useState({}), [visibleCounts, setVisibleCounts] = React.useState({})
	const checkedAlbums = React.useRef(new Set())
	const [expanded, setExpanded] = React.useState(false), [menu, setMenu] = React.useState(null)
	const identity = selected?.mbid || selected?.name
	React.useEffect(() => { setSelected(params.artist) }, [params.artist])
	React.useEffect(() => {
		setBusy(true); setError(''); setData(null); setChoices([]); setAlbumStatuses({}); checkedAlbums.current = new Set(); setVisibleCounts({}); setExpanded(false); setMenu(null)
	}, [identity, catalog.runtime])
	React.useEffect(() => {
		if (selected?.mbid) return
		const controller = new AbortController()
		catalog.runtime.mb.search('artists', selected?.name || '', 0, controller.signal).then(result => { if (!controller.signal.aborted) { setChoices(result.items); setBusy(false); if (!result.items.length) setError('No catalog artist match') } }).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setBusy(false) } })
		return () => controller.abort()
	}, [selected, catalog.runtime])
	React.useEffect(() => {
		if (!selected?.mbid) return
		const controller = new AbortController()
		;(async () => {
			try {
				const [artist, discography] = await Promise.all([catalog.runtime.mb.artist(selected.mbid, controller.signal), catalog.runtime.mb.discography(selected.mbid, controller.signal)])
				if (controller.signal.aborted) return
				setData({ artist, albums: discography.items, tracks: [], popularity: null, metadata: discography.metadata })
				setBusy(false)
				catalog.runtime.library.artist(artist, controller.signal).then(localArtist => {
					if (!controller.signal.aborted) setData(previous => ({ ...previous, artist: localArtist }))
				}).catch(() => {})
				const [top, artistCounts, albumCounts] = await Promise.all([catalog.runtime.lb.topTracks(selected.mbid, controller.signal), catalog.runtime.lb.counts('artist', [selected.mbid], controller.signal), catalog.runtime.lb.counts('release-group', discography.items.map(a => a.releaseGroupMbid), controller.signal)])
				if (controller.signal.aborted) return
				const tracks = top.items.slice(0, 50).map(t => ({ ...t, availability: null, local: null }))
				setData(previous => ({ ...previous, albums: discography.items.map(a => ({ ...a, popularity: albumCounts.items[a.releaseGroupMbid] })), tracks, popularity: artistCounts.items[selected.mbid], popMetadata: top.metadata || artistCounts.metadata, rankingUnavailable: top.unavailable }))
				for (let offset = 0; offset < tracks.length && !controller.signal.aborted; offset += 4) {
					const batch = await Promise.all(tracks.slice(offset, offset + 4).map(track => catalog.runtime.library.track(track, controller.signal).catch(() => track)))
					if (!controller.signal.aborted) setData(previous => ({ ...previous, tracks: previous.tracks.map(track => batch.find(t => t.recordingMbid === track.recordingMbid) || track) }))
				}
			} catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
			finally { if (!controller.signal.aborted) setBusy(false) }
		})()
		return () => controller.abort()
	}, [selected?.mbid, catalog.runtime])
	const groups = {}
	for (const album of data?.albums || []) { const type = [album.releaseType, ...(album.secondaryTypes || [])].join(' / '); (groups[type] ||= []).push(album) }
	for (const group of Object.values(groups)) group.sort((a, b) => sort === 'Popularity' ? (b.popularity?.listens ?? -1) - (a.popularity?.listens ?? -1) : (b.date || '').localeCompare(a.date || ''))
	React.useEffect(() => {
		if (!data || !config.query || !catalog.runtime.library.albumStatus) return
		const controller = new AbortController()
		const visible = Object.entries(groups).flatMap(([type, albums]) => albums.slice(0, visibleCounts[type] || 25)).filter(a => !checkedAlbums.current.has(a.releaseGroupMbid))
		;(async () => {
			for (let offset = 0; offset < visible.length && !controller.signal.aborted; offset += 4) {
				const batch = await Promise.all(visible.slice(offset, offset + 4).map(album => catalog.runtime.library.albumStatus(album, catalog.runtime.mb, controller.signal).catch(() => album)))
				if (!controller.signal.aborted) {
					for (const album of batch) checkedAlbums.current.add(album.releaseGroupMbid)
					setAlbumStatuses(previous => ({ ...previous, ...Object.fromEntries(batch.map(album => [album.releaseGroupMbid, album])) }))
				}
			}
		})()
		return () => controller.abort()
	}, [data?.albums, visibleCounts, sort, catalog.runtime, config.query])
	const artist = data?.artist || selected
	const links = externalLinks(artist?.links)
	const options = menu === 'links' ? links.map(link => ({ name: link.name, icon: 'external-link', onPress: () => { setMenu(null); Linking.openURL(link.url) } })) : menu === 'sort' ? ['Release date', 'Popularity'].map(value => ({ name: value, icon: 'sort', selected: value === sort, onPress: () => { setSort(value); setMenu(null) } })) : menu === 'info' ? [] : [
		{ name: 'External links', icon: 'external-link', hidden: !links.length, onPress: () => setMenu('links') },
		{ name: 'Catalog information', icon: 'info-circle', onPress: () => setMenu('info') },
	]
	return <>
		<ScrollView style={mainStyles.mainContainer(theme)} contentContainerStyle={mainStyles.contentMainContainer(insets, false)}>
			<PresHeader title={artist?.name || 'Catalog artist'} subTitle="Artist" imgSrc={artist?.local ? urlCover(config, artist.local) : artist?.image} optionLabel="Artist options" onPressOption={() => setMenu('options')} />
			<View style={{ marginHorizontal: 20, paddingBottom: 30, gap: 12 }}>
				{!selected?.mbid ? <><CatalogText>Select the artist identity.</CatalogText>{choices.map(a => <CatalogButton key={a.mbid} onPress={() => setSelected(a)}>{[a.name, a.country, a.type, a.disambiguation].filter(Boolean).join(' · ')}</CatalogButton>)}</> : null}
				{data ? <>
					<Counts value={data.popularity} />
					<CatalogText>{[artist.type, artist.country, artist.disambiguation, artist.lifeSpan?.begin, artist.lifeSpan?.end].filter(Boolean).join(' · ')}</CatalogText>
					{artist.biography ? <CatalogText>{artist.biography.replace(/<[^>]*>/g, '')}</CatalogText> : null}
					{artist.genres?.length ? <CatalogText>{artist.genres.map(g => g.name).join(' · ')}</CatalogText> : null}
					<CatalogText title>Popular tracks</CatalogText>
					<CatalogText>ListenBrainz · total listens across releases</CatalogText>
					{data.rankingUnavailable || !data.tracks.length ? <CatalogText>ListenBrainz rankings unavailable</CatalogText> : <View>{data.tracks.slice(0, expanded ? 50 : 5).map((track, index) => <Row key={track.recordingMbid} item={track} context="discovery" rank={index + 1} />)}</View>}
					{!data.rankingUnavailable && data.tracks.length > 5 ? <CatalogButton compact onPress={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Show more'}</CatalogButton> : null}
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
						<CatalogText title style={{ flex: 1 }}>Discography</CatalogText>
						<CatalogButton compact icon="sort" accessibilityLabel="Sort discography" onPress={() => setMenu('sort')}>{sort}</CatalogButton>
					</View>
					<CatalogText>ListenBrainz · release group totals</CatalogText>
					{Object.entries(groups).map(([type, albums]) => <View key={type} style={{ gap: 8 }}><CatalogText variant="group">{type}</CatalogText>{albums.slice(0, visibleCounts[type] || 25).map(a => <Row key={a.releaseGroupMbid} item={albumStatuses[a.releaseGroupMbid] || a} />)}{albums.length > (visibleCounts[type] || 25) ? <CatalogButton compact onPress={() => setVisibleCounts(previous => ({ ...previous, [type]: (previous[type] || 25) + 25 }))}>More {type} releases</CatalogButton> : null}</View>)}
				</> : null}
				{busy ? <ActivityIndicator color={theme.primaryTouch} /> : null}{error ? <CatalogText>{error}</CatalogText> : null}
			</View>
		</ScrollView>
		<OptionsPopup visible={!!menu} close={() => setMenu(null)} catalogHeader={{ title: { links: 'External links', sort: 'Sort discography', info: 'Catalog information' }[menu] || artist?.name, subtitle: artist?.name }} options={options}>
			{menu === 'info' ? <Information metadata={[artist?.metadata, data?.metadata]} popularityMetadata={data?.popMetadata} /> : null}
		</OptionsPopup>
	</>
}
