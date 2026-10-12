import React from 'react'
import { ScrollView, View, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useConfig } from '~/contexts/config'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { resolveAlbums } from '~/catalog/model'
import { urlCover } from '~/utils/url'
import Header from '~/components/Header'
import mainStyles from '~/styles/main'
import Row from '~/components/catalog/Row'
import { CatalogText, CatalogButton, Choices, Cover, Counts, MetadataNote } from '~/components/catalog/ui'

export default function Album({ route: { params } }) {
	const catalog = useCatalog(), theme = useTheme(), insets = useSafeAreaInsets(), config = useConfig(), navigation = useNavigation()
	const [album, setAlbum] = React.useState(params.album || null), [choices, setChoices] = React.useState([]), [editions, setEditions] = React.useState([]), [editionId, setEditionId] = React.useState(null), [data, setData] = React.useState(null)
	const [sort, setSort] = React.useState('Track order'), [showEditions, setShowEditions] = React.useState(false), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(true)
	React.useEffect(() => {
		if (params.album) { setAlbum(params.album); return }
		const controller = new AbortController()
		catalog.runtime.library.complete({ ...params.localAlbum, mediaType: 'album' }, controller.signal).then(complete => resolveAlbums(complete, catalog.runtime.mb, controller.signal)).then(result => {
			if (controller.signal.aborted) return
			if (result.choices.length === 1 && !result.requiresSelection) setAlbum(result.choices[0])
			else { setChoices(result.choices); setBusy(false); if (!result.choices.length) setError('No matching catalog album') }
		}).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setBusy(false) } })
		return () => controller.abort()
	}, [params, catalog.runtime])
	React.useEffect(() => {
		if (!album) return
		const controller = new AbortController()
		setBusy(true); setData(null); setError(''); setEditions([]); setEditionId(null)
		Promise.all([catalog.runtime.mb.group(album.releaseGroupMbid, controller.signal), catalog.runtime.mb.editions(album.releaseGroupMbid, controller.signal)]).then(([group, result]) => {
			if (controller.signal.aborted) return
			setAlbum(previous => ({ ...previous, ...group }))
			setEditions(result.items)
			setEditionId(result.items.find(e => e.releaseMbid === album.releaseMbid)?.releaseMbid || result.items[0]?.releaseMbid || null)
			if (!result.items.length) { setError('No edition tracklist in MusicBrainz'); setBusy(false) }
		}).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setBusy(false) } })
		return () => controller.abort()
	}, [album?.releaseGroupMbid, catalog.runtime])
	React.useEffect(() => {
		if (!editionId) return
		const controller = new AbortController()
		setBusy(true); setData(null); setError('')
		;(async () => {
			try {
				const edition = await catalog.runtime.mb.release(editionId, controller.signal)
				const [matched, tracksPopularity, albumPopularity] = await Promise.all([
					catalog.runtime.library.match(edition, controller.signal).catch(() => ({ availability: null, tracks: edition.tracks, local: null })),
					catalog.runtime.lb.counts('recording', edition.tracks.map(t => t.recordingMbid), controller.signal),
					catalog.runtime.lb.counts('release-group', [edition.releaseGroupMbid], controller.signal),
				])
				if (controller.signal.aborted) return
				setData({ edition, ...matched, tracks: matched.tracks.map(t => ({ ...t, popularity: tracksPopularity.items[t.recordingMbid] })), popularity: albumPopularity.items[edition.releaseGroupMbid], popMetadata: tracksPopularity.metadata })
			} catch (failure) { if (!controller.signal.aborted) setError(failure.message) }
			finally { if (!controller.signal.aborted) setBusy(false) }
		})()
		return () => controller.abort()
	}, [editionId, catalog.runtime])
	const edition = editions.find(e => e.releaseMbid === editionId)
	const tracks = sort === 'Popularity' ? [...(data?.tracks || [])].sort((a, b) => (b.popularity?.listens ?? -1) - (a.popularity?.listens ?? -1)) : data?.tracks || []
	return <ScrollView style={mainStyles.mainContainer(theme)} contentContainerStyle={[mainStyles.contentMainContainer(insets), { paddingHorizontal: 20, paddingBottom: 100, gap: 14 }]}>
		<Header title={album?.title || params.localAlbum?.name || 'Catalog album'} />
		{choices.length && !album ? choices.map(a => <CatalogButton key={a.releaseGroupMbid} onPress={() => setAlbum(a)}>{a.title} · {a.artist?.name} · {a.releaseType}</CatalogButton>) : null}
		{album ? <>
			<Cover album={data?.edition || album} uri={data?.local ? urlCover(config, data.local) : undefined} />
			<CatalogText title>{album.title}</CatalogText>
			{album.artist ? <CatalogButton onPress={() => navigation.navigate('CatalogArtist', { artist: album.artist })}>{album.artist.name}</CatalogButton> : null}
			<CatalogText>{[album.date?.slice(0, 4), album.releaseType, ...(album.secondaryTypes || [])].filter(Boolean).join(' · ')}</CatalogText>
			<Counts value={data?.popularity} />
			<CatalogText title>{data?.availability || (busy ? 'Checking availability…' : 'Availability unavailable')}</CatalogText>
			<CatalogButton onPress={() => catalog.openRequest({ ...album, releaseMbid: editionId })}>Request full album</CatalogButton>
			{data?.availability === 'Available' && data.tracks.every(t => t.local) ? <CatalogButton selected onPress={() => catalog.play(data.tracks.map(t => t.local))}>Play album</CatalogButton> : null}
			<CatalogButton onPress={() => setShowEditions(!showEditions)}>Edition: {[edition?.date, edition?.country, edition?.disambiguation, edition?.format].filter(Boolean).join(' · ') || 'Select'}</CatalogButton>
			{showEditions ? <View style={{ gap: 8 }}>{editions.map(e => <CatalogButton key={e.releaseMbid} selected={e.releaseMbid === editionId} onPress={() => { setEditionId(e.releaseMbid); setShowEditions(false) }}>{[e.date, e.country, e.disambiguation, e.format, `${e.trackCount ?? '?'} tracks`, e.status].filter(Boolean).join(' · ')}</CatalogButton>)}</View> : null}
			<Choices values={['Track order', 'Popularity']} value={sort} onChange={setSort} />
			<CatalogText>ListenBrainz recording totals can span multiple releases.</CatalogText>
			<MetadataNote metadata={data?.edition.metadata || album.metadata} /><MetadataNote metadata={data?.popMetadata} label="ListenBrainz totals" />
			{tracks.map(t => <View key={t.trackMbid || `${t.disc}-${t.position}`}><CatalogText>Disc {t.disc} · Track {t.position}</CatalogText><Row item={t} /></View>)}
		</> : null}
		{busy ? <ActivityIndicator color={theme.primaryTouch} /> : null}
		{error ? <CatalogText>{error}</CatalogText> : null}
	</ScrollView>
}
