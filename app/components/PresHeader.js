import React from 'react'
import { Text, View, Pressable } from 'react-native'
import { useTheme } from '~/contexts/theme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import BackButton from '~/components/button/BackButton'
import mainStyles from '~/styles/main'
import presStyles from '~/styles/pres'
import ImageError from '~/components/ImageError'
import IconButton from '~/components/button/IconButton'

const PresHeader = ({ title, subTitle, imgSrc, onPressTitle = null, onPressOption = null, optionLabel = 'Options', children = null }) => {
	const theme = useTheme()
	const insets = useSafeAreaInsets()

	return (
		<>
			<BackButton />
			{
				onPressOption ?
					<IconButton
						accessibilityLabel={optionLabel}
						icon="ellipsis-h"
						onPress={onPressOption}
						color={theme.primaryText}
						style={{
							position: 'absolute',
							padding: 20,
							top: insets.top,
							right: insets.left,
							zIndex: 1,
							backgroundColor: theme.primaryBack,
							borderBottomLeftRadius: 20
						}}
					/> : null
			}
			<ImageError
				style={[presStyles.cover, { backgroundColor: theme.secondaryBack }]}
				source={{ uri: imgSrc }}
			/>
			<View style={presStyles.headerContainer}>
				<View style={{ flex: 1 }}>
					<Text style={presStyles.title(theme)} numberOfLines={2}>{title}</Text>
					<Pressable
						style={({ pressed }) => [mainStyles.opacity({ pressed }), onPressTitle && { minHeight: 44, justifyContent: 'center' }]}
						accessibilityRole={onPressTitle ? 'button' : undefined}
						accessibilityLabel={onPressTitle ? subTitle : undefined}
						onPress={onPressTitle}
						disabled={!onPressTitle}
					>
						<Text style={presStyles.subTitle(theme)}>{subTitle}</Text>
					</Pressable>
				</View>
				{children}
			</View>
		</>
	)
}

export default PresHeader
