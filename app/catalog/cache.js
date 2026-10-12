export const createMetadataCache = (storage, now = Date.now) => {
	const pending = new Map()
	return {
		async read(key, loader, options = {}) {
			const storageKey = `catalog.metadata.v1.${key}`
			let cached
			try { cached = JSON.parse(await storage.getItem(storageKey)) } catch { /* Corrupt or unavailable cache. */ }
			const ttl = options.popularity ? 86400000 : 7 * 86400000
			if (cached && now() - cached.updatedAt < ttl) return { ...cached, stale: false }
			try {
				if (!pending.has(key)) {
					const promise = (async () => {
						const value = { data: await loader(), updatedAt: now() }
						try { await storage.setItem(storageKey, JSON.stringify(value)) } catch { /* Read remains usable without storage. */ }
						return value
					})()
					pending.set(key, promise)
					promise.then(() => pending.delete(key), () => pending.delete(key))
				}
				return { ...await pending.get(key), stale: false }
			} catch (error) {
				if (error.name === 'AbortError') throw error
				if (cached) return { ...cached, stale: true }
				throw error
			}
		},
	}
}
