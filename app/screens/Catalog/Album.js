import React from 'react'
import { ScrollView, View, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useConfig } from '~/contexts/config'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { resolveAlbums } from '~/catalog/model'
import { urlCover } from '~/utils/url'
import PresHeader from '~/components/PresHeader'
import OptionsPopup from '~/components/popup/OptionsPopup'
import Information from '~/components/catalog/Information'
import mainStyles from '~/styles/main'
import Row from '~/components/catalog/Row'
import { CatalogText, CatalogButton, Counts, coverUrl, editionLabel } from '~/components/catalog/ui'

export default function Album({ route: { params } }) {
	const catalog = useCatalog(), theme = useTheme(), insets = useSafeAreaInsets(), config = useConfig(), navigation = useNavigation()
	const [album, setAlbum] = React.useState(params.album || null), [choices, setChoices] = React.useState([]), [editions, setEditions] = React.useState([]), [editionId, setEditionId] = React.useState(null), [data, setData] = React.useState(null)
	const [sort, setSort] = React.useState('Track order'), [menu, setMenu] = React.useState(null), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(true)
	React.useEffect(() => {
		setChoices([]); setError(''); setMenu(null); setSort('Track order')
		if (params.album) { setAlbum(params.album); return }
		const controller = new AbortController()
		setAlbum(null); setBusy(true)
		;(async () => {
			try {
				const complete = params.track ? { song: params.track } : await catalog.runtime.library.complete({ ...params.localAlbum, mediaType: 'album' }, controller.signal)
				const knownRelease = params.track?.releaseMbid || complete.album?.musicBrainzReleaseId || complete.album?.musicBrainzId
				const knownEdition = knownRelease ? await catalog.runtime.mb.release(knownRelease, controller.signal) : null
				const result = await resolveAlbums(knownEdition ? { ...complete, album: { ...complete.album, musicBrainzReleaseGroupId: knownEdition.releaseGroupMbid } } : complete, catalog.runtime.mb, controller.signal)
				if (controller.signal.aborted) return
				const matches = result.choices.map(choice => ({ ...choice, releaseMbid: choice.releaseGroupMbid === knownEdition?.releaseGroupMbid ? knownRelease : choice.releaseMbid }))
				if (matches.length === 1 && !result.requiresSelection) setAlbum(matches[0])
				else { setChoices(matches); setBusy(false); if (!matches.length) setError('No matching catalog album') }
			} catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setBusy(false) } }
		})()
		return () => controller.abort()
	}, [params, catalog.runtime])
	React.useEffect(() => {
		if (!album) return
		const controller = new AbortController()
		setBusy(true); setData(null); setError(''); setEditions([]); setEditionId(null); setMenu(null)
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
					catalog.runtime.library.match(edition, controller.signal).catch(() => ({ availability: null, tracks: edition.tracks.map(track => ({ ...track, availability: null, local: null })), local: null })),
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
	const trackOrder = [...(data?.tracks || [])].sort((a, b) => (a.disc || 1) - (b.disc || 1) || a.position - b.position)
	const tracks = sort === 'Popularity' ? [...trackOrder].sort((a, b) => (b.popularity?.listens ?? -1) - (a.popularity?.listens ?? -1)) : trackOrder
	const playable = data?.availability === 'Available' && trackOrder.length > 0 && trackOrder.every(track => track.local)
	const request = () => { setMenu(null); catalog.openRequest({ ...album, releaseMbid: editionId }) }
	const options = menu === 'edition' ? editions.map(e => ({ name: editionLabel(e), selected: e.releaseMbid === editionId, icon: 'circle-o', onPress: () => { setEditionId(e.releaseMbid); setMenu(null) } })) : menu === 'sort' ? ['Track order', 'Popularity'].map(value => ({ name: value, selected: value === sort, icon: 'sort', onPress: () => { setSort(value); setMenu(null) } })) : menu === 'info' ? [] : [
		{ name: 'Request full album', icon: 'download', hidden: !playable, onPress: request },
		{ name: 'Catalog information', icon: 'info-circle', onPress: () => setMenu('info') },
	]
	return <>
		<ScrollView style={mainStyles.mainContainer(theme)} contentContainerStyle={mainStyles.contentMainContainer(insets, false)}>
			<PresHeader title={album?.title || params.localAlbum?.name || 'Catalog album'} subTitle={album?.artist?.name} imgSrc={data?.local ? urlCover(config, data.local) : coverUrl(data?.edition || album)} optionLabel="Album options" onPressOption={album ? () => setMenu('options') : null} onPressTitle={album?.artist ? () => navigation.navigate('CatalogArtist', { artist: album.artist }) : null} />
			<View style={{ marginHorizontal: 20, paddingBottom: 30, gap: 12 }}>
				{choices.length && !album ? <><CatalogText title>Select an album</CatalogText><CatalogText>Choose the album containing {params.track?.title || params.localAlbum?.name}. Singles and compilations remain explicit options.</CatalogText>{choices.map(a => <CatalogButton key={a.releaseGroupMbid} onPress={() => setAlbum(a)}>{[a.title, a.artist?.name, a.date?.slice(0, 4), a.releaseType, ...(a.secondaryTypes || []), a.disambiguation].filter(Boolean).join(' · ')}</CatalogButton>)}</> : null}
				{album ? <>
					<CatalogText>{[album.date?.slice(0, 4), album.releaseType, ...(album.secondaryTypes || [])].filter(Boolean).join(' · ')}</CatalogText>
					<CatalogText>{data?.availability || (busy ? 'Checking availability…' : 'Availability unknown')}</CatalogText>
					<Counts value={data?.popularity} />
					<View style={{ alignItems: 'flex-start' }}>{playable ? <CatalogButton icon="play" primary onPress={() => catalog.play(trackOrder.map(t => t.local))}>Play album</CatalogButton> : <CatalogButton compact icon="download" onPress={request}>Request full album</CatalogButton>}</View>
					<CatalogButton compact icon="circle-o" accessibilityLabel="Select edition" onPress={() => setMenu('edition')} disabled={!editions.length}>Edition</CatalogButton>
					<CatalogText>{editionLabel(edition)}</CatalogText>
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}><CatalogText title style={{ flex: 1 }}>Tracks</CatalogText><CatalogButton compact icon="sort" accessibilityLabel="Sort tracks" onPress={() => setMenu('sort')}>{sort}</CatalogButton></View>
					<CatalogText>ListenBrainz · recording totals across releases</CatalogText>
					<View>{tracks.map((track, index) => <View key={track.trackMbid || `${track.disc}-${track.position}-${track.recordingMbid}`}>
						{sort === 'Track order' && (!index || tracks[index - 1].disc !== track.disc) ? <CatalogText variant="group" style={{ marginTop: 12, marginBottom: 8 }}>Disc {track.disc || 1}</CatalogText> : null}
						<Row item={track} context="album" showDisc={sort === 'Popularity'} />
					</View>)}</View>
				</> : null}
				{busy ? <ActivityIndicator color={theme.primaryTouch} /> : null}{error ? <CatalogText>{error}</CatalogText> : null}
			</View>
		</ScrollView>
		<OptionsPopup visible={!!menu} close={() => setMenu(null)} catalogHeader={{ title: { edition: 'Edition', sort: 'Sort tracks', info: 'Catalog information' }[menu] || album?.title, subtitle: album?.artist?.name }} options={options}>
			{menu === 'info' ? <Information metadata={[album?.metadata, data?.edition.metadata]} popularityMetadata={data?.popMetadata} /> : null}
		</OptionsPopup>
	</>
}
