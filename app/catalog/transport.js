const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' })
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
export const createJsonClient = ({ baseUrl, headers = {}, fetchImpl = fetch, timeoutMs = 15000, retries = 2, minIntervalMs = 0, sleep = pause, now = Date.now }) => {
	const pending = new Map()
	let gate = Promise.resolve()
	let nextStart = 0
	const schedule = () => {
		const turn = gate.then(async () => {
			const delay = Math.max(0, nextStart - now())
			if (delay) await sleep(delay)
			nextStart = now() + minIntervalMs
		})
		gate = turn.catch(() => {})
		return turn
	}
	const run = async (path, options) => {
		const method = options.method || 'GET'
		const safe = options.readOnly || method === 'GET'
		for (let attempt = 0; ; attempt++) {
			if (minIntervalMs) await schedule()
			const controller = new AbortController()
			const timer = setTimeout(() => controller.abort(), timeoutMs)
			let error
			let retryMs = 500 * (2 ** attempt)
			try {
				const response = await fetchImpl(`${baseUrl}${path}`, { method, headers: { Accept: 'application/json', ...headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, body: options.body ? JSON.stringify(options.body) : undefined, signal: controller.signal })
				if (response.ok) return response.status === 204 ? null : await response.json()
				error = Object.assign(new Error(`API request failed (HTTP ${response.status})`), { status: response.status, uncertain: !safe && response.status >= 500 })
				if (![429, 500, 502, 503, 504].includes(response.status)) throw error
				const retry = response.headers.get('Retry-After')
				if (retry) retryMs = /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - now())
			} catch (failure) {
				if (failure.status && ![429, 500, 502, 503, 504].includes(failure.status)) throw failure
				error = failure.status ? failure : Object.assign(new Error('Connection failed or timed out'), { uncertain: !safe })
			} finally { clearTimeout(timer) }
			if (!safe || attempt >= retries || retryMs > 30000) throw error
			await sleep(Math.max(0, retryMs))
		}
	}
	return (path, options = {}) => {
		if (options.signal?.aborted) return Promise.reject(abortError())
		const safe = options.readOnly || !options.method || options.method === 'GET'
		const key = `${options.method || 'GET'}:${path}:${JSON.stringify(options.body || null)}`
		let promise = safe ? pending.get(key) : null
		if (!promise) {
			promise = run(path, options)
			if (safe) {
				pending.set(key, promise)
				promise.then(() => pending.delete(key), () => pending.delete(key))
			}
		}
		if (!options.signal) return promise
		return new Promise((resolve, reject) => {
			const cancel = () => reject(abortError())
			options.signal.addEventListener('abort', cancel, { once: true })
			promise.then(value => { if (!options.signal.aborted) resolve(value) }, reject).finally(() => options.signal.removeEventListener('abort', cancel))
		})
	}
}
