import React from 'react'
import { AppState, Platform } from 'react-native'
import { useConfig } from './config'
import { useSongDispatch } from './song'
import { playSong } from '~/utils/player'
import { integrationScope } from '~/catalog/integrations'
import { integrationStore } from '~/catalog/storage'
import { createCatalogRuntime, validateIntegration } from '~/catalog/runtime'
import { resolveAlbums } from '~/catalog/model'
import RequestSheet from '~/components/catalog/RequestSheet'

export const CatalogContext = React.createContext(null)
export const useCatalog = () => React.useContext(CatalogContext)
const foreground = () => Platform.OS === 'web' ? typeof document === 'undefined' || document.visibilityState !== 'hidden' : AppState.currentState == null || AppState.currentState === 'active'

export const CatalogProvider = ({ children, store = integrationStore, runtimeFactory = createCatalogRuntime }) => {
	const config = useConfig(), scope = integrationScope(config), songDispatch = useSongDispatch()
	const [loaded, setLoaded] = React.useState(null), [records, setRecords] = React.useState({ scope: null, items: [] }), [request, setRequest] = React.useState(null)
	const activeRuntime = React.useRef(null), operation = React.useRef(0), readController = React.useRef(null), currentScope = React.useRef(scope)
	currentScope.current = scope
	const integration = loaded?.scope === scope ? loaded.value : null
	React.useEffect(() => {
		let cancelled = false
		store.load(config).then(value => { if (!cancelled) setLoaded({ scope, value }) }).catch(() => { if (!cancelled) setLoaded({ scope, value: null }) })
		return () => { cancelled = true; operation.current++; readController.current?.abort() }
	}, [scope, store])
	const runtime = React.useMemo(() => {
		let instance
		instance = runtimeFactory(config, integration, { isActive: foreground, onChange: items => { if (activeRuntime.current === instance && currentScope.current === scope) setRecords({ scope, items }) } })
		activeRuntime.current = instance
		return instance
	}, [config.url, config.query, scope, integration, runtimeFactory])
	React.useEffect(() => {
		let disposed = false, busy = false
		const controller = runtime.acquisition
		if (!controller) return
		controller.list().then(items => { if (!disposed) setRecords({ scope, items }) }).catch(() => {})
		const tick = async () => {
			if (disposed || busy || !foreground()) return
			busy = true
			try {
				const items = await controller.list()
				for (const item of items) {
					if (disposed || !foreground()) break
					if (['Searching', 'Preparing', 'Uncertain', 'Downloading', 'Importing', 'Waiting for Navidrome'].includes(item.stage)) await controller.refresh(item.groupId)
				}
			} catch { /* The saved status remains visible. */ }
			finally { busy = false }
		}
		const timer = setInterval(tick, 30000)
		const appSubscription = AppState.addEventListener('change', tick)
		if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', tick)
		return () => { disposed = true; clearInterval(timer); appSubscription.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', tick) }
	}, [runtime, scope])
	const saveIntegration = async value => {
		const clean = validateIntegration(value)
		await store.save(config, clean)
		if (currentScope.current === scope) setLoaded({ scope, value: clean })
	}
	const disconnect = async () => { await store.remove(config); if (currentScope.current === scope) { setLoaded({ scope, value: null }); setRequest(null) } }
	const close = () => { operation.current++; readController.current?.abort(); setRequest(null) }
	const choose = async (album, retry = false) => {
		const generation = ++operation.current
		setRequest({ scope, phase: 'loading' })
		try {
			if (!runtime.acquisition) throw new Error('Configure Lidarr in Settings → Catalog integrations before requesting an album')
			const review = await runtime.acquisition.review(album, integration)
			if (generation === operation.current && scope === currentScope.current) setRequest({ scope, phase: 'review', review, retry })
		} catch (error) { if (generation === operation.current && scope === currentScope.current) setRequest({ scope, phase: 'error', error: error.message }) }
	}
	const openRequest = async item => {
		readController.current?.abort()
		readController.current = new AbortController()
		const signal = readController.current.signal, generation = ++operation.current
		setRequest({ scope, phase: 'resolving' })
		try {
			let result
			if (item.kind === 'album') result = { choices: [item], requiresSelection: false }
			else {
				const complete = await runtime.library.complete(item, signal)
				if (item.kind === 'track' && item.releaseMbid) {
					const edition = await runtime.mb.release(item.releaseMbid, signal)
					complete.album = { musicBrainzReleaseGroupId: edition.releaseGroupMbid, releaseTypes: [edition.releaseType, ...(edition.secondaryTypes || [])] }
				}
				result = await resolveAlbums(complete, runtime.mb, signal)
			}
			if (generation !== operation.current || scope !== currentScope.current) return
			if (!result.choices.length) throw new Error('No matching album in MusicBrainz. Refine the catalog search')
			if (result.requiresSelection) setRequest({ scope, phase: 'choose', choices: result.choices })
			else await choose(result.choices[0])
		} catch (error) { if (generation === operation.current && scope === currentScope.current && error.name !== 'AbortError') setRequest({ scope, phase: 'error', error: error.message }) }
	}
	const submit = async () => {
		if (request?.phase !== 'review' || request.scope !== scope) return
		const generation = ++operation.current, review = request.review, retry = request.retry
		setRequest({ scope, phase: 'submitting', review })
		try {
			const record = await runtime.acquisition.submit(review, { retry })
			if (generation === operation.current && scope === currentScope.current) { setRequest({ scope, phase: 'status', record }); setRecords({ scope, items: await runtime.acquisition.list() }) }
		} catch { if (generation === operation.current && scope === currentScope.current) setRequest({ scope, phase: 'error', error: 'Unable to save request state. Check Lidarr before retrying' }) }
	}
	const refresh = async record => {
		const updated = await runtime.acquisition?.refresh(record.groupId)
		if (updated && scope === currentScope.current) setRequest({ scope, phase: 'status', record: updated })
	}
	const play = items => { if (items?.length && items.every(i => i?.id && !i.kind)) playSong(config, songDispatch, items, 0) }
	const visible = request?.scope === scope ? request : null
	const liveRecord = visible?.record ? (records.scope === scope ? records.items.find(r => r.groupId === visible.record.groupId) : null) || visible.record : null
	return <CatalogContext.Provider value={{ scope, runtime, integration, ready: loaded?.scope === scope, records: records.scope === scope ? records.items : [], saveIntegration, disconnect, openRequest, showRequest: record => { setRequest({ scope, phase: 'status', record }); refresh(record).catch(() => {}) }, play }}>
		{children}
		<RequestSheet request={liveRecord ? { ...visible, record: liveRecord } : visible} onClose={close} onChoose={choose} onSubmit={submit} onRefresh={() => refresh(liveRecord)} onRetry={() => choose(liveRecord.catalog, true)} onPlay={() => { play(liveRecord.playable); close() }} />
	</CatalogContext.Provider>
}
