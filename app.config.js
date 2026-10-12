let packageName = "com.napopa.castafiore"
if (process.env.IS_DEV === "true") {
	packageName = "com.napopa.castafiore.dev"
}

module.exports = ({ config }) => {
	return {
		expo: {
			name: "Castafiore (napopa)" + (process.env.IS_DEV === "true" ? " (dev)" : ""),
			slug: "Castafiore-napopa",
			description: "Castafiore is a music player that support Navidrome and Subsonic API.",
			version: config.version || require("./package.json").version,
			orientation: "default",
			icon: "./assets/icon.png",
			userInterfaceStyle: "light",
			newArchEnabled: false, // Disable New Architecture because react-native-track-player does not support it yet
			assetBundlePatterns: [
				"**/*"
			],
			android: {
				package: packageName,
				versionCode: 2026101201,
				edgeToEdgeEnabled: true,
				permissions: [
					"CHANGE_WIFI_MULTICAST_STATE",
				],
				adaptiveIcon: {
					foregroundImage: "./assets/foreground-icon.png",
					backgroundColor: process.env.IS_DEV === "true" ? "#000000" : "#660000"
				},
				splash: {
					image: "./assets/foreground-icon.png",
					resizeMode: "contain",
					backgroundColor: process.env.IS_DEV === "true" ? "#000000" : "#660000"
				}
			},
			web: {
				favicon: "./assets/icon.png",
				shortName: "Castafiore",
				startUrl: "./index.html",
				backgroundColor: "#121212",
				theme_color: "#121212"
			},
			experiments: {
				baseUrl: process.env.PLATFORM === "web" ? "./" : undefined
			},
			plugins: [
				[
					"expo-build-properties",
					{
						android: {
							usesCleartextTraffic: true
						}
					}
				],
				[
					"react-native-edge-to-edge",
					{
						"android": {
							"parentTheme": "Default",
							"enforceNavigationBarContrast": false
						}
					}
				],
				[
					'./plugins/asyncStorage.js'
				],
				[
					'./plugins/localSigning.js'
				],
				[
					"react-native-google-cast",
					{
					  androidPlayServicesCastFrameworkVersion: "22.2.0",
					},
				],
			]
		}
	}
}
