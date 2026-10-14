import React from 'react'
import { View, Text, TextInput, Pressable, Platform } from 'react-native'
import Icon from 'react-native-vector-icons/FontAwesome'
import { useTheme } from '~/contexts/theme'
import IconButton from '~/components/button/IconButton'
import mainStyles from '~/styles/main'
import size from '~/styles/size'

export function SearchSelector({ values, value, onChange, tabs = false }) {
	const theme = useTheme(), refs = React.useRef([])
	const options = values.map(option => typeof option === 'string' ? { value: option, label: option } : option)
	const select = next => { if (next !== value) onChange(next) }
	const navigate = (event, index) => {
		const key = event.nativeEvent?.key || event.key
		let next
		if (key === 'ArrowRight' || key === 'ArrowDown') next = (index + 1) % options.length
		else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (index + options.length - 1) % options.length
		else if (key === 'Home') next = 0
		else if (key === 'End') next = options.length - 1
		else return
		event.preventDefault()
		select(options[next].value)
		refs.current[next]?.focus()
	}
	return <View accessibilityRole={tabs ? 'tablist' : 'radiogroup'} accessibilityLabel={tabs ? 'Search source' : 'Search category'} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: tabs ? 20 : 8, ...(tabs ? { borderBottomWidth: 1, borderBottomColor: theme.secondaryBack } : {}) }}>
		{options.map((option, index) => {
			const selected = value === option.value
			return <Pressable key={option.value} ref={ref => { refs.current[index] = ref }} accessibilityRole={tabs ? 'tab' : 'radio'} accessibilityLabel={option.label} accessibilityState={tabs ? { selected } : { checked: selected }} {...(Platform.OS === 'web' ? { [tabs ? 'aria-selected' : 'aria-checked']: selected, tabIndex: selected ? 0 : -1, onKeyDown: event => navigate(event, index) } : {})} onPress={() => select(option.value)} style={({ pressed }) => [mainStyles.opacity({ pressed }), { minHeight: 48, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tabs ? 4 : 16, ...(tabs ? { borderBottomWidth: 3, borderBottomColor: selected ? theme.primaryTouch : 'transparent' } : { borderRadius: size.radius.circle, backgroundColor: selected ? theme.tertiaryBack || theme.secondaryBack : 'transparent' }) }]}>
				<Text style={{ color: selected ? theme.primaryText : theme.secondaryText, fontSize: tabs ? size.text.large : size.text.medium, fontWeight: selected ? 'bold' : 'normal' }}>{option.label}</Text>
			</Pressable>
		})}
	</View>
}

export function SearchField({ mode, query, onChange, onSubmit }) {
	const theme = useTheme(), input = React.useRef(null)
	const [focused, setFocused] = React.useState(false)
	return <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.secondaryBack, borderRadius: size.radius.circle, borderWidth: 1, borderColor: focused ? theme.primaryTouch : 'transparent', paddingLeft: 18, paddingRight: 6, minHeight: 52 }}>
		<Icon name="search" size={size.icon.tiny} color={theme.secondaryText} />
		<TextInput ref={input} accessibilityLabel={`Search ${mode.toLowerCase()}`} placeholder={`Search ${mode.toLowerCase()}`} placeholderTextColor={theme.secondaryText} value={query} onChangeText={onChange} onSubmitEditing={onSubmit} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={{ flex: 1, minWidth: 0, color: theme.primaryText, paddingVertical: 14, paddingHorizontal: 12, fontSize: size.text.medium, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
		{query ? <IconButton icon="times" size={18} color={theme.secondaryText} accessibilityLabel="Clear search" style={{ alignItems: 'center' }} onPress={() => { onChange(''); input.current?.focus() }} /> : null}
	</View>
}

export function SearchLink({ title, subtitle, icon, onPress, disabled = false }) {
	const theme = useTheme()
	return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed, hovered }) => [mainStyles.opacity({ pressed }), { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: hovered ? theme.secondaryBack : 'transparent', opacity: disabled ? 0.45 : pressed ? 0.5 : 1 }]}>
		<Icon name={icon} size={size.icon.tiny} color={theme.secondaryText} style={{ width: 24, textAlign: 'center' }} />
		<View style={{ flex: 1, gap: 4 }}>
			<Text numberOfLines={1} style={{ color: theme.primaryText, fontSize: size.text.medium }}>{title}</Text>
			{subtitle ? <Text style={{ color: theme.secondaryText, fontSize: size.text.small }}>{subtitle}</Text> : null}
		</View>
		<Icon name="angle-right" size={size.icon.tiny} color={theme.secondaryText} />
	</Pressable>
}
