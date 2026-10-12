import React from 'react'
import { View, TextInput, ScrollView, ActivityIndicator } from 'react-native'
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
import mainStyles from '~/styles/main'
import Row from './Row'
import { CatalogText, CatalogButton, Choices, MetadataNote } from './ui'

export default function Search() {
	const config = useConfig(), theme = useTheme(), catalog = useCatalog(), insets = useSafeAreaInsets()
	const navigation = useNavigation()
	const [mode, setMode] = React.useState('Library'), [category, setCategory] = React.useState('artists'), [query, setQuery] = React.useState(''), [offset, setOffset] = React.useState(0)
	const [items, setItems] = React.useState([]), [total, setTotal] = React.useState(0), [busy, setBusy] = React.useState(false), [error, setError] = React.useState(''), [metadata, setMetadata] = React.useState(null), [popMetadata, setPopMetadata] = React.useState(null)
	const [history, setHistory] = React.useState([])
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
	const change = (setter, value) => { setOffset(0); setItems([]); setTotal(0); setMetadata(null); setPopMetadata(null); setter(value) }
	return <View style={[mainStyles.mainContainer(theme), mainStyles.contentMainContainer(insets), { paddingBottom: 0 }]}>
		<CatalogText title style={{ padding: 20 }}>Search</CatalogText>
		<View style={{ paddingHorizontal: 20, gap: 12 }}>
			<Choices values={['Library', 'Catalog']} value={mode} onChange={value => change(setMode, value)} />
			<Choices values={[{ value: 'artists', label: 'Artists' }, { value: 'albums', label: 'Albums' }, { value: 'tracks', label: 'Tracks' }]} value={category} onChange={value => change(setCategory, value)} />
			<TextInput accessibilityLabel={`Search ${mode.toLowerCase()}`} placeholder={`Search ${mode.toLowerCase()}`} placeholderTextColor={theme.secondaryText} value={query} onChangeText={value => change(setQuery, value)} onSubmitEditing={remember} autoCapitalize="none" style={{ color: theme.primaryText, backgroundColor: theme.secondaryBack, padding: 14, borderRadius: 8, fontSize: 18 }} />
		</View>
		<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 100, gap: 12 }}>
			{!query && mode === 'Library' ? <CatalogButton onPress={() => navigation.navigate({ artists: 'ArtistExplorer', albums: 'AlbumExplorer', tracks: 'SongExplorer' }[category])}>Browse {category}</CatalogButton> : null}
			{!query && history.map(h => <CatalogButton key={h} onPress={() => change(setQuery, h)}>{h}</CatalogButton>)}
			{error ? <CatalogText>{error}</CatalogText> : null}
			<MetadataNote metadata={metadata} /><MetadataNote metadata={popMetadata} label="ListenBrainz totals" />
			{mode === 'Catalog' ? items.map(i => <Row key={i.mbid || i.releaseGroupMbid || i.recordingMbid} item={i} />) : category === 'artists' ? <HorizontalArtists artists={items} /> : category === 'albums' ? <HorizontalAlbums albums={items} /> : <SongsList songs={items} />}
			{busy ? <ActivityIndicator color={theme.primaryTouch} /> : query.length > 1 && !items.length && !error ? <CatalogText>No results</CatalogText> : null}
			{items.length > 0 && offset + 25 < total ? <CatalogButton disabled={busy} onPress={() => setOffset(offset + 25)}>Load more</CatalogButton> : null}
		</ScrollView>
	</View>
}
