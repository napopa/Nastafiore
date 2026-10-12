// SPDX-License-Identifier: GPL-3.0-only; additional permission in LICENSE.google-cast.
import React, { useState } from 'react'
import { Linking, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Header from '~/components/Header'
import ButtonMenu from '~/components/settings/ButtonMenu'
import { useTheme } from '~/contexts/theme'
import mainStyles from '~/styles/main'
import settingStyles from '~/styles/settings'
import licenses from '~/../public/licenses.json'

export default function License() {
	const theme = useTheme()
	const insets = useSafeAreaInsets()
	const [selected, setSelected] = useState('notice')
	return <ScrollView style={mainStyles.mainContainer(theme)} contentContainerStyle={mainStyles.contentMainContainer(insets)}>
		<Header title="License and source" />
		<View style={settingStyles.contentMainContainer}>
			<Text style={settingStyles.titleContainer(theme)}>GNU GPL version 3 only</Text>
			<Text style={settingStyles.description(theme)}>Nastafiore is an independent fork of Castafiore. You may modify and redistribute this software under GPLv3. It comes without any warranty. A limited permission retains Google Cast support.</Text>
			<View style={settingStyles.optionsContainer(theme)}>
				<ButtonMenu title="Matching source and releases" icon="github" onPress={() => Linking.openURL('https://github.com/napopa/Nastafiore/releases')} />
				<ButtonMenu title="Upstream Castafiore" icon="github" onPress={() => Linking.openURL('https://github.com/sawyerf/Castafiore')} isLast />
			</View>
			<View style={settingStyles.optionsContainer(theme)}>
				{[['notice', 'Fork notice'], ['gpl', 'GPLv3 text'], ['cast', 'Google Cast linking permission']].map(([key, title], index) => <ButtonMenu key={key} title={title} icon="file-text" onPress={() => setSelected(key)} isLast={index === 2} />)}
			</View>
			<Text selectable style={{ color: theme.primaryText, lineHeight: 22, paddingBottom: 30 }}>{licenses[selected]}</Text>
		</View>
	</ScrollView>
}
