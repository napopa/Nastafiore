import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { URL as IntegrationURL } from 'react-native-url-polyfill'
import md5 from 'md5'
import { createJsonClient } from './transport'
import { createMetadataCache } from './cache'
import { createMusicBrainz } from './musicbrainz'
import { createListenBrainz } from './listenbrainz'
import { createLibrary } from './library'
import { createLidarr } from './lidarr'
import { createAcquisition } from './acquisition'
import { integrationScope } from './integrations'

const cache = createMetadataCache(AsyncStorage)
const mbRequest = createJsonClient({ baseUrl: 'https://musicbrainz.org/ws/2', minIntervalMs: 1000, headers: Platform.OS === 'web' ? {} : { 'User-Agent': 'Castafiore-napopa/2026.10.12 (https://github.com/napopa/Castafiore)' } })
export const musicbrainz = createMusicBrainz({ request: mbRequest, cache })

export const validateIntegration = integration => {
	if (!integration.lidarrUrl?.trim() && !integration.apiKey?.trim()) return { ...integration, lidarrUrl: '', apiKey: '', listenBrainzToken: integration.listenBrainzToken?.trim() || '' }
	let url
	try { url = new IntegrationURL(integration.lidarrUrl.trim()) } catch { throw new Error('Enter a valid Lidarr URL') }
	if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use a Lidarr HTTP(S) URL without credentials or query parameters')
	if (!integration.apiKey?.trim()) throw new Error('Enter the Lidarr API key')
	return { ...integration, lidarrUrl: url.toString().replace(/\/+$/, ''), apiKey: integration.apiKey.trim(), listenBrainzToken: integration.listenBrainzToken?.trim() || '' }
}

export const lidarrConnection = integration => createLidarr(createJsonClient({ baseUrl: `${integration.lidarrUrl.replace(/\/+$/, '')}/api/v1`, headers: { 'X-Api-Key': integration.apiKey } }))

export const createCatalogRuntime = (config, integration, callbacks = {}) => {
	const localRequest = config?.url && config?.query ? createJsonClient({ baseUrl: config.url.replace(/\/+$/, '') }) : null
	const library = createLibrary(async (path, query, signal) => {
		if (!localRequest) throw new Error('Connect to Navidrome to check availability')
		const params = Object.entries(query || {}).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
		const raw = await localRequest(`/rest/${path}?${config.query}&f=json&${params}`, { signal })
		const response = raw['subsonic-response']
		if (!response || response.error || response.status !== 'ok') throw new Error('Navidrome metadata is unavailable')
		return response
	})
	const lbRequest = createJsonClient({ baseUrl: 'https://api.listenbrainz.org/1', headers: integration?.listenBrainzToken ? { Authorization: `Token ${integration.listenBrainzToken}` } : {} })
	const lb = createListenBrainz({ request: lbRequest, cache })
	let acquisition = null
	if (integration?.lidarrUrl && integration?.apiKey && integrationScope(config)) {
		const journalKey = `catalog.requests.v1.${integrationScope(config)}.${md5(integration.lidarrUrl)}`
		acquisition = createAcquisition({ lidarr: lidarrConnection(integration), mb: musicbrainz, library, journal: {
			load: async () => JSON.parse(await AsyncStorage.getItem(journalKey) || '[]'),
			save: data => AsyncStorage.setItem(journalKey, JSON.stringify(data.map(({ playable: _playable, ...record }) => record))),
		}, ...callbacks })
	}
	return { mb: musicbrainz, lb, library, acquisition }
}
