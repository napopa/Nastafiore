import md5 from 'md5'

export const integrationScope = config => config?.url && config?.username ? md5(`${config.url.replace(/\/+$/, '')}\n${config.username}`) : null
export const createIntegrationStore = ({ storage, secretStorage, platform }) => {
	const session = new Map()
	const backend = platform === 'web' ? storage : secretStorage
	const key = config => `castafiore.integration.${integrationScope(config)}`
	return {
		async load(config) {
			const scope = integrationScope(config)
			if (!scope) return null
			if (session.has(scope)) return session.get(scope)
			const value = await backend.getItem(key(config))
			if (!value) return null
			try { return JSON.parse(value) } catch { return null }
		},
		async save(config, integration) {
			const scope = integrationScope(config)
			if (!scope) throw new Error('Select a Navidrome server and user first')
			if (platform === 'web' && !integration.remember) await backend.removeItem(key(config))
			else await backend.setItem(key(config), JSON.stringify(integration))
			session.set(scope, integration)
		},
		async remove(config) {
			const scope = integrationScope(config)
			if (!scope) return
			await backend.removeItem(key(config))
			session.delete(scope)
		},
	}
}
