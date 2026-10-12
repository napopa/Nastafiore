const appConfig = require('../app.config')
const { configureSigning } = require('../plugins/localSigning')
test('Android fork coexists with upstream and has no upstream Expo project association', () => {
	const config = appConfig({ config: { version: '2026.10.12' } }).expo
	expect(config.android.package).toBe('com.napopa.castafiore')
	expect(config.name).toBe('Castafiore (napopa)')
	expect(config.extra?.eas?.projectId).toBeUndefined()
})
test('release signing uses external local properties and never silently falls back to debug', () => {
	const input = 'android {\n    signingConfigs {\n        debug { }\n    }\n    buildTypes {\n        debug { signingConfig signingConfigs.debug }\n        release {\n            signingConfig signingConfigs.debug\n        }\n    }\n}'
	const result = configureSigning(input)
	expect(result).toContain('CASTAFIORE_SIGNING_PROPERTIES')
	expect(result).toContain('signingConfig signingConfigs.castafioreRelease')
	expect(result).not.toContain('release {\n            signingConfig signingConfigs.debug')
	expect(configureSigning(result)).toBe(result)
})
