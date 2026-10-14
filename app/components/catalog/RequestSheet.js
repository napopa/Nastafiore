import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useTheme } from '~/contexts/theme'
import { CatalogText, CatalogButton, Cover } from './ui'
import OptionsPopup from '~/components/popup/OptionsPopup'

export default function RequestSheet({ request, onChoose, onSubmit, onClose, onRefresh, onRetry, onPlay }) {
	const theme = useTheme()
	if (!request) return null
	const album = request.review?.catalog || (request.record?.catalog ? { ...request.record.catalog, releaseMbid: request.record.acquiredEdition?.releaseMbid || request.record.catalog.releaseMbid } : null)
	const review = request.review
	const record = request.record
	return <OptionsPopup visible close={onClose} options={[]} cancelLabel="Close" catalogHeader={{ title: 'Request full album' }}>
		<View style={{ marginHorizontal: 20, gap: 14, paddingBottom: 16 }}>
			{['resolving', 'loading', 'submitting'].includes(request.phase) ? <><ActivityIndicator color={theme.primaryTouch} /><CatalogText>{request.phase === 'submitting' ? 'Submitting and reconciling with Lidarr…' : 'Resolving album identity…'}</CatalogText></> : null}
			{request.phase === 'choose' ? <><CatalogText>Select the full album. Tagged singles and compilations remain options.</CatalogText>{request.choices.map(a => <View key={a.releaseGroupMbid} style={{ gap: 5 }}><CatalogButton onPress={() => onChoose(a)}>{a.title}</CatalogButton><CatalogText>{[a.artist?.name, a.artist?.disambiguation, a.date?.slice(0, 4), a.releaseType, ...(a.secondaryTypes || []), a.disambiguation].filter(Boolean).join(' · ')}</CatalogText></View>)}</> : null}
			{album ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Cover album={album} size={50} /><View style={{ flex: 1 }}><CatalogText variant="group">{album.title}</CatalogText><CatalogText>{[album.artist?.name, album.date?.slice(0, 4), album.releaseType, ...(album.secondaryTypes || [])].filter(Boolean).join(' · ')}</CatalogText></View></View> : null}
			{request.phase === 'review' && review ? <>
				<CatalogText>{review.existing ? 'Existing artist' : 'New artist · other albums and future releases unmonitored'} · {review.remote ? (review.remote.monitored ? 'Album monitored in Lidarr' : 'Album in Lidarr, unmonitored') : 'Album missing in Lidarr'}</CatalogText>
				{review.paused ? <CatalogText>Artist remains paused. This request runs one manual search for the selected album.</CatalogText> : null}
				<CatalogText>Quality: {review.qualityProfile}{'\n'}Metadata: {review.metadataProfile}{'\n'}Path: {review.rootFolderPath}</CatalogText>
				<CatalogText>Lidarr can acquire a different edition of this album. Availability is checked against the actual imported edition. Playback continues while this request runs.</CatalogText>
				<CatalogButton onPress={onSubmit} primary>Confirm album request</CatalogButton>
			</> : null}
			{request.phase === 'status' && record ? <>
				<CatalogText variant="group">{record.stage}</CatalogText>
				{record.acquiredEdition ? <CatalogText>Acquired edition: {[record.acquiredEdition.editionDate, record.acquiredEdition.country, record.acquiredEdition.title].filter(Boolean).join(' · ')}</CatalogText> : null}
				<CatalogText>Search: {record.searchStatus || (record.commandId ? 'submitted' : 'not submitted')}{'\n'}Download: {record.downloadStatus || 'not observed'}{'\n'}Imported tracks: {record.importedTrackCount ?? 'not checked'}</CatalogText>
				{record.error ? <CatalogText>{record.error}</CatalogText> : null}
				{record.lastCheckedAt ? <CatalogText>Checked {new Date(record.lastCheckedAt).toLocaleString()}</CatalogText> : null}
				<CatalogButton onPress={onRefresh}>Check status</CatalogButton>
				{['No source found', 'Failed', 'Import failed', 'Partial import'].includes(record.stage) ? <CatalogButton onPress={onRetry}>Review and retry manually</CatalogButton> : null}
				{record.stage === 'Available' && record.playable?.length ? <CatalogButton onPress={onPlay} primary>Play</CatalogButton> : null}
			</> : null}
			{request.phase === 'error' ? <CatalogText>{request.error}</CatalogText> : null}
		</View>
	</OptionsPopup>
}
