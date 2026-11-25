const DATABASE_NAME = 'campusnav-offline'
const DATABASE_VERSION = 1
const DATASET_STORE = 'datasets'
const MAP_STORE = 'maps'
const META_STORE = 'metadata'

export const API_URL = `${(import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')}/api`

let databaseRequest

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

function floorIdOf(floor) {
  return String(floor?._id || '')
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

export async function getActiveCampusDataset() {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE, META_STORE], 'readonly')
  const done = transactionComplete(transaction)
  const metadata = await requestResult(transaction.objectStore(META_STORE).get('active'))
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
    throw new Error('The active offline campus dataset is incomplete.')
  }
  return {
    version: stored.version,
    syncedAt: metadata.syncedAt || null,
    data: stored.data,
    maps: new Map(maps.map((map) => [map.floorId, map.blob])),
  }
}

async function storeDatasetDraft(version, data) {
  const database = await openDatabase()
  const transaction = database.transaction(DATASET_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  transaction.objectStore(DATASET_STORE).put({ version, data, status: 'staging' })
  await done
}

async function storeMapDraft(version, floorId, blob) {
  const database = await openDatabase()
  const transaction = database.transaction(MAP_STORE, 'readwrite')
  const done = transactionComplete(transaction)
  transaction.objectStore(MAP_STORE).put({ version, floorId, blob })
  await done
}

async function activateDataset(version) {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, META_STORE], 'readwrite')
  const done = transactionComplete(transaction)
  const datasetStore = transaction.objectStore(DATASET_STORE)
  const record = await requestResult(datasetStore.get(version))
  if (!record) {
    transaction.abort()
    throw new Error('The downloaded campus dataset is missing from offline storage.')
  }
  datasetStore.put({ ...record, status: 'ready' })
  transaction.objectStore(META_STORE).put({
    key: 'active',
    version,
    syncedAt: new Date().toISOString(),
  })
  await done
}

export async function discardDatasetDraft(version) {
  const database = await openDatabase()
  const transaction = database.transaction([DATASET_STORE, MAP_STORE, META_STORE], 'readwrite')
  const done = transactionComplete(transaction)
  const active = await requestResult(transaction.objectStore(META_STORE).get('active'))
  if (active?.version === version) {
    await done
    return
  }
  transaction.objectStore(DATASET_STORE).delete(version)
  const mapStore = transaction.objectStore(MAP_STORE)
  const drafts = await requestResult(mapStore.index('byVersion').getAllKeys(version))
  drafts.forEach((key) => mapStore.delete(key))
  await done
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
  const imageUrl = floor.mapImageFileId
    ? `${API_URL}/offline/maps/${encodeURIComponent(String(floor.mapImageFileId))}`
    : floor.mapImage
      ? new URL(floor.mapImage, `${API_URL.replace(/\/api$/, '')}/`).href
      : ''
  if (!imageUrl) {
    return null
  }
  const response = await fetch(imageUrl, { signal })
  if (!response.ok) {
    throw new Error(`The full map image for "${floor.name}" could not be downloaded.`)
  }
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLocaleLowerCase().startsWith('image/')) {
    throw new Error(`The map image for "${floor.name}" is not a valid image.`)
  }
  const blob = await response.blob()
  if (blob.size === 0) {
    throw new Error(`The map image for "${floor.name}" is empty.`)
  }
  if (typeof createImageBitmap === 'function') {
    const image = await createImageBitmap(blob)
    image.close()
  } else {
    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }
  return blob
}

export async function synchronizeCampusDataset(onProgress = () => {}) {
  const active = await getActiveCampusDataset()
  const controller = new AbortController()
  let draftVersion = ''
  try {
    onProgress({ status: 'checking', progress: null, error: '' })
    const versionInfo = await readJson(await fetch(`${API_URL}/offline/version`, {
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

    onProgress({ status: 'synchronizing', progress: 0, error: '' })
    const snapshot = await readJson(await fetch(
      `${API_URL}/offline/dataset?version=${encodeURIComponent(versionInfo.version)}`,
      { cache: 'no-store', signal: controller.signal },
    ))
    if (snapshot.version !== versionInfo.version) {
      throw new Error('Campus data changed before its download could begin. Please refresh again.')
    }
    validateCampusDataset(snapshot.dataset)
    draftVersion = snapshot.version
    await storeDatasetDraft(draftVersion, snapshot.dataset)

    const floorsWithImages = snapshot.dataset.floors.filter(
      (floor) => floor.mapImage || floor.mapImageFileId,
    )
    const total = floorsWithImages.length
    let completed = 0
    for (const floor of floorsWithImages) {
      const blob = await fetchMapBlob(floor, controller.signal)
      if (blob) {
        await storeMapDraft(draftVersion, floorIdOf(floor), blob)
      }
      completed += 1
      onProgress({
        status: 'synchronizing',
        progress: total ? completed / total : 1,
        completed,
        total,
        current: floor.name,
        error: '',
      })
    }

    const latestVersion = await readJson(await fetch(`${API_URL}/offline/version`, {
      cache: 'no-store',
      signal: controller.signal,
    }))
    if (latestVersion.version !== snapshot.version) {
      throw new Error('Campus data changed during download. The previous offline dataset was kept.')
    }

    await activateDataset(draftVersion)
    draftVersion = ''
    const dataset = await getActiveCampusDataset()
    onProgress({ status: 'up-to-date', progress: 1, error: '' })
    return { changed: true, dataset }
  } catch (error) {
    if (draftVersion) {
      await discardDatasetDraft(draftVersion).catch((cleanupError) => {
        console.error('Incomplete campus-data draft could not be removed:', cleanupError)
      })
    }
    onProgress({ status: 'failed', progress: null, error: error.message })
    throw error
  }
}

export function isCampusDatasetUsable(dataset) {
  return Boolean(
    dataset &&
    dataset.data.floors.length > 0 &&
    dataset.data.nodes.length > 0
  )
}
