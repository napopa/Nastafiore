import React from 'react'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import IconButton from '~/components/button/IconButton'
import { useTheme } from '~/contexts/theme'
import size from '~/styles/size'

const BackButton = () => {
	const navigation = useNavigation()
	const insets = useSafeAreaInsets()
	const theme = useTheme()

	return (
		<IconButton
			accessibilityLabel="Back"
			style={{
				position: 'absolute',
				top: insets.top,
				left: insets.left,
				padding: 20,
				zIndex: 2,
				backgroundColor: theme.primaryBack,
				borderBottomRightRadius: 20,
			}} onPress={() => navigation.goBack()}
			icon="chevron-left"
			size={size.icon.small}
			color={theme.primaryText}
		/>
	)
}

export default BackButton
