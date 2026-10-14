import { chromium, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'

const artifactDir = process.env.CASTAFIORE_VERIFY_DIR || '/tmp/castafiore-web-verification'
await fs.mkdir(artifactDir, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CASTAFIORE_CHROME || '/opt/google/chrome/chrome', headless: process.env.CASTAFIORE_HEADLESS !== 'false', args: ['--ozone-platform=wayland'] })
const verify = async (theme, viewport) => {
	const caseName = `${theme}-${viewport.width}`
	const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
	const page = await context.newPage()
	const failures = [], writes = [], categories = [], streams = []
	page.on('pageerror', error => failures.push(error.message))
	const artist = { id: 'a', name: 'Mock Artist', type: 'Group', country: 'GB', disambiguation: 'Test artist' }
	const group = { id: 'g', title: 'Mock Album With A Long Title That Wraps Across The Presentation Header', 'primary-type': 'Album', 'secondary-types': [], 'first-release-date': '2020', 'artist-credit': [{ artist }] }
	const localSong = n => ({ id: `local-${n}`, title: `Mock Song ${n}`, artist: artist.name, artistId: 'local-artist', album: group.title, albumId: 'local-album', duration: 120, track: 1, discNumber: n, musicBrainzId: `r${n}`, mediaType: 'song', suffix: 'wav' })
	let imported = false, command = null, monitored = false
	const scope = createHash('md5').update('https://nav.mock\nmock').digest('hex')
	const integration = { lidarrUrl: 'https://lidarr.mock', apiKey: 'dummy-test-key', qualityProfileId: 1, metadataProfileId: 2, rootFolderPath: '/music', remember: true }
	const remoteAlbum = () => ({ id: 9, foreignAlbumId: 'g', artistId: 1, artist: { id: 1, foreignArtistId: 'a', artistName: artist.name }, title: group.title, monitored, albumType: 'Album', secondaryTypes: [], releases: ['e1', 'e2'].map(foreignReleaseId => ({ foreignReleaseId, status: 'Official', trackCount: 2 })) })
	const reply = (route, data) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data), headers: { 'Access-Control-Allow-Origin': '*' } })
	await context.addInitScript(({ scope, integration, theme }) => {
		localStorage.setItem('config', JSON.stringify({ name: 'Mock Navidrome', url: 'https://nav.mock', username: 'mock', query: 'u=mock&v=1.16.1&c=castafiore' }))
		localStorage.setItem('settings', JSON.stringify({ theme, language: 'en', servers: [], homeOrderV2: [{ id: 'recently-added', enable: true }] }))
		localStorage.setItem(`castafiore.integration.${scope}`, JSON.stringify(integration))
	}, { scope, integration, theme })
	await page.route('https://musicbrainz.org/**', async route => {
		const url = new URL(route.request().url()), entity = url.pathname.replace('/ws/2/', '')
		if (url.searchParams.has('query')) {
			categories.push(entity)
			return reply(route, entity === 'artist' ? { artists: [artist], count: 1 } : entity === 'release-group' ? { 'release-groups': [group], count: 1 } : { recordings: [1, 2].map(n => ({ id: `r${n}`, title: `Mock Song ${n}`, length: 120000, 'artist-credit': [{ artist }] })), count: 2 })
		}
		if (entity === 'artist/a') return reply(route, { ...artist, relations: [{ type: 'streaming', url: { resource: 'https://open.spotify.com/artist/a' } }, { type: 'other', url: { resource: 'https://open.spotify.com/artist/a' } }, { type: 'other', url: { resource: 'https://example.org/artist' } }] })
		if (entity === 'release-group/g') return reply(route, group)
		if (entity === 'release-group') return reply(route, { 'release-groups': [group], 'release-group-count': 1 })
		if (entity === 'release') return reply(route, { releases: ['e1', 'e2'].map((id, index) => ({ id, title: group.title, date: String(2020 + index), country: index ? 'GB' : 'US', status: 'Official', 'release-group': group, 'artist-credit': [{ artist }], media: [{ 'track-count': 2, format: 'CD' }] })), 'release-count': 2 })
		if (entity.startsWith('release/')) { const id = entity.split('/')[1]; return reply(route, { id, title: group.title, date: id === 'e1' ? '2020' : '2021', status: 'Official', 'release-group': group, 'artist-credit': [{ artist }], media: [1, 2].map(n => ({ position: n, format: 'CD', tracks: [{ id: `${id}-${n}`, title: `Mock Song ${n}`, position: 1, length: 120000, recording: { id: `r${n}`, title: `Mock Song ${n}`, length: 120000 } }] })) }) }
		throw new Error(`Unexpected MusicBrainz read: ${entity}`)
	})
	await page.route('https://api.listenbrainz.org/**', async route => {
		const url = new URL(route.request().url())
		if (url.pathname.includes('top-recordings')) return reply(route, [1, 2, 3, 4, 5, 6, 7].map(n => ({ recording_mbid: `r${n}`, recording_name: `Mock Song ${n}`, artist_mbids: ['a'], artist_name: artist.name, release_mbid: 'e1', release_name: group.title, length: 120000, total_listen_count: n * 100, total_user_count: n * 10 })))
		const body = route.request().postDataJSON(), key = Object.keys(body)[0].replace(/s$/, '')
		return reply(route, body[Object.keys(body)[0]].map(id => ({ [key]: id, total_listen_count: id === 'r1' ? null : 100, total_user_count: 10 })))
	})
	await page.route('https://lidarr.mock/**', async route => {
		const path = new URL(route.request().url()).pathname.replace('/api/v1', ''), method = route.request().method()
		if (method !== 'GET') {
			const body = route.request().postDataJSON()
			writes.push({ path, method, body })
			if (path === '/album/monitor') { monitored = true; return reply(route, []) }
			if (path === '/command') { command = { id: 5, name: 'AlbumSearch', body, status: 'queued', started: new Date().toISOString() }; return reply(route, command) }
			throw new Error(`Unexpected mutation: ${method} ${path}`)
		}
		if (path === '/artist') return reply(route, [{ id: 1, foreignArtistId: 'a', artistName: artist.name, path: '/existing/artist', monitored: false, qualityProfileId: 1, metadataProfileId: 2 }])
		if (path === '/album') return reply(route, [remoteAlbum()])
		if (path === '/album/lookup') return reply(route, [remoteAlbum()])
		if (path === '/qualityprofile') return reply(route, [{ id: 1, name: 'Lossless' }])
		if (path === '/metadataprofile') return reply(route, [{ id: 2, name: 'Standard', primaryAlbumTypes: [{ albumType: { name: 'Album' }, allowed: true }], secondaryAlbumTypes: [{ albumType: { name: 'Studio' }, allowed: true }], releaseStatuses: [{ releaseStatus: { name: 'Official' }, allowed: true }] }])
		if (path === '/rootfolder') return reply(route, [{ path: '/music' }])
		if (path === '/command') return reply(route, command ? [command] : [])
		if (path === '/command/5') return reply(route, command)
		if (path === '/queue') return reply(route, { records: [], totalRecords: 0 })
		if (path === '/track') return reply(route, imported ? [1, 2].map(n => ({ hasFile: true, foreignTrackId: `e2-${n}`, foreignRecordingId: `r${n}` })) : [])
		if (path === '/system/status') return reply(route, { version: '3.1.6' })
		throw new Error(`Unexpected Lidarr read: ${path}`)
	})
	await page.route('https://nav.mock/**', async route => {
		const url = new URL(route.request().url()), path = url.pathname.split('/').at(-1).replace('.view', '')
		const localAlbum = { id: 'local-album', name: group.title, artist: artist.name, artistId: 'local-artist', musicBrainzId: imported ? 'e2' : 'e1', songCount: imported ? 2 : 1, year: 2020, song: imported ? [localSong(1), localSong(2)] : [localSong(1)] }
		const subsonic = data => reply(route, { 'subsonic-response': { status: 'ok', version: '1.16.1', type: 'navidrome', serverVersion: 'mock', ...data } })
		if (path === 'search3') return subsonic({ searchResult3: { ...(Number(url.searchParams.get('artistCount')) > 0 ? { artist: [{ id: 'local-artist', name: artist.name, musicBrainzId: 'a' }] } : {}), ...(Number(url.searchParams.get('albumCount')) > 0 ? { album: [localAlbum] } : {}), ...(Number(url.searchParams.get('songCount')) > 0 ? { song: imported ? [localSong(1), localSong(2)] : [localSong(1)] } : {}) } })
		if (path === 'getAlbum') return subsonic({ album: localAlbum })
		if (path === 'getSong') return subsonic({ song: localSong(1) })
		if (path === 'getArtist') return subsonic({ artist: { id: 'local-artist', name: artist.name, musicBrainzId: 'a', album: [localAlbum] } })
		if (path === 'getArtistInfo' || path === 'getArtistInfo2') return subsonic({ [path === 'getArtistInfo' ? 'artistInfo' : 'artistInfo2']: { biography: 'Local test biography', musicBrainzId: 'a', similarArtist: [] } })
		if (path === 'getStarred2') return subsonic({ starred2: { artist: [], album: [], song: [] } })
		if (path === 'getTopSongs') return subsonic({ topSongs: { song: [localSong(1)] } })
		if (path === 'getAlbumList2') return subsonic({ albumList2: { album: [localAlbum] } })
		if (path === 'getPlaylists') return subsonic({ playlists: { playlist: [{ id: 'playlist', name: 'Mock playlist', songCount: 1 }] } })
		if (path === 'getPlaylist') return subsonic({ playlist: { id: 'playlist', name: 'Mock playlist', songCount: 1, entry: [localSong(1)] } })
		if (path === 'getCoverArt') return route.fulfill({ status: 404 })
		if (path === 'stream') {
			streams.push(url.searchParams.get('id'))
			const wave = Buffer.alloc(44 + 16000)
			wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(16000, 40)
			return route.fulfill({ contentType: 'audio/wav', body: wave })
		}
		return subsonic({ genres: { genre: [] }, scanStatus: { scanning: false }, playQueue: { entry: [] } })
	})
	await page.route('https://coverartarchive.org/**', route => route.fulfill({ status: 404 }))
	try {
		await page.goto(process.env.CASTAFIORE_WEB_URL || 'http://127.0.0.1:8781')
		await page.getByText('Search', { exact: true }).last().click()
		await page.getByRole('button', { name: 'Catalog', exact: true }).click()
		await page.getByPlaceholder('Search catalog').fill('Mock')
		await page.getByRole('button', { name: /^Mock Artist/ }).first().click()
		await expect(page.getByText('Local test biography')).toBeVisible()
		await expect(page.getByRole('heading', { name: 'Discography', exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Mock Song 5', exact: true })).toBeVisible()
		await expect(page.getByRole('button', { name: 'Mock Song 6', exact: true })).toHaveCount(0)
		await page.getByRole('button', { name: 'Show more' }).click()
		await expect(page.getByRole('button', { name: 'Mock Song 7', exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Show less' }).click()
		await page.getByRole('button', { name: 'Artist options' }).click()
		await page.getByRole('button', { name: 'External links' }).click()
		await expect(page.getByRole('button', { name: 'Spotify', exact: true })).toHaveCount(1)
		await expect(page.getByRole('button', { name: 'example.org', exact: true })).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByRole('button', { name: 'Spotify', exact: true })).toHaveCount(0)
		await page.getByRole('button', { name: 'Artist options' }).click()
		await page.getByRole('button', { name: 'Catalog information' }).click()
		await expect(page.getByText(/MusicBrainz supplies/)).toBeVisible()
		await page.keyboard.press('Escape')
		await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
		await page.screenshot({ path: `${artifactDir}/artist-${caseName}.png`, fullPage: true })
		await page.getByRole('button', { name: 'Mock Song 1', exact: true }).click()
		await expect(page.getByRole('button', { name: 'View album' })).toBeVisible()
		expect(streams).toEqual([])
		expect(writes).toEqual([])
		await page.getByRole('button', { name: 'View album' }).click()
		await expect(page.getByText('Partial', { exact: true }).first()).toBeVisible()
		await expect(page.getByRole('button', { name: 'Request full album', exact: true })).toHaveCount(1)
		await expect(page.getByText('Disc 1', { exact: true })).toHaveCount(1)
		await expect(page.getByText('Disc 2', { exact: true })).toHaveCount(1)
		const sortControl = page.getByRole('button', { name: 'Sort tracks' })
		await sortControl.focus()
		await sortControl.press('Enter')
		await page.getByRole('button', { name: 'Popularity', exact: true }).click()
		await expect(page.getByText('2.1', { exact: true })).toBeVisible()
		await page.getByRole('button', { name: 'Select edition' }).click()
		await expect(page.getByRole('button', { name: /2020.*US.*CD/ })).toHaveAttribute('aria-pressed', 'true')
		await page.getByRole('button', { name: /2021.*GB.*CD/ }).click()
		await expect(page.getByText('Missing', { exact: true }).first()).toBeVisible()
		await page.getByRole('button', { name: 'Select edition' }).click()
		await page.getByRole('button', { name: /2020.*US.*CD/ }).click()
		await expect(page.getByText('Partial', { exact: true }).first()).toBeVisible()
		await page.screenshot({ path: `${artifactDir}/album-${caseName}.png`, fullPage: true })
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
		await page.getByRole('button', { name: 'Request full album', exact: true }).click()
		await expect(page.getByText(/Artist remains paused/)).toBeVisible()
		await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
		await page.screenshot({ path: `${artifactDir}/request-review-${caseName}.png`, fullPage: true })
		expect(writes).toEqual([])
		await page.keyboard.press('Escape')
		await expect(page.getByRole('button', { name: 'Confirm album request' })).toHaveCount(0)
		await page.getByRole('button', { name: 'Request full album', exact: true }).click()
		await expect(page.getByRole('button', { name: 'Confirm album request' })).toBeVisible()
		expect(writes).toEqual([])
		await page.getByRole('button', { name: 'Confirm album request' }).click()
		await expect(page.getByText('Searching', { exact: true })).toBeVisible()
		expect(writes).toEqual([{ path: '/album/monitor', method: 'PUT', body: { albumIds: [9], monitored: true } }, { path: '/command', method: 'POST', body: { name: 'AlbumSearch', albumIds: [9] } }])
		imported = true
		command.status = 'completed'
		await page.getByRole('button', { name: 'Check status', exact: true }).click()
		await expect(page.getByText('Available', { exact: true })).toBeVisible({ timeout: 10000 })
		await page.screenshot({ path: `${artifactDir}/request-imported-${caseName}.png`, fullPage: true })
		expect(streams).toEqual([])
		await page.getByRole('button', { name: 'Play', exact: true }).click()
		await expect.poll(() => streams.includes('local-1')).toBe(true)
		await expect(page.getByText('Mock Song 1', { exact: true }).last()).toBeVisible()
		const allTabs = []
		for (const tab of ['Home', 'Playlists', 'Settings', 'Search']) { await page.getByText(tab, { exact: true }).last().click(); allTabs.push(tab) }
		await page.getByText('Settings', { exact: true }).last().click()
		await page.getByText('Catalog integrations', { exact: true }).click()
		await expect(page.getByText(`${group.title} · Available`, { exact: true })).toBeVisible()
		await page.getByText(`${group.title} · Available`, { exact: true }).click()
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 10000 })
		await page.getByRole('button', { name: 'Close', exact: true }).click()
		await page.screenshot({ path: `${artifactDir}/settings-${caseName}.png`, fullPage: true })
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
		expect(overflow).toBe(false)
		expect(failures).toEqual([])
		console.log(JSON.stringify({ result: 'passed', theme, viewport, browser: 'isolated Playwright Chrome', categories, writes, streams, allTabs, overflow, pageErrors: failures, artifacts: artifactDir }))
	} catch (error) { await page.screenshot({ path: `${artifactDir}/failure-${caseName}.png`, fullPage: true }); await fs.writeFile(`${artifactDir}/failure-${caseName}.txt`, await page.locator('body').innerText()); throw error } finally { await context.close() }
}
try {
	for (const theme of ['castafiore', 'lightMode']) for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) await verify(theme, viewport)
} finally { await browser.close() }
