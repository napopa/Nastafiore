import { createIntegrationStore, integrationScope } from '../app/catalog/integrations'
const memory = () => { const values = new Map(); return { getItem: async k => values.get(k) || null, setItem: async (k, v) => values.set(k, v), removeItem: async k => values.delete(k), values } }
const a = { url: 'https://nav.example/', username: 'a' }, b = { url: 'https://nav.example', username: 'b' }
test('scopes distinguish users and servers, normalize trailing slashes and contain no credentials', () => {
	expect(integrationScope(a)).toBe(integrationScope({ ...a, url: 'https://nav.example' }))
	expect(integrationScope(a)).not.toBe(integrationScope(b))
	expect(integrationScope(a)).not.toContain('https')
})
test('web remembering is explicit, switching is isolated and disconnect erases credentials', async () => {
	const storage = memory()
	let store = createIntegrationStore({ storage, platform: 'web' })
	await store.save(a, { lidarrUrl: 'https://lidarr.example', apiKey: 'private', remember: true })
	expect(await store.load(b)).toBeNull()
	store = createIntegrationStore({ storage, platform: 'web' })
	expect((await store.load(a)).apiKey).toBe('private')
	await store.save(a, { apiKey: 'session', remember: false })
	expect(await createIntegrationStore({ storage, platform: 'web' }).load(a)).toBeNull()
	await store.remove(a)
	expect(await store.load(a)).toBeNull()
})
test('Android credentials use SecureStore exclusively', async () => {
	const storage = memory(), secretStorage = memory()
	const store = createIntegrationStore({ storage, secretStorage, platform: 'android' })
	await store.save(a, { apiKey: 'private', listenBrainzToken: 'lb-private' })
	expect(storage.values.size).toBe(0)
	expect((await store.load(a)).listenBrainzToken).toBe('lb-private')
	await store.remove(a)
	expect(secretStorage.values.size).toBe(0)
})
