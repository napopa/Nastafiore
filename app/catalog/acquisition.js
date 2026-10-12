const unavailable = reason => new Error(`Unavailable in Lidarr: ${reason}`)
const allowed = (items, key, name) => items?.some(i => i.allowed && (i[key]?.name || '').toLowerCase() === String(name).toLowerCase())
const validProfile = (profile, lookup, releaseMbid) => {
	if (!profile || !allowed(profile.primaryAlbumTypes, 'albumType', lookup.albumType)) return false
	const secondary = lookup.secondaryTypes?.length ? lookup.secondaryTypes : ['Studio']
	if (!secondary.every(type => allowed(profile.secondaryAlbumTypes, 'albumType', type))) return false
	return (lookup.releases || []).some(r => (!releaseMbid || r.foreignReleaseId === releaseMbid) && allowed(profile.releaseStatuses, 'releaseStatus', r.status))
}
const commandFor = (commands, albumId, since) => commands.filter(c => c.name === 'AlbumSearch' && c.body?.albumIds?.includes(albumId) && Date.parse(c.started || c.startedOn || c.queued || c.queuedOn || 0) >= since - 2000).sort((a, b) => b.id - a.id)[0]
const journalAlbum = a => ({ kind: 'album', releaseGroupMbid: a.releaseGroupMbid, releaseMbid: a.releaseMbid, title: a.title, date: a.date, releaseType: a.releaseType, secondaryTypes: a.secondaryTypes || [], artist: a.artist ? { mbid: a.artist.mbid, name: a.artist.name } : null })

export const createAcquisition = ({ lidarr, mb, library, journal, isActive = () => true, onChange = () => {}, now = Date.now }) => {
	const records = new Map(), pending = new Map(), polling = new Map()
	let storageGate = Promise.resolve()
	const ready = journal.load().then(items => {
		for (const item of items || []) records.set(item.groupId, item.operation ? { ...item, stage: 'Uncertain' } : item.stage === 'Preparing' ? { ...item, stage: 'Failed', error: 'Setup was interrupted. Review and retry manually' } : item)
		onChange([...records.values()])
	})
	const save = async record => {
		records.set(record.groupId, record)
		storageGate = storageGate.catch(() => {}).then(() => journal.save([...records.values()]))
		await storageGate
		onChange([...records.values()])
		return record
	}
	const api = {
		ready,
		async list() { await ready; return [...records.values()] },
		async review(catalog, defaults) {
			if (!catalog.releaseGroupMbid || !catalog.artist?.mbid) throw unavailable('album or artist identity is incomplete')
			const [artists, lookups, options, remote] = await Promise.all([lidarr.artists(), lidarr.lookupAlbum(catalog.releaseGroupMbid), lidarr.settings(), lidarr.album(catalog.releaseGroupMbid)])
			const lookup = lookups.find(a => a.foreignAlbumId === catalog.releaseGroupMbid && a.artist?.foreignArtistId === catalog.artist.mbid)
			if (!lookup) throw unavailable('release is absent or unsupported')
			const artist = artists.find(a => a.foreignArtistId === catalog.artist.mbid)
			const qualityProfileId = artist?.qualityProfileId ?? Number(defaults.qualityProfileId)
			const metadataProfileId = artist?.metadataProfileId ?? Number(defaults.metadataProfileId)
			const metadataProfile = options.metadata.find(p => p.id === metadataProfileId)
			if (!validProfile(metadataProfile, lookup, catalog.releaseMbid)) throw unavailable('release or edition is excluded by the metadata profile')
			const qualityProfile = options.qualities.find(p => p.id === qualityProfileId)
			if (!qualityProfile) throw new Error('Select a valid Lidarr quality profile')
			if (!artist && !options.roots.some(r => r.path === defaults.rootFolderPath)) throw new Error('Select a valid Lidarr root folder')
			const newArtist = artist || (await lidarr.lookupArtist(catalog.artist.mbid)).find(a => a.foreignArtistId === catalog.artist.mbid)
			if (!newArtist) throw unavailable('artist is absent from metadata')
			return { catalog, lookup, artist: newArtist, existing: !!artist, remote, paused: artist?.monitored === false, qualityProfileId, metadataProfileId, qualityProfile: qualityProfile.name, metadataProfile: metadataProfile.name, rootFolderPath: artist?.path || defaults.rootFolderPath, defaults: { ...defaults } }
		},
		async submit(review, { retry = false } = {}) {
			await ready
			const groupId = review.catalog.releaseGroupMbid
			if (pending.has(groupId)) return pending.get(groupId)
			const previous = records.get(groupId)
			if (previous && (!retry || !['No source found', 'Failed', 'Import failed', 'Partial import'].includes(previous.stage))) return previous.stage === 'Uncertain' ? api.refresh(groupId) : previous
			const work = (async () => {
				let record = previous || { groupId, catalog: journalAlbum(review.catalog), createdAt: now() }
				const mutate = async (kind, write, reconcile, committed = () => ({})) => {
					record = await save({ ...record, stage: 'Preparing', operation: { kind, startedAt: now() } })
					try {
						const result = await write()
						record = await save({ ...record, ...committed(result), operation: null })
						return result
					} catch (error) {
						if (!error.uncertain) throw error
						const result = await reconcile().catch(() => null)
						if (result) { record = await save({ ...record, ...committed(result), operation: null }); return result }
						throw error
					}
				}
				try {
					const current = await api.review(review.catalog, review.defaults)
					if (current.qualityProfileId !== review.qualityProfileId || current.metadataProfileId !== review.metadataProfileId || current.rootFolderPath !== review.rootFolderPath || current.paused !== review.paused) throw new Error('Lidarr settings changed. Review this album again')
					let artist = current.artist
					if (!current.existing) artist = await mutate('artist', () => lidarr.addArtist({ ...artist, id: undefined, rootFolderPath: current.rootFolderPath, qualityProfileId: current.qualityProfileId, metadataProfileId: current.metadataProfileId, monitored: true, monitorNewItems: 'none', addOptions: { monitor: 'none', searchForMissingAlbums: false } }), async () => (await lidarr.artists()).find(a => a.foreignArtistId === review.catalog.artist.mbid), result => ({ artistId: result.id }))
					record = await save({ ...record, artistId: artist.id })
					let album = await lidarr.album(groupId)
					if (!album) album = await mutate('album', () => lidarr.addAlbum({ ...current.lookup, id: undefined, artist, artistId: artist.id, monitored: true, anyReleaseOk: true, addOptions: { searchForNewAlbum: false } }), () => lidarr.album(groupId), result => ({ albumId: result.id }))
					if (!album?.id) throw new Error('Lidarr did not return the selected album')
					record = await save({ ...record, albumId: album.id })
					if (!album.monitored) await mutate('monitor', () => lidarr.monitor(album.id).then(() => true), async () => (await lidarr.album(groupId))?.monitored)
					const searchStartedAt = now()
					record = await save({ ...record, searchStartedAt })
					const active = (await lidarr.commands()).find(c => c.name === 'AlbumSearch' && c.body?.albumIds?.includes(album.id) && ['queued', 'started'].includes(c.status))
					const command = active || await mutate('search', () => lidarr.search(album.id), async () => commandFor(await lidarr.commands(), album.id, searchStartedAt), result => ({ commandId: result.id, stage: 'Searching', error: null }))
					return save({ ...record, stage: 'Searching', commandId: command.id, operation: null, error: null })
				} catch (error) {
					return save({ ...record, stage: error.uncertain || record.operation && !error.status ? 'Uncertain' : 'Failed', error: error.uncertain ? 'Write outcome uncertain. Check remote state before retrying' : error.message, operation: error.uncertain ? record.operation : null })
				}
			})()
			pending.set(groupId, work)
			try { return await work } finally { pending.delete(groupId) }
		},
		async refresh(groupId) {
			await ready
			if (!isActive()) return records.get(groupId)
			if (polling.has(groupId)) return polling.get(groupId)
			const work = (async () => {
				let record = records.get(groupId)
				if (!record || pending.has(groupId)) return record
				try {
					const album = await lidarr.album(groupId)
					if (!isActive()) return record
					if (record.stage === 'Uncertain') {
						const kind = record.operation?.kind
						let found
						if (kind === 'artist') found = (await lidarr.artists()).find(a => a.foreignArtistId === record.catalog.artist.mbid)
						if (kind === 'album') found = album
						if (kind === 'monitor') found = album?.monitored
						if (kind === 'search' && album) found = commandFor(await lidarr.commands(), album.id, record.searchStartedAt)
						if (!found) return record
						record = await save({ ...record, operation: null, stage: kind === 'search' ? 'Searching' : 'Failed', commandId: kind === 'search' ? found.id : record.commandId, error: kind === 'search' ? null : 'Remote write reconciled. Review and retry manually' })
					}
					if (!album) return record
					if (!isActive()) return record
					const [queue, tracks, command] = await Promise.all([lidarr.queue(), lidarr.tracks(album.id), record.commandId ? lidarr.command(record.commandId).catch(() => null) : Promise.resolve(null)])
					if (!isActive()) return record
					const entries = queue.filter(q => q.albumId === album.id || q.album?.id === album.id)
					let stage = record.stage
					const imported = tracks.length > 0 && tracks.every(t => t.hasFile)
					if (imported) {
						stage = 'Waiting for Navidrome'
						const possibilities = []
						for (const r of album.releases || []) {
							if (!isActive()) return record
							if (r.trackCount !== tracks.length) continue
							const edition = await mb.release(r.foreignReleaseId)
							if (edition.tracks.length === tracks.length && edition.tracks.every(t => tracks.some(rt => rt.foreignTrackId === t.trackMbid))) possibilities.push(edition)
						}
						if (possibilities.length === 1) {
							if (!isActive()) return record
							const acquired = possibilities[0]
							const local = await library.match(acquired)
							if (local.availability === 'Available') { stage = 'Available'; record = { ...record, acquiredReleaseMbid: acquired.releaseMbid, acquiredEdition: { releaseMbid: acquired.releaseMbid, title: acquired.editionTitle || acquired.title, editionDate: acquired.editionDate, country: acquired.country }, playable: local.tracks.map(t => t.local) } }
						}
					} else if (entries.some(q => ['warning', 'error'].includes(q.trackedDownloadStatus))) stage = 'Import failed'
					else if (entries.length) stage = entries.some(q => q.status === 'completed' || q.sizeleft === 0) ? 'Importing' : 'Downloading'
					else if (tracks.some(t => t.hasFile)) stage = 'Partial import'
					else if (command?.status === 'failed' || command?.status === 'aborted') stage = 'Failed'
					else if (command?.status === 'completed') stage = 'No source found'
					return save({ ...record, stage, lastCheckedAt: now(), error: null, searchStatus: command?.status || null, downloadStatus: entries.length ? entries[0].status : null, importedTrackCount: tracks.filter(t => t.hasFile).length })
				} catch { return save({ ...record, lastCheckedAt: now(), error: 'Status unavailable. Showing the last known state' }) }
			})()
			polling.set(groupId, work)
			try { return await work } finally { polling.delete(groupId) }
		},
	}
	return api
}
