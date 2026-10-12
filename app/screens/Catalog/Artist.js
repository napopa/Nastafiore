import React from 'react'
import { ScrollView, ActivityIndicator, View, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConfig } from '~/contexts/config'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { urlCover } from '~/utils/url'
import Header from '~/components/Header'
import mainStyles from '~/styles/main'
import Row from '~/components/catalog/Row'
import { CatalogText, CatalogButton, Choices, Cover, Counts, MetadataNote } from '~/components/catalog/ui'

export default function Artist({ route: { params } }) {
	const catalog = useCatalog(), theme = useTheme(), insets = useSafeAreaInsets(), config = useConfig()
	const [selected, setSelected] = React.useState(params.artist), [choices, setChoices] = React.useState([]), [data, setData] = React.useState(null), [sort, setSort] = React.useState('Release date'), [busy, setBusy] = React.useState(true), [error, setError] = React.useState('')
	React.useEffect(() => {
		if (selected?.mbid) return
		const controller = new AbortController()
		catalog.runtime.mb.search('artists', selected?.name || '', 0, controller.signal).then(result => { if (!controller.signal.aborted) { setChoices(result.items); setBusy(false); if (!result.items.length) setError('No catalog artist match') } }).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setBusy(false) } })
		return () => controller.abort()
	}, [selected, catalog.runtime])
	React.useEffect(() => {
		if (!selected?.mbid) return
		const controller = new AbortController()
		setBusy(true); setError(''); setData(null)
		;(async () => {
			try {
				const [artist, discography, top, artistCounts] = await Promise.all([catalog.runtime.mb.artist(selected.mbid, controller.signal), catalog.runtime.mb.discography(selected.mbid, controller.signal), catalog.runtime.lb.topTracks(selected.mbid, controller.signal), catalog.runtime.lb.counts('artist', [selected.mbid], controller.signal)])
				const [localArtist, albumCounts] = await Promise.all([catalog.runtime.library.artist(artist, controller.signal).catch(() => artist), catalog.runtime.lb.counts('release-group', discography.items.map(a => a.releaseGroupMbid), controller.signal)])
				const tracks = []
				for (const track of top.items) tracks.push(await catalog.runtime.library.track(track, controller.signal).catch(() => ({ ...track, availability: null })))
				if (!controller.signal.aborted) setData({ artist: localArtist, albums: discography.items.map(a => ({ ...a, popularity: albumCounts.items[a.releaseGroupMbid] })), tracks, popularity: artistCounts.items[selected.mbid], metadata: discography.metadata, popMetadata: top.metadata || artistCounts.metadata, rankingUnavailable: top.unavailable })
			} catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
			finally { if (!controller.signal.aborted) setBusy(false) }
		})()
		return () => controller.abort()
	}, [selected?.mbid, catalog.runtime])
	const groups = {}
	for (const album of data?.albums || []) { const type = [album.releaseType, ...(album.secondaryTypes || [])].join(' / '); (groups[type] ||= []).push(album) }
	for (const group of Object.values(groups)) group.sort((a, b) => sort === 'Popularity' ? (b.popularity?.listens ?? -1) - (a.popularity?.listens ?? -1) : (b.date || '').localeCompare(a.date || ''))
	const artist = data?.artist || selected
	return <ScrollView style={mainStyles.mainContainer(theme)} contentContainerStyle={[mainStyles.contentMainContainer(insets), { paddingHorizontal: 20, paddingBottom: 100, gap: 14 }]}>
		<Header title={artist?.name || 'Catalog artist'} />
		{!selected?.mbid ? <><CatalogText>Select the artist identity.</CatalogText>{choices.map(a => <CatalogButton key={a.mbid} onPress={() => setSelected(a)}>{[a.name, a.country, a.type, a.disambiguation].filter(Boolean).join(' · ')}</CatalogButton>)}</> : null}
		{data ? <>
			<Cover uri={artist.local ? urlCover(config, artist.local) : artist.image} />
			<CatalogText title>{artist.name}</CatalogText><Counts value={data.popularity} />
			<CatalogText>{[artist.type, artist.country, artist.disambiguation, artist.lifeSpan?.begin, artist.lifeSpan?.end].filter(Boolean).join(' · ')}</CatalogText>
			{artist.biography ? <CatalogText>{artist.biography.replace(/<[^>]*>/g, '')}</CatalogText> : null}
			{artist.genres?.length ? <CatalogText>{artist.genres.map(g => g.name).join(' · ')}</CatalogText> : null}
			{artist.links?.filter(l => /^https?:\/\//.test(l.url)).map(l => <CatalogButton key={l.url} onPress={() => Linking.openURL(l.url)}>{l.type}</CatalogButton>)}
			<CatalogText title>Popular tracks</CatalogText><CatalogText>Ranked by ListenBrainz total listens across releases.</CatalogText>
			{data.rankingUnavailable || !data.tracks.length ? <CatalogText>ListenBrainz rankings unavailable</CatalogText> : data.tracks.map(t => <Row key={t.recordingMbid} item={t} />)}
			<Choices values={['Release date', 'Popularity']} value={sort} onChange={setSort} />
			{Object.entries(groups).map(([type, albums]) => <View key={type} style={{ gap: 8 }}><CatalogText title>Discography · {type}</CatalogText>{albums.map(a => <Row key={a.releaseGroupMbid} item={a} />)}</View>)}
			<MetadataNote metadata={data.metadata} /><MetadataNote metadata={data.popMetadata} label="ListenBrainz totals" />
		</> : null}
		{busy ? <ActivityIndicator color={theme.primaryTouch} /> : null}{error ? <CatalogText>{error}</CatalogText> : null}
	</ScrollView>
}
