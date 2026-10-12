const { withAppBuildGradle } = require('expo/config-plugins')

const configureSigning = contents => {
	if (contents.includes('// Castafiore local release signing')) return contents
	const properties = `// Castafiore local release signing
def castafioreSigningPath = System.getenv('CASTAFIORE_SIGNING_PROPERTIES')
def castafioreSigning = new Properties()
if (castafioreSigningPath) {
    new File(castafioreSigningPath).withInputStream { castafioreSigning.load(it) }
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.path.startsWith(':app:') && it.name.toLowerCase().contains('release') } && !castafioreSigningPath) {
        throw new GradleException('Set CASTAFIORE_SIGNING_PROPERTIES to a signing file outside the repository')
    }
}
`
	contents = contents.replace('android {', `${properties}\nandroid {`)
	contents = contents.replace('signingConfigs {', `signingConfigs {
        castafioreRelease {
            if (castafioreSigningPath) {
                storeFile file(castafioreSigning.getProperty('storeFile'))
                storePassword castafioreSigning.getProperty('storePassword')
                keyAlias castafioreSigning.getProperty('keyAlias')
                keyPassword castafioreSigning.getProperty('keyPassword')
            }
        }`)
	return contents.replace(/(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.castafioreRelease')
}

module.exports = config => withAppBuildGradle(config, config => { config.modResults.contents = configureSigning(config.modResults.contents); return config })
module.exports.configureSigning = configureSigning
