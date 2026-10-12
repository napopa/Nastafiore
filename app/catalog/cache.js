import { abortError, createShared, subscribe } from './shared'

export const createMetadataCache = (storage, now = Date.now) => {
	const pending = new Map()
	return {
		async read(key, loader, options = {}) {
			if (options.signal?.aborted) throw abortError()
			const storageKey = `catalog.metadata.v1.${key}`
			let cached
			try { cached = JSON.parse(await storage.getItem(storageKey)) } catch { /* Corrupt or unavailable cache. */ }
			if (options.signal?.aborted) throw abortError()
			const ttl = options.popularity ? 86400000 : 7 * 86400000
			if (cached && now() - cached.updatedAt < ttl) return { ...cached, stale: false }
			try {
				if (!pending.has(key)) {
					const entry = createShared(async signal => {
						const value = { data: await loader(signal), updatedAt: now() }
						if (signal.aborted) throw abortError()
						try { await storage.setItem(storageKey, JSON.stringify(value)) } catch { /* Read remains usable without storage. */ }
						return value
					})
					pending.set(key, entry)
					const clear = () => { if (pending.get(key) === entry) pending.delete(key) }
					entry.promise.then(clear, clear)
					entry.controller.signal.addEventListener('abort', clear, { once: true })
				}
				return { ...await subscribe(pending.get(key), options.signal), stale: false }
			} catch (error) {
				if (error.name === 'AbortError') throw error
				if (cached) return { ...cached, stale: true }
				throw error
			}
		},
	}
}
