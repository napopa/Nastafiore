import React from 'react'
import { Modal, View, ScrollView, ActivityIndicator } from 'react-native'
import { useTheme } from '~/contexts/theme'
import { CatalogText, CatalogButton, Cover } from './ui'

export default function RequestSheet({ request, onChoose, onSubmit, onClose, onRefresh, onRetry, onPlay }) {
	const theme = useTheme()
	if (!request) return null
	const album = request.review?.catalog || request.record?.catalog
	const review = request.review
	const record = request.record
	return <Modal visible transparent animationType="slide" onRequestClose={onClose}>
		<View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<View style={{ width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: theme.primaryBack, borderRadius: 16, padding: 20 }}>
				<ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CatalogText title style={{ flex: 1 }}>Request full album</CatalogText><CatalogButton onPress={onClose}>Close</CatalogButton></View>
					{['resolving', 'loading', 'submitting'].includes(request.phase) ? <><ActivityIndicator color={theme.primaryTouch} /><CatalogText>{request.phase === 'submitting' ? 'Submitting and reconciling with Lidarr…' : 'Resolving album identity…'}</CatalogText></> : null}
					{request.phase === 'choose' ? <><CatalogText>Select the full album. Tagged singles and compilations remain options.</CatalogText>{request.choices.map(a => <View key={a.releaseGroupMbid} style={{ gap: 5 }}><CatalogButton onPress={() => onChoose(a)}>{a.title}</CatalogButton><CatalogText>{[a.artist?.name, a.artist?.disambiguation, a.date?.slice(0, 4), a.releaseType, ...(a.secondaryTypes || []), a.disambiguation].filter(Boolean).join(' · ')}</CatalogText></View>)}</> : null}
					{album ? <><Cover album={album} /><CatalogText title>{album.title}</CatalogText><CatalogText>{[album.artist?.name, album.date?.slice(0, 4), album.releaseType, ...(album.secondaryTypes || [])].filter(Boolean).join(' · ')}</CatalogText></> : null}
					{request.phase === 'review' && review ? <>
						<CatalogText>{review.existing ? 'Existing artist' : 'New artist · other albums and future releases unmonitored'} · {review.remote ? (review.remote.monitored ? 'Album monitored in Lidarr' : 'Album in Lidarr, unmonitored') : 'Album missing in Lidarr'}</CatalogText>
						{review.paused ? <CatalogText>Artist remains paused. This request runs one manual search for the selected album.</CatalogText> : null}
						<CatalogText>Quality: {review.qualityProfile}{'\n'}Metadata: {review.metadataProfile}{'\n'}Path: {review.rootFolderPath}</CatalogText>
						<CatalogText>Lidarr can acquire a different edition of this album. Availability is checked against the actual imported edition. Playback continues while this request runs.</CatalogText>
						<CatalogButton onPress={onSubmit} selected>Confirm album request</CatalogButton>
					</> : null}
					{request.phase === 'status' && record ? <>
						<CatalogText title>{record.stage}</CatalogText>
						<CatalogText>Search: {record.searchStatus || (record.commandId ? 'submitted' : 'not submitted')}{'\n'}Download: {record.downloadStatus || 'not observed'}{'\n'}Imported tracks: {record.importedTrackCount ?? 'not checked'}</CatalogText>
						{record.error ? <CatalogText>{record.error}</CatalogText> : null}
						{record.lastCheckedAt ? <CatalogText>Checked {new Date(record.lastCheckedAt).toLocaleString()}</CatalogText> : null}
						<CatalogButton onPress={onRefresh}>Check status</CatalogButton>
						{['No source found', 'Failed', 'Import failed'].includes(record.stage) ? <CatalogButton onPress={onRetry}>Review and retry manually</CatalogButton> : null}
						{record.stage === 'Available' && record.playable?.length ? <CatalogButton onPress={onPlay} selected>Play</CatalogButton> : null}
					</> : null}
					{request.phase === 'error' ? <CatalogText>{request.error}</CatalogText> : null}
				</ScrollView>
			</View>
		</View>
	</Modal>
}
