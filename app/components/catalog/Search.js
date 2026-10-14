import React from 'react'
import { View, ScrollView, ActivityIndicator } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { useConfig } from '~/contexts/config'
import { useTheme } from '~/contexts/theme'
import { useCatalog } from '~/contexts/catalog'
import { getApi } from '~/utils/api'
import HorizontalArtists from '~/components/lists/HorizontalArtists'
import HorizontalAlbums from '~/components/lists/HorizontalAlbums'
import SongsList from '~/components/lists/SongsList'
import IconButton from '~/components/button/IconButton'
import OptionsPopup from '~/components/popup/OptionsPopup'
import mainStyles from '~/styles/main'
import Row from './Row'
import Information from './Information'
import { SearchSelector, SearchField, SearchLink } from './SearchControls'
import { CatalogText } from './ui'

export default function Search() {
	const config = useConfig(), theme = useTheme(), catalog = useCatalog(), insets = useSafeAreaInsets()
	const navigation = useNavigation()
	const [mode, setMode] = React.useState('Library'), [category, setCategory] = React.useState('artists'), [query, setQuery] = React.useState(''), [offset, setOffset] = React.useState(0)
	const [items, setItems] = React.useState([]), [total, setTotal] = React.useState(0), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [metadata, setMetadata] = React.useState(null), [popMetadata, setPopMetadata] = React.useState(null)
	const [history, setHistory] = React.useState([])
	const [informationOpen, setInformationOpen] = React.useState(false)
	const [resultScope, setResultScope] = React.useState(catalog.scope)
	React.useEffect(() => { setOffset(0); setItems([]); setTotal(0); setMetadata(null); setPopMetadata(null); setError(''); setResultScope(catalog.scope) }, [catalog.scope])
	React.useEffect(() => { AsyncStorage.getItem('search.history').then(value => { try { setHistory(JSON.parse(value || '[]').filter(v => typeof v === 'string').slice(0, 12)) } catch { setHistory([]) } }) }, [])
	React.useEffect(() => {
		const controller = new AbortController()
		setError('')
		if (query.trim().length < 2) { setItems([]); setBusy(false); setTotal(0); return () => controller.abort() }
		setBusy(true)
		const timer = setTimeout(async () => {
			try {
				let result, page
				if (mode === 'Catalog') {
					result = await catalog.runtime.mb.search(category, query.trim(), offset, controller.signal)
					const entity = { artists: 'artist', albums: 'release-group', tracks: 'recording' }[category]
					const counts = await catalog.runtime.lb.counts(entity, result.items.map(i => i.mbid || i.releaseGroupMbid || i.recordingMbid), controller.signal)
					page = result.items.map(i => ({ ...i, popularity: counts.items[i.mbid || i.releaseGroupMbid || i.recordingMbid] }))
					if (category === 'tracks' && config.query) {
						for (let start = 0; start < page.length; start += 4) {
							const matched = await Promise.all(page.slice(start, start + 4).map(i => catalog.runtime.library.track(i, controller.signal).catch(() => ({ ...i, availability: null }))))
							page.splice(start, matched.length, ...matched)
						}
					}
					if (!controller.signal.aborted) setPopMetadata(counts.metadata)
				} else {
					if (!config.query) throw new Error('Connect to Navidrome to search the library')
					const key = { artists: 'artist', albums: 'album', tracks: 'song' }[category]
					const response = await getApi(config, 'search3', { query: query.trim(), artistCount: 0, albumCount: 0, songCount: 0, [`${key}Count`]: 25, [`${key}Offset`]: offset })
					page = response.searchResult3?.[key] || []
					result = { total: page.length === 25 ? offset + 26 : offset + page.length }
				}
				if (controller.signal.aborted) return
				setItems(previous => offset ? [...previous, ...page] : page)
				setResultScope(catalog.scope)
				setTotal(result.total)
				setMetadata(result.metadata)
				if (mode === 'Catalog' && category === 'albums' && config.query && catalog.runtime.library.albumStatus) {
					for (let start = 0; start < page.length && !controller.signal.aborted; start += 4) {
						const matched = await Promise.all(page.slice(start, start + 4).map(item => catalog.runtime.library.albumStatus(item, catalog.runtime.mb, controller.signal).catch(() => item)))
						if (!controller.signal.aborted) setItems(previous => previous.map(item => matched.find(m => m.releaseGroupMbid === item.releaseGroupMbid) || item))
					}
				}
			} catch (failure) { if (!controller.signal.aborted) setError(failure.message || 'Search unavailable') }
			finally { if (!controller.signal.aborted) setBusy(false) }
		}, 350)
		return () => { clearTimeout(timer); controller.abort() }
	}, [mode, category, query, offset, catalog.runtime, catalog.scope, config.url, config.query])
	const remember = async () => {
		const text = query.trim()
		if (!text) return
		const next = [text, ...history.filter(h => h !== text)].slice(0, 12)
		setHistory(next)
		const old = JSON.parse(await AsyncStorage.getItem('search.history') || '[]')
		await AsyncStorage.setItem('search.history', JSON.stringify([...next, ...old.filter(h => typeof h !== 'string')]))
	}
	const change = (setter, value) => { setOffset(0); setItems([]); setTotal(0); setMetadata(null); setPopMetadata(null); setInformationOpen(false); setter(value) }
	const visibleItems = resultScope === catalog.scope ? items : []
	const emptyQuery = !query.trim()
	return <View style={[mainStyles.mainContainer(theme), mainStyles.contentMainContainer(insets), { paddingBottom: 0 }]}>
		<View style={{ flexDirection: 'row', alignItems: 'center', maxWidth: 680 }}>
			<CatalogText variant="page" style={[mainStyles.mainTitle(theme), { flex: 1 }]}>Search</CatalogText>
			{mode === 'Catalog' ? <IconButton icon="info-circle" accessibilityLabel="Catalog information" color={theme.secondaryText} style={{ alignItems: 'center', marginRight: 20 }} onPress={() => setInformationOpen(true)} /> : null}
		</View>
		<View style={{ paddingHorizontal: 20, gap: 16, maxWidth: 680 }}>
			<SearchSelector tabs values={['Library', 'Catalog']} value={mode} onChange={value => change(setMode, value)} />
			<SearchField mode={mode} query={query} onChange={value => change(setQuery, value)} onSubmit={remember} />
			<SearchSelector values={[{ value: 'artists', label: 'Artists' }, { value: 'albums', label: 'Albums' }, { value: 'tracks', label: 'Tracks' }]} value={category} onChange={value => change(setCategory, value)} />
		</View>
		<ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
			{emptyQuery ? <View style={{ maxWidth: 640, gap: 20 }}>
				{mode === 'Library' ? <SearchLink title={`Browse ${category}`} subtitle={`Explore ${category} in your library`} icon={{ artists: 'user', albums: 'music', tracks: 'list' }[category]} onPress={() => navigation.navigate({ artists: 'ArtistExplorer', albums: 'AlbumExplorer', tracks: 'SongExplorer' }[category])} /> : <CatalogText>Discover artists, albums and tracks beyond your library.</CatalogText>}
				{history.length ? <View>
					<CatalogText variant="group" style={{ marginBottom: 8 }}>Recent searches</CatalogText>
					{history.map(h => <SearchLink key={h} title={h} icon="history" onPress={() => change(setQuery, h)} />)}
				</View> : null}
			</View> : null}
			{error ? <CatalogText>{error}</CatalogText> : null}
			{mode === 'Catalog' ? visibleItems.map(i => <Row key={i.mbid || i.releaseGroupMbid || i.recordingMbid} item={i} />) : category === 'artists' ? <HorizontalArtists artists={visibleItems} /> : category === 'albums' ? <HorizontalAlbums albums={visibleItems} /> : <SongsList songs={visibleItems} />}
			{busy ? <ActivityIndicator color={theme.primaryTouch} style={{ marginVertical: 20 }} /> : query.trim().length > 1 && !visibleItems.length && !error ? <CatalogText style={{ paddingVertical: 20 }}>No results</CatalogText> : null}
			{visibleItems.length > 0 && offset + 25 < total ? <SearchLink title="Load more" icon="plus" disabled={busy} onPress={() => setOffset(offset + 25)} /> : null}
		</ScrollView>
		<OptionsPopup visible={informationOpen} close={() => setInformationOpen(false)} catalogHeader={{ title: 'Catalog information' }}>
			<Information metadata={[metadata]} popularityMetadata={popMetadata} />
		</OptionsPopup>
	</View>
}
