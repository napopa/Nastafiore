export const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' })
export const createShared = factory => {
	const entry = { controller: new AbortController(), users: 0, settled: false }
	entry.promise = factory(entry.controller.signal)
	entry.promise.then(() => { entry.settled = true }, () => { entry.settled = true })
	return entry
}
export const subscribe = (entry, signal) => new Promise((resolve, reject) => {
	entry.users++
	let finished = false
	const finish = (callback, value) => {
		if (finished) return
		finished = true
		signal?.removeEventListener('abort', cancel)
		entry.users--
		if (!entry.users && !entry.settled) entry.controller.abort()
		callback(value)
	}
	const cancel = () => finish(reject, abortError())
	if (signal?.aborted) cancel()
	else {
		signal?.addEventListener('abort', cancel, { once: true })
		entry.promise.then(value => finish(resolve, value), error => finish(reject, error))
	}
})
