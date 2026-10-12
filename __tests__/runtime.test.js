import { validateIntegration } from '../app/catalog/runtime'
test('a ListenBrainz token can be saved without a Lidarr connection', () => {
	expect(validateIntegration({ lidarrUrl: '', apiKey: '', listenBrainzToken: ' public-token ', remember: false })).toMatchObject({ lidarrUrl: '', apiKey: '', listenBrainzToken: 'public-token' })
})
test('integration URLs do not embed secrets and errors do not echo input', () => {
	expect(() => validateIntegration({ lidarrUrl: 'https://user:private-key@example.org', apiKey: 'private-key' })).toThrow('without credentials')
	expect(() => validateIntegration({ lidarrUrl: 'not-a-url', apiKey: 'private-key' })).toThrow('valid Lidarr URL')
})
test('Android URL validation does not rely on incomplete React Native global URL', () => {
	const original = global.URL
	global.URL = class { constructor() { throw new Error('URL.protocol is not implemented') } }
	try { expect(validateIntegration({ lidarrUrl: 'https://lidarr.example/base/', apiKey: 'key' }).lidarrUrl).toBe('https://lidarr.example/base') } finally { global.URL = original }
})
