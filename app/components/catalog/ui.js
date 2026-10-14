import React from 'react'
import { Text, Pressable, View, Platform } from 'react-native'
import Icon from 'react-native-vector-icons/FontAwesome'
import { useTheme } from '~/contexts/theme'
import ImageError from '~/components/ImageError'
import mainStyles from '~/styles/main'
import size from '~/styles/size'

export const coverUrl = album => album?.releaseMbid ? `https://coverartarchive.org/release/${album.releaseMbid}/front-250` : album?.releaseGroupMbid ? `https://coverartarchive.org/release-group/${album.releaseGroupMbid}/front-250` : null
export const CatalogText = ({ children, title = false, variant, style, ...props }) => {
	const theme = useTheme()
	const kind = variant || (title ? 'section' : 'metadata')
	const fontSize = { page: size.title.medium, section: size.title.small, group: size.text.large, row: size.text.medium, metadata: size.text.small }[kind]
	return <Text {...props} accessibilityRole={['page', 'section', 'group'].includes(kind) ? 'header' : undefined} style={[{ color: kind === 'metadata' ? theme.secondaryText : theme.primaryText, fontSize, lineHeight: fontSize * 1.4, fontWeight: ['page', 'section'].includes(kind) ? 'bold' : 'normal' }, style]}>{children}</Text>
}
export const CatalogButton = ({ children, onPress, disabled = false, selected, primary = false, testID, icon, compact = false, accessibilityLabel }) => {
	const theme = useTheme()
	const [hover, setHover] = React.useState(false)
	const highlighted = primary || selected
	return <Pressable {...(Platform.OS === 'web' && selected !== undefined ? { 'aria-pressed': selected } : {})} accessibilityRole="button" accessibilityLabel={accessibilityLabel || (typeof children === 'string' ? children : undefined)} accessibilityState={{ selected, disabled }} testID={testID} disabled={disabled} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: compact ? 8 : 14, minHeight: 44, minWidth: 44, borderRadius: 8, backgroundColor: highlighted ? theme.primaryTouch : hover ? theme.tertiaryBack || theme.secondaryBack : compact ? 'transparent' : theme.secondaryBack, opacity: disabled ? 0.45 : pressed ? 0.5 : 1 })}>
		{icon ? <Icon name={icon} size={size.icon.tiny} color={highlighted ? theme.innerTouch : theme.primaryTouch} /> : null}
		<Text style={{ color: highlighted ? theme.innerTouch : theme.primaryText, fontSize: size.text.medium, flexShrink: 1 }}>{children}</Text>
	</Pressable>
}
export const CatalogNavigation = ({ children, onPress }) => {
	const theme = useTheme()
	return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={typeof children === 'string' ? children : undefined} style={({ pressed }) => [mainStyles.opacity({ pressed }), { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginHorizontal: 20, marginBottom: 12, gap: 10 }]}>
		<CatalogText title style={{ flex: 1 }}>{children}</CatalogText><Icon name="angle-right" color={theme.secondaryText} size={size.icon.medium} />
	</Pressable>
}
export const Choices = ({ values, value, onChange }) => <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{values.map(v => <CatalogButton key={v.value || v} selected={value === (v.value || v)} onPress={() => onChange(v.value || v)}>{v.label || v}</CatalogButton>)}</View>
export const Cover = ({ album, uri, size = 160 }) => <ImageError source={{ uri: uri || coverUrl(album) }} style={{ width: size, height: size, borderRadius: 4 }} />
export const MetadataNote = ({ metadata, label = 'Metadata' }) => metadata?.updatedAt != null ? <CatalogText>{metadata.stale ? 'Cached · ' : ''}{label} updated {new Date(metadata.updatedAt).toLocaleString()}</CatalogText> : null
export const Counts = ({ value, compact = false }) => <CatalogText>{value?.listens == null ? (compact ? '— listens' : 'Listen counts unavailable') : `${Number(value.listens).toLocaleString(undefined, compact ? { notation: 'compact', maximumFractionDigits: 1 } : {})} listens${!compact && value.listeners != null ? ` · ${Number(value.listeners).toLocaleString()} listeners` : ''}`}</CatalogText>
export const editionLabel = edition => [edition?.date, edition?.country, edition?.format, edition?.disambiguation, edition?.trackCount != null ? `${edition.trackCount} tracks` : null, edition?.status].filter(Boolean).join(' · ') || 'Edition details unavailable'
