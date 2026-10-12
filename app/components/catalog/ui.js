import React from 'react'
import { Text, Pressable, View } from 'react-native'
import { useTheme } from '~/contexts/theme'
import ImageError from '~/components/ImageError'

export const coverUrl = album => album?.releaseMbid ? `https://coverartarchive.org/release/${album.releaseMbid}/front-250` : album?.releaseGroupMbid ? `https://coverartarchive.org/release-group/${album.releaseGroupMbid}/front-250` : null
export const CatalogText = ({ children, title = false, style }) => {
	const theme = useTheme()
	return <Text style={[{ color: title ? theme.primaryText : theme.secondaryText, fontSize: title ? 20 : 14, lineHeight: title ? 28 : 21 }, style]}>{children}</Text>
}
export const CatalogButton = ({ children, onPress, disabled = false, selected = false, testID }) => {
	const theme = useTheme()
	return <Pressable accessibilityRole="button" testID={testID} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ paddingVertical: 11, paddingHorizontal: 14, minHeight: 44, borderRadius: 8, backgroundColor: selected ? theme.primaryTouch : theme.secondaryBack, opacity: disabled ? 0.45 : pressed ? 0.65 : 1 })}><Text style={{ color: selected ? theme.innerTouch : theme.primaryText, fontSize: 15 }}>{children}</Text></Pressable>
}
export const Choices = ({ values, value, onChange }) => <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{values.map(v => <CatalogButton key={v.value || v} selected={value === (v.value || v)} onPress={() => onChange(v.value || v)}>{v.label || v}</CatalogButton>)}</View>
export const Cover = ({ album, uri, size = 160 }) => <ImageError source={{ uri: uri || coverUrl(album) }} style={{ width: size, height: size, borderRadius: 8 }} />
export const MetadataNote = ({ metadata, label = 'Metadata' }) => metadata?.updatedAt != null ? <CatalogText>{metadata.stale ? 'Cached · ' : ''}{label} updated {new Date(metadata.updatedAt).toLocaleString()}</CatalogText> : null
export const Counts = ({ value, recording = false }) => <CatalogText>{value?.listens == null ? 'ListenBrainz totals unavailable' : `${Number(value.listens).toLocaleString()} ListenBrainz listens${value.listeners != null ? ` · ${Number(value.listeners).toLocaleString()} listeners` : ''}`}{recording && value?.listens != null ? ' · across releases' : ''}</CatalogText>
