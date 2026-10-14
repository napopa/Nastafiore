import React from 'react'
import { View } from 'react-native'
import { CatalogText, MetadataNote } from './ui'

export default function Information({ metadata, popularityMetadata }) {
	return <View style={{ marginHorizontal: 20, gap: 10, marginBottom: 15 }}>
		<CatalogText>MusicBrainz supplies catalog identities, releases and tracklists.</CatalogText>
		<CatalogText>ListenBrainz supplies community listen and listener totals. Recording counts span releases; they are not counts for the selected edition.</CatalogText>
		{metadata.filter(Boolean).map((entry, index) => <MetadataNote key={index} metadata={entry} label="MusicBrainz" />)}
		<MetadataNote metadata={popularityMetadata} label="ListenBrainz totals" />
		<CatalogText>Availability reflects matched tracks in your local library.</CatalogText>
	</View>
}
