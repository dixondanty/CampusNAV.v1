import { API_BASE_URL, API_URL, apiFetch } from './api.js'

const DATABASE_NAME = 'campusnav-offline'
const DATABASE_VERSION = 1
const DATASET_STORE = 'datasets'
const MAP_STORE = 'maps'
const META_STORE = 'metadata'
const ACTIVE_KEY = 'active'
const SYNC_KEY = 'sync'
const SYNC_OWNER = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const SYNC_CLAIM_STALE_MS = 10 * 60 * 1000
const SYNC_HEARTBEAT_MS = 60 * 1000

let databaseRequest
let syncPromise
const inFlightVersions = new Set()

function openDatabase() {
  if (!('indexedDB' in window)) {
    return Promise.reject(new Error('This browser does not support offline storage.'))
  }
  if (!databaseRequest) {
    databaseRequest = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(DATASET_STORE)) {
          database.createObjectStore(DATASET_STORE, { keyPath: 'version' })
        }
        if (!database.objectStoreNames.contains(MAP_STORE)) {
          const maps = database.createObjectStore(MAP_STORE, { keyPath: ['version', 'floorId'] })
          maps.createIndex('byVersion', 'version', { unique: false })
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Offline storage could not be opened.'))
      request.onblocked = () => reject(new Error('Offline storage is blocked by another CampusNAV tab.'))
    }).catch((error) => {
      databaseRequest = null
      throw error
    })
  }
  return databaseRequest
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Offline storage request failed.'))
  })
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve
    transaction.onabort = () => reject(transaction.error || new Error('Offline storage transaction was aborted.'))
    transaction.onerror = () => reject(transaction.error || new Error('Offline storage transaction failed.'))
  })
}

async function abortTransaction(transaction, done, message) {
  transaction.abort()
  await done.catch(() => {})
  throw new Error(message)
}

function floorIdOf(floor) {
  return String(floor?._id || '')
}

function mapSourceIdentity(floor) {
  if (floor?.mapImageFileId) {
    return `file:${String(floor.mapImageFileId)}`
  }
  if (floor?.mapImage) {
    const image = String(floor.mapImage)
    const base = API_BASE_URL ||
      (typeof window !== 'undefined' ? window.location.origin : '') ||
      'http://localhost'
    try {
      return `url:${new URL(image, base).href}`
    } catch {
      return `url:${image}`
    }
  }
  return ''
}

export function validateCampusDataset(dataset) {
  if (
    !dataset ||
    !Array.isArray(dataset.buildings) ||
    !Array.isArray(dataset.floors) ||
    !Array.isArray(dataset.nodes) ||
    !Array.isArray(dataset.connections) ||
    !Array.isArray(dataset.cabins)
  ) {
    throw new Error('The campus-data snapshot is incomplete.')
  }

  const buildingIds = new Set(dataset.buildings.map((item) => String(item._id)))
  const floorIds = new Set(dataset.floors.map((item) => String(item._id)))
  const nodeIds = new Set(dataset.nodes.map((item) => String(item._id)))

  for (const floor of dataset.floors) {
    const buildingId = floor.buildingId?._id || floor.buildingId
    if (buildingId && !buildingIds.has(String(buildingId))) {
      throw new Error(`Floor "${floor.name}" references a missing building.`)
    }
  }
  for (const node of dataset.nodes) {
    if (!floorIds.has(String(node.floorId?._id || node.floorId))) {
      throw new Error(`Navigation node "${node.name}" references a missing floor.`)
    }
  }
  for (const connection of dataset.connections) {
    const distance = Number(connection.distance)
    if (
      !nodeIds.has(String(connection.from?._id || connection.from)) ||
      !nodeIds.has(String(connection.to?._id || connection.to)) ||
      !Number.isFinite(distance) ||
      distance < 0
    ) {
      throw new Error('A campus connection is invalid or references a missing node.')
    }
  }
  for (const cabin of dataset.cabins) {
    if (
      !floorIds.has(String(cabin.floorId?._id || cabin.floorId)) ||
      !nodeIds.has(String(cabin.staffroomRoomId?._id || cabin.staffroomRoomId))
    ) {
      throw new Error(`Teacher cabin "${cabin.name}" references missing campus data.`)
    }
  }
  return true
}

function buildDataset(stored, metadata, maps) {
  const floors = Array.isArray(stored.data?.floors) ? stored.data.floors : []
  const datasetSources = new Map(floors.map((floor) => [floorIdOf(floor), mapSourceIdentity(floor)]))
  const mapSources = new Map()
  const blobs = new Map()
  for (const map of maps) {
    mapSources.set(map.floorId, map.source || datasetSources.get(map.floorId) || '')
    blobs.set(map.floorId, map.blob)
  }
  return {
    version: stored.version,
    syncedAt: metadata?.syncedAt || null,
    data: stored.data,
    maps: blobs,
    mapSources,
  }
}

async function readActiveDataset() {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE, META_STORE], 'readonly')
  const done = transactionComplete(transaction)
  const metadata = await requestResult(transaction.objectStore(META_STORE).get(ACTIVE_KEY))
  if (!metadata?.version) {
    await done
    return null
  }
  const stored = await requestResult(transaction.objectStore(DATASET_STORE).get(metadata.version))
  const maps = await requestResult(
    transaction.objectStore(MAP_STORE).index('byVersion').getAll(metadata.version),
  )
  await done
  if (!stored || stored.status !== 'ready') {
    return null
  }
  return buildDataset(stored, metadata, maps)
}

export async function getActiveCampusDataset() {
  const dataset = await readActiveDataset()
  if (!dataset) {
    throw new Error('The active offline campus dataset is incomplete.')
  }
  return dataset
}

async function storeDatasetDraft(version, data) {
  const database = await openDatabase()
  const transaction = database.transaction(DATASET_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  transaction.objectStore(DATASET_STORE).put({ version, data, status: 'staging' })
  await done
}

async function storeMapDraft(version, floor, blob) {
  const database = await openDatabase()
  const transaction = database.transaction(MAP_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  transaction.objectStore(MAP_STORE).put({
    version,
    floorId: floorIdOf(floor),
    source: mapSourceIdentity(floor),
    blob,
  })
  await done
}

async function validateMapBlob(blob, floorName) {
  const label = floorName || 'floor map'
  if (!blob || typeof blob.size !== 'number' || blob.size === 0) {
    throw new Error(`The map image for "${label}" is empty.`)
  }

  if (typeof createImageBitmap === 'function') {
    let image
    try {
      image = await createImageBitmap(blob)
      return true
    } catch {} finally {
      try {
        image?.close?.()
      } catch {}
    }
  }

  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return true
  }
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    const decoded = new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error(`The map image for "${label}" is not a valid image.`))
      image.src = objectUrl
      if (typeof image.decode === 'function') {
        image.decode().then(resolve, reject)
      }
    })
    await decoded
    return true
  } catch {
    throw new Error(`The map image for "${label}" is not a valid image.`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function readJson(response) {
  let body
  try {
    body = await response.json()
  } catch {
    throw new Error('The campus-data service returned an invalid response.')
  }
  if (!response.ok) {
    throw new Error(body.message || 'The campus-data request failed.')
  }
  return body
}

async function fetchMapBlob(floor, signal) {
  const source = mapSourceIdentity(floor)
  if (!source) {
    return null
  }
  const imageUrl = floor.mapImageFileId
    ? `${API_URL}/offline/maps/${encodeURIComponent(String(floor.mapImageFileId))}`
    : new URL(String(floor.mapImage), API_BASE_URL || window.location.origin).href
  const response = await apiFetch(imageUrl, { signal })
  if (!response.ok) {
    throw new Error(`The full map image for "${floor.name}" could not be downloaded.`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLocaleLowerCase().startsWith('image/')) {
    throw new Error(`The map image for "${floor.name}" is not a valid image.`)
  }
  const blob = await response.blob()
  await validateMapBlob(blob, floor.name)
  return blob
}

async function validateStagingDataset(version) {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE], 'readonly')
  const done = transactionComplete(transaction)
  const stored = await requestResult(transaction.objectStore(DATASET_STORE).get(version))
  if (!stored || stored.status !== 'staging' || stored.version !== version) {
    await abortTransaction(
      transaction,
      done,
      'The downloaded campus dataset is missing from offline storage.',
    )
  }
  validateCampusDataset(stored.data)
  const maps = await requestResult(transaction.objectStore(MAP_STORE).index('byVersion').getAll(version))
  await done
  const mapsByFloor = new Map(maps.map((map) => [map.floorId, map]))
  for (const floor of stored.data.floors) {
    const source = mapSourceIdentity(floor)
    if (!source) {
      continue
    }
    const map = mapsByFloor.get(floorIdOf(floor))
    if (!map) {
      throw new Error(`The offline map for "${floor.name}" is missing.`)
    }
    if (map.source !== source) {
      throw new Error(`The offline map for "${floor.name}" does not match its current image.`)
    }
    await validateMapBlob(map.blob, floor.name)
  }
  return true
}

async function activateDataset(version) {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, META_STORE], 'readwrite')
  const done = transactionComplete(transaction)
  const datasetStore = transaction.objectStore(DATASET_STORE)
  const metadataStore = transaction.objectStore(META_STORE)
  const record = await requestResult(datasetStore.get(version))
  const active = await requestResult(metadataStore.get(ACTIVE_KEY))
  if (!record) {
    await abortTransaction(
      transaction,
      done,
      'The downloaded campus dataset is missing from offline storage.',
    )
  }
  if (record.status !== 'staging' && active?.version !== version) {
    await abortTransaction(
      transaction,
      done,
      'The downloaded campus dataset was not ready for activation.',
    )
  }
  if (record.status === 'ready' && active?.version === version) {
    await done
    return
  }
  datasetStore.put({ ...record, status: 'ready' })
  metadataStore.put({
    key: ACTIVE_KEY,
    version,
    syncedAt: new Date().toISOString(),
  })
  await done
}

async function removeDatasetDraft(version, { ignoreInFlight = false } = {}) {
  if (!version || (!ignoreInFlight && inFlightVersions.has(version))) {
    return
  }
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE, META_STORE], 'readwrite')
  const done = transactionComplete(transaction)
  const metadataStore = transaction.objectStore(META_STORE)
  const datasetStore = transaction.objectStore(DATASET_STORE)
  const mapStore = transaction.objectStore(MAP_STORE)
  const active = await requestResult(metadataStore.get(ACTIVE_KEY))
  const claim = await requestResult(metadataStore.get(SYNC_KEY))
  const record = await requestResult(datasetStore.get(version))
  const claimIsActiveElsewhere = claim &&
    claim.version === version &&
    claim.owner !== SYNC_OWNER &&
    Date.now() - Number(claim.updatedAt || 0) < SYNC_CLAIM_STALE_MS
  if (
    !claimIsActiveElsewhere &&
    active?.version !== version &&
    record?.status !== 'ready'
  ) {
    datasetStore.delete(version)
    const drafts = await requestResult(mapStore.index('byVersion').getAllKeys(version))
    drafts.forEach((key) => mapStore.delete(key))
  }
  await done
}

export async function discardDatasetDraft(version) {
  await removeDatasetDraft(version)
}

export async function cleanupCampusDatasetDrafts() {
  await cleanupAbandonedStaging()
}

async function cleanupAbandonedStaging() {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE, META_STORE], 'readwrite')
  const done = transactionComplete(transaction)
  const metadataStore = transaction.objectStore(META_STORE)
  const datasetStore = transaction.objectStore(DATASET_STORE)
  const mapStore = transaction.objectStore(MAP_STORE)
  const claim = await requestResult(metadataStore.get(SYNC_KEY))
  const claimAge = Date.now() - Number(claim?.updatedAt || 0)
  if (claim && claimAge < SYNC_CLAIM_STALE_MS && claim.owner !== SYNC_OWNER) {
    await done
    return
  }
  if (claim) {
    metadataStore.delete(SYNC_KEY)
  }
  const active = await requestResult(metadataStore.get(ACTIVE_KEY))
  const records = await requestResult(datasetStore.getAll())
  const maps = await requestResult(mapStore.getAll())
  const readyVersions = new Set(records.filter((record) => record.status === 'ready').map((record) => record.version))
  const candidates = new Set([
    ...records.filter((record) => record.status === 'staging').map((record) => record.version),
    ...maps.map((map) => map.version),
  ])
  for (const version of candidates) {
    if (!version || version === active?.version || inFlightVersions.has(version) || readyVersions.has(version)) {
      continue
    }
    datasetStore.delete(version)
  }
  for (const map of maps) {
    if (
      !map.version ||
      map.version === active?.version ||
      inFlightVersions.has(map.version) ||
      readyVersions.has(map.version)
    ) {
      continue
    }
    mapStore.delete([map.version, map.floorId])
  }
  await done
}

async function acquireSyncClaim(version) {
  const database = await openDatabase()
  const transaction = database.transaction(META_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  const metadataStore = transaction.objectStore(META_STORE)
  const existing = await requestResult(metadataStore.get(SYNC_KEY))
  if (
    existing &&
    existing.owner !== SYNC_OWNER &&
    Date.now() - Number(existing.updatedAt || 0) < SYNC_CLAIM_STALE_MS
  ) {
    await done
    throw new Error('Campus data is already being synchronized in another CampusNAV window.')
  }
  metadataStore.put({ key: SYNC_KEY, version, owner: SYNC_OWNER, updatedAt: Date.now() })
  await done
}

async function touchSyncClaim(version) {
  const database = await openDatabase()
  const transaction = database.transaction(META_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  const metadataStore = transaction.objectStore(META_STORE)
  const existing = await requestResult(metadataStore.get(SYNC_KEY))
  if (existing?.owner === SYNC_OWNER && existing.version === version) {
    metadataStore.put({ ...existing, updatedAt: Date.now() })
  }
  await done
}

async function releaseSyncClaim(version) {
  const database = await openDatabase()
  const transaction = database.transaction(META_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  const metadataStore = transaction.objectStore(META_STORE)
  const existing = await requestResult(metadataStore.get(SYNC_KEY))
  if (existing?.owner === SYNC_OWNER && existing.version === version) {
    metadataStore.delete(SYNC_KEY)
  }
  await done
}

function buildReusableMapSources(active) {
  const reusable = new Map()
  if (!active) {
    return reusable
  }
  const floors = Array.isArray(active.data?.floors) ? active.data.floors : []
  for (const floor of floors) {
    const source = mapSourceIdentity(floor)
    const floorId = floorIdOf(floor)
    const storedSource = active.mapSources?.get(floorId)
    if (!source || (storedSource && storedSource !== source)) {
      continue
    }
    const blob = active.maps?.get(floorId)
    if (blob && !reusable.has(source)) {
      reusable.set(source, blob)
    }
  }
  return reusable
}

export async function synchronizeCampusDataset(onProgress = () => {}) {
  if (syncPromise) {
    return syncPromise
  }

  syncPromise = (async () => {
    const controller = new AbortController()
    let draftVersion = ''
    let stagedVersion = ''
    let heartbeat = null
    try {
      const active = await readActiveDataset()
      await cleanupAbandonedStaging().catch((cleanupError) => {
        console.error('Abandoned campus-data drafts could not be cleaned up:', cleanupError)
      })
      onProgress({ status: 'checking', progress: null, current: '', currentAction: '', error: '' })
      const versionInfo = await readJson(await apiFetch(`${API_URL}/offline/version`, {
        cache: 'no-store',
        signal: controller.signal,
      }))
      if (!versionInfo.version) {
        throw new Error('The campus-data service did not provide a dataset version.')
      }
      if (active?.version === versionInfo.version) {
        onProgress({ status: 'up-to-date', progress: 1, error: '' })
        return { changed: false, dataset: active }
      }

      await acquireSyncClaim(versionInfo.version)
      stagedVersion = versionInfo.version
      inFlightVersions.add(stagedVersion)
      heartbeat = setInterval(() => {
        touchSyncClaim(stagedVersion).catch(() => {})
      }, SYNC_HEARTBEAT_MS)
      onProgress({
        status: 'synchronizing',
        progress: 0,
        completed: 0,
        total: 0,
        current: '',
        currentAction: '',
        error: '',
      })
      const snapshot = await readJson(await apiFetch(
        `${API_URL}/offline/dataset?version=${encodeURIComponent(versionInfo.version)}`,
        { cache: 'no-store', signal: controller.signal },
      ))
      if (snapshot.version !== stagedVersion) {
        throw new Error('Campus data changed before its download could begin. Please refresh again.')
      }
      validateCampusDataset(snapshot.dataset)
      draftVersion = stagedVersion
      await storeDatasetDraft(draftVersion, snapshot.dataset)

      const reusable = buildReusableMapSources(active)
      const requiredFloors = snapshot.dataset.floors.filter((floor) => Boolean(mapSourceIdentity(floor)))
      let completed = 0
      for (const floor of requiredFloors) {
        const source = mapSourceIdentity(floor)
        const reusedBlob = reusable.get(source)
        const blob = reusedBlob || await fetchMapBlob(floor, controller.signal)
        if (!blob) {
          throw new Error(`The offline map for "${floor.name}" is missing.`)
        }
        await storeMapDraft(draftVersion, floor, blob)
        completed += 1
        onProgress({
          status: 'synchronizing',
          progress: requiredFloors.length ? completed / requiredFloors.length : 1,
          completed,
          total: requiredFloors.length,
          current: floor.name,
          currentAction: reusedBlob ? 'reused' : 'downloaded',
          error: '',
        })
      }

      const latestVersion = await readJson(await apiFetch(`${API_URL}/offline/version`, {
        cache: 'no-store',
        signal: controller.signal,
      }))
      if (latestVersion.version !== draftVersion) {
        throw new Error('Campus data changed during download. The previous offline dataset was kept.')
      }

      await validateStagingDataset(draftVersion)
      await activateDataset(draftVersion)
      draftVersion = ''
      const dataset = await getActiveCampusDataset()
      onProgress({ status: 'up-to-date', progress: 1, error: '' })
      return { changed: true, dataset }
    } catch (error) {
      controller.abort()
      if (draftVersion) {
        await removeDatasetDraft(draftVersion, { ignoreInFlight: true }).catch((cleanupError) => {
          console.error('Incomplete campus-data draft could not be removed:', cleanupError)
        })
      }
      onProgress({ status: 'failed', progress: null, error: error.message })
      throw error
    } finally {
      if (heartbeat !== null) {
        clearInterval(heartbeat)
      }
      if (stagedVersion) {
        inFlightVersions.delete(stagedVersion)
      }
      if (stagedVersion) {
        await releaseSyncClaim(stagedVersion).catch((releaseError) => {
          console.error('Campus-data synchronization claim could not be released:', releaseError)
        })
      }
      syncPromise = null
    }
  })()
  return syncPromise
}

export function isCampusDatasetUsable(dataset) {
  return Boolean(
    dataset &&
    dataset.data?.floors?.length > 0 &&
    dataset.data?.nodes?.length > 0
  )
}
