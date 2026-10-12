import React from 'react'
import { ScrollView, View, TextInput, Platform, Switch, ActivityIndicator } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useConfig } from '~/contexts/config'
import { useCatalog } from '~/contexts/catalog'
import { useTheme } from '~/contexts/theme'
import { lidarrConnection, validateIntegration } from '~/catalog/runtime'
import Header from '~/components/Header'
import mainStyles from '~/styles/main'
import { CatalogText, CatalogButton, Choices } from '~/components/catalog/ui'

export default function CatalogSettings() {
	const config = useConfig(), catalog = useCatalog(), theme = useTheme(), insets = useSafeAreaInsets()
	const [draft, setDraft] = React.useState({ lidarrUrl: '', apiKey: '', listenBrainzToken: '', remember: false }), [options, setOptions] = React.useState(null), [message, setMessage] = React.useState(''), [busy, setBusy] = React.useState(false)
	const generation = React.useRef(0)
	React.useEffect(() => { setDraft({ lidarrUrl: '', apiKey: '', listenBrainzToken: '', remember: false, ...catalog.integration }); setOptions(null); setMessage(''); generation.current++; return () => { generation.current++ } }, [catalog.scope, catalog.integration])
	const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }))
	const check = async () => {
		const current = ++generation.current
		setBusy(true); setMessage('')
		try {
			const clean = validateIntegration(draft), connection = lidarrConnection(clean)
			const [status, data] = await Promise.all([connection.status(), connection.settings()])
			if (current !== generation.current) return
			setOptions(data)
			const root = data.roots.find(r => r.path === draft.rootFolderPath) || data.roots[0]
			setDraft(previous => ({ ...previous, ...clean, rootFolderPath: root?.path || '', qualityProfileId: data.qualities.find(p => p.id === Number(draft.qualityProfileId))?.id || root?.defaultQualityProfileId || data.qualities[0]?.id, metadataProfileId: data.metadata.find(p => p.id === Number(draft.metadataProfileId))?.id || root?.defaultMetadataProfileId || data.metadata[0]?.id }))
			setMessage(`Connected to Lidarr ${status.version}. These checks are read-only.`)
		} catch (error) { if (current === generation.current) setMessage(error.message) }
		finally { if (current === generation.current) setBusy(false) }
	}
	const save = async () => {
		setBusy(true)
		try { await catalog.saveIntegration(draft); setMessage('Integrations saved for this server and user') } catch (error) { setMessage(error.message) } finally { setBusy(false) }
	}
	const input = (key, label, secret = false) => <View style={{ gap: 6 }}><CatalogText>{label}</CatalogText><TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={theme.secondaryText} value={draft[key] || ''} onChangeText={value => { update(key, value); if (['lidarrUrl', 'apiKey'].includes(key)) setOptions(null) }} secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} style={{ padding: 14, borderRadius: 8, backgroundColor: theme.secondaryBack, color: theme.primaryText, fontSize: 16 }} /></View>
	return <ScrollView keyboardShouldPersistTaps="handled" style={mainStyles.mainContainer(theme)} contentContainerStyle={[mainStyles.contentMainContainer(insets), { paddingHorizontal: 20, paddingBottom: 100, gap: 16 }]}>
		<Header title="Catalog integrations" />
		<CatalogText>{config.url || 'No server selected'} · {config.username || 'No user selected'}</CatalogText>
		<CatalogText>MusicBrainz catalog and public ListenBrainz totals work without a Lidarr connection. Lidarr settings apply to new artists; existing artists retain their own profiles and paths.</CatalogText>
		{input('lidarrUrl', 'https://lidarr.example')}{input('apiKey', 'Lidarr API key', true)}{input('listenBrainzToken', 'ListenBrainz token (optional)', true)}
		{Platform.OS === 'web' ? <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Switch accessibilityLabel="Remember credentials in this browser" value={!!draft.remember} onValueChange={value => update('remember', value)} /><CatalogText style={{ flex: 1 }}>Remember credentials in this browser. Otherwise they last for this session.</CatalogText></View> : <CatalogText>Credentials are stored in Android SecureStore.</CatalogText>}
		<CatalogButton disabled={busy || !catalog.scope || !draft.lidarrUrl || !draft.apiKey} onPress={check}>Check connection and load settings</CatalogButton>
		{options ? <>
			<CatalogText title>Root folder for new artists</CatalogText><Choices values={options.roots.map(r => ({ value: r.path, label: r.path }))} value={draft.rootFolderPath} onChange={value => update('rootFolderPath', value)} />
			<CatalogText title>Quality profile</CatalogText><Choices values={options.qualities.map(p => ({ value: p.id, label: p.name }))} value={draft.qualityProfileId} onChange={value => update('qualityProfileId', value)} />
			<CatalogText title>Metadata profile</CatalogText><Choices values={options.metadata.map(p => ({ value: p.id, label: p.name }))} value={draft.metadataProfileId} onChange={value => update('metadataProfileId', value)} />
		</> : null}
		<CatalogButton disabled={busy || !catalog.ready || !catalog.scope} onPress={save}>Save integrations</CatalogButton>
		<CatalogButton disabled={busy || !catalog.integration} onPress={async () => { await catalog.disconnect(); setDraft({ lidarrUrl: '', apiKey: '', listenBrainzToken: '', remember: false }); setOptions(null); setMessage('Credentials removed') }}>Disconnect integrations</CatalogButton>
		{busy ? <ActivityIndicator color={theme.primaryTouch} /> : null}{message ? <CatalogText>{message}</CatalogText> : null}
		<CatalogText title>Album requests</CatalogText>
		{catalog.records.length ? catalog.records.map(record => <CatalogButton key={record.groupId} onPress={() => catalog.showRequest(record)}>{record.catalog.title} · {record.stage}</CatalogButton>) : <CatalogText>No album requests for this server and integration.</CatalogText>}
	</ScrollView>
}
