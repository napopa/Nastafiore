import { createJsonClient } from '../app/catalog/transport'
import { createMetadataCache } from '../app/catalog/cache'

const response = (data, status = 200, retry = null) => ({ ok: status < 400, status, json: async () => data, headers: { get: () => retry } })
test('duplicate reads share a request and cancelled consumers do not cancel other readers', async () => {
	let finish
	const fetchImpl = jest.fn(() => new Promise(resolve => { finish = resolve }))
	const client = createJsonClient({ baseUrl: 'https://example.org', fetchImpl })
	const controller = new AbortController()
	const a = client('/one', { signal: controller.signal }).catch(e => e.name)
	const b = client('/one')
	await Promise.resolve()
	controller.abort()
	finish(response({ value: 2 }))
	expect(await a).toBe('AbortError')
	expect(await b).toEqual({ value: 2 })
	expect(fetchImpl).toHaveBeenCalledTimes(1)
})
test('read retries respect Retry-After and mutations are never automatically replayed', async () => {
	const delays = []
	const fetchImpl = jest.fn().mockResolvedValueOnce(response({}, 429, '2')).mockResolvedValue(response({ ok: true }))
	const client = createJsonClient({ baseUrl: 'https://example.org', fetchImpl, sleep: async ms => delays.push(ms) })
	await client('/one')
	expect(delays).toContain(2000)
	fetchImpl.mockReset().mockRejectedValue(new Error('secret URL/key'))
	await expect(client('/write', { method: 'POST', body: {} })).rejects.toMatchObject({ uncertain: true })
	expect(fetchImpl).toHaveBeenCalledTimes(1)
})
test('MusicBrainz requests start at least one second apart including retries', async () => {
	let now = 0
	const starts = []
	const client = createJsonClient({ baseUrl: 'https://example.org', minIntervalMs: 1000, now: () => now, sleep: async ms => { now += ms }, fetchImpl: async () => { starts.push(now); return response({}) } })
	await Promise.all([client('/a'), client('/b'), client('/c')])
	expect(starts).toEqual([0, 1000, 2000])
})
test('timeout bounds reads and marks write outcomes uncertain without leaking error content', async () => {
	const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('secret-key'))))
	const client = createJsonClient({ baseUrl: 'https://example.org', timeoutMs: 5, retries: 0, fetchImpl })
	await expect(client('/one')).rejects.toThrow('Connection failed or timed out')
	await expect(client('/write', { method: 'PUT', body: {} })).rejects.toMatchObject({ uncertain: true })
})
test('expired metadata survives outage with update time; TTL is seven days or 24 hours for popularity', async () => {
	const data = new Map()
	const storage = { getItem: async k => data.get(k), setItem: async (k, v) => data.set(k, v) }
	let now = 0
	const cache = createMetadataCache(storage, () => now)
	const load = jest.fn(async () => ({ name: 'Album' }))
	expect((await cache.read('album', load)).updatedAt).toBe(0)
	now = 6 * 86400000
	await cache.read('album', load)
	expect(load).toHaveBeenCalledTimes(1)
	now = 8 * 86400000
	expect(await cache.read('album', async () => { throw new Error('offline') })).toMatchObject({ data: { name: 'Album' }, updatedAt: 0, stale: true })
	await cache.read('pop', load, { popularity: true })
	now += 86400001
	await cache.read('pop', load, { popularity: true })
	expect(load).toHaveBeenCalledTimes(3)
})
