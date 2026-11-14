import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableLocationSelect from '../components/SearchableLocationSelect.jsx'
import buildRouteSegments from '../utils/buildRouteSegments.js'
import groupNodesByFloor from '../utils/groupNodesByFloor.js'
import mapImageUrl from '../utils/mapImageUrl.js'
import { MAX_MAP_ZOOM, MAP_ZOOM_STEP, MIN_MAP_ZOOM, clampMapZoom } from '../utils/mapZoom.js'

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const API_URL = `${SERVER_URL}/api`

async function readResponse(response) {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || 'The request could not be completed.')
  }
  return data
}

function versionedMapImageUrl(serverUrl, imagePath, fileId) {
  const url = mapImageUrl(serverUrl, imagePath)
  if (!url || !fileId) {
    return url
  }
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(fileId))}`
}

let roomsBootstrapRequest
const decodedMapImages = new Map()
const decodedMapImagesReady = new Set()
const decodedMapImageSources = new Map()
const decodedMapImageObjects = new Map()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    decodedMapImageSources.forEach((sourceUrl) => URL.revokeObjectURL(sourceUrl))
  }, { once: true })
}

function loadDecodedMapImage(url, retainSource = false) {
  if (!url) {
    return Promise.reject(new Error('Map image URL is missing.'))
  }
  const cached = decodedMapImages.get(url)
  if (cached) {
    return cached
  }
  const image = new Image()
  decodedMapImageObjects.set(url, image)
  const promise = new Promise((resolve, reject) => {
    image.onload = async () => {
      try {
        await image.decode()
      } catch {
        // The image is already loaded; browsers without a usable decode() can continue.
      }
      decodedMapImagesReady.add(url)
      resolve(url)
    }
    image.onerror = () => reject(new Error(`Map image failed to load: ${url}`))
  })
  decodedMapImages.set(url, promise)
  if (retainSource) {
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Map image request failed with status ${response.status}.`)
        }
        return response.blob()
      })
      .then((blob) => {
        const sourceUrl = URL.createObjectURL(blob)
        decodedMapImageSources.set(url, sourceUrl)
        image.src = sourceUrl
      })
      .catch(reject)
  } else {
    image.src = url
  }
  return promise
}

function loadRoomsBootstrap() {
  if (!roomsBootstrapRequest) {
    roomsBootstrapRequest = fetch(`${API_URL}/navigation/bootstrap`)
      .then(readResponse)
      .finally(() => {
        roomsBootstrapRequest = null
      })
  }

  return roomsBootstrapRequest
}

function UserPage() {
  const [rooms, setRooms] = useState([])
  const [entrances, setEntrances] = useState([])
  const [cabins, setCabins] = useState([])
  const [floors, setFloors] = useState([])
  const [buildings, setBuildings] = useState([])
  const [selectedContextId, setSelectedContextId] = useState('')
  const [selectedDisplayFloorId, setSelectedDisplayFloorId] = useState('')
  const [startNodeId, setStartNodeId] = useState('')
  const [endNodeId, setEndNodeId] = useState('')
  const [route, setRoute] = useState(null)
  const [activeRouteSegmentIndex, setActiveRouteSegmentIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const [mapView, setMapView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [maxMapZoom, setMaxMapZoom] = useState(1)
  const [errorMapImageUrl, setErrorMapImageUrl] = useState('')
  const [loadedMapImageUrl, setLoadedMapImageUrl] = useState('')
  const [mapImageStates, setMapImageStates] = useState({})
  const mapImageStatesRef = useRef(mapImageStates)
  const [isMapPanning, setIsMapPanning] = useState(false)
  const mapStageRef = useRef(null)
  const mapImageRef = useRef(null)
  const mapPanRef = useRef(null)
  const mapPanFrameRef = useRef(null)
  const pendingMapPanRef = useRef(null)
  const mapWheelHandlerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    async function loadRooms() {
      try {
        const [bootstrap, buildingList] = await Promise.all([
          loadRoomsBootstrap(),
          fetch(`${API_URL}/buildings`).then(readResponse),
        ])

        if (active) {
          setFloors(bootstrap.floors)
          setRooms(bootstrap.rooms)
          setEntrances(bootstrap.entrances || [])
          setCabins(bootstrap.cabins || [])
          setBuildings(buildingList)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadRooms()
    return () => {
      active = false
    }
  }, [])

  const floorById = useMemo(
    () => new Map(floors.map((floor) => [String(floor._id), floor])),
    [floors],
  )
  const buildingNameById = useMemo(() => {
    const byId = new Map()
    buildings.forEach((building) => byId.set(building._id, building.name))
    return byId
  }, [buildings])
  const displayFloors = useMemo(
    () => [...floors].sort(
      (first, second) => Number(first.floorNumber) - Number(second.floorNumber),
    ),
    [floors],
  )
  const searchFloors = useMemo(
    () => floors.map((floor) => {
      const buildingId = String(
        (floor.buildingId && typeof floor.buildingId === 'object'
          ? floor.buildingId._id
          : floor.buildingId) || '',
      )
      const contextLabel = floor.context === 'campus'
        ? 'Campus'
        : buildingNameById.get(buildingId) || 'Building'
      return {
        ...floor,
        name: `${contextLabel} · ${floor.name}`,
      }
    }),
    [buildingNameById, floors],
  )
  const mapContexts = useMemo(
    () => [
      { id: 'campus', name: 'Campus Map', meta: `${floors.filter((floor) => floor.context === 'campus').length} maps` },
      ...buildings.map((building) => ({
        id: String(building._id),
        name: building.name,
        meta: `${floors.filter((floor) => String(floor.buildingId?._id || floor.buildingId) === String(building._id)).length} floors`,
      })),
    ],
    [buildings, floors],
  )
  const activeContextId = mapContexts.some((context) => context.id === selectedContextId)
    ? selectedContextId
    : mapContexts[0]?.id || ''
  const contextFloors = useMemo(
    () => displayFloors.filter((floor) => activeContextId === 'campus'
        ? floor.context === 'campus'
        : String(floor.buildingId?._id || floor.buildingId) === activeContextId),
    [activeContextId, displayFloors],
  )
  const locationGroups = useMemo(
    () => groupNodesByFloor(
      [...rooms, ...entrances],
      searchFloors,
    ),
    [entrances, rooms, searchFloors],
  )
  const destinationGroups = useMemo(() => {
    const merged = locationGroups.map((group) => ({ ...group, nodes: [...group.nodes] }))
    const mergedById = new Map(merged.map((group) => [String(group.id), group]))
    cabins.forEach((cabin) => {
      const floorId = String(cabin.floorId?._id || cabin.floorId)
      const group = mergedById.get(floorId)
      if (!group) {
        return
      }
      group.nodes.push({
        _id: `cabin-${cabin._id}`,
        name: cabin.teacherName,
        displayLabel: `${cabin.teacherName} · ${cabin.name}${cabin.staffroomName ? ` · ${cabin.staffroomName}` : ''}`,
        floorId,
        floorName: cabin.floorName,
        destinationNodeId: cabin.destinationNodeId,
        cabin: true,
      })
    })
    return merged
  }, [cabins, locationGroups])
  const selectedDisplayFloor = contextFloors.find(
    (floor) => String(floor._id) === selectedDisplayFloorId,
  ) || contextFloors[0] || null
  const currentMapImageUrl = selectedDisplayFloor?.mapImage
    ? versionedMapImageUrl(SERVER_URL, selectedDisplayFloor.mapImage, selectedDisplayFloor.mapImageFileId)
    : ''
  const currentMapImagePreviewUrl = selectedDisplayFloor?.mapImagePreview
    ? versionedMapImageUrl(SERVER_URL, selectedDisplayFloor.mapImagePreview, selectedDisplayFloor.mapImagePreviewFileId)
    : ''
  const currentMapImageState = selectedDisplayFloor
    ? mapImageStates[String(selectedDisplayFloor._id)] || {}
    : {}
  const cachedOriginalSource = currentMapImageState.originalDisplayUrl ||
    decodedMapImageSources.get(currentMapImageUrl) ||
    currentMapImageUrl
  const originalIsReady = Boolean(currentMapImageUrl) && (
    currentMapImageState.originalReady ||
    decodedMapImagesReady.has(currentMapImageUrl)
  )
  const displayMapImageUrl = originalIsReady
    ? cachedOriginalSource
    : currentMapImagePreviewUrl && !currentMapImageState.previewFailed
      ? currentMapImagePreviewUrl
      : currentMapImageUrl
  const mapIsReady = Boolean(displayMapImageUrl) &&
    loadedMapImageUrl === displayMapImageUrl &&
    errorMapImageUrl !== displayMapImageUrl
  const routeNodes = route?.path || []

  const originalQueueRef = useRef([])
  const originalQueuedRef = useRef(new Set())
  const originalActiveRef = useRef('')
  const originalLoadingRef = useRef(false)
  const selectedFloorIdRef = useRef(selectedDisplayFloorId)

  useEffect(() => {
    selectedFloorIdRef.current = selectedDisplayFloor
      ? String(selectedDisplayFloor._id)
      : selectedDisplayFloorId
  }, [selectedDisplayFloor, selectedDisplayFloorId])

  const updateMapImageState = useCallback((floorId, update) => {
    setMapImageStates((current) => {
      const previous = current[floorId] || {}
      const next = { ...previous, ...update }
      const unchanged = Object.keys(next).every((key) => next[key] === previous[key]) &&
        Object.keys(previous).every((key) => previous[key] === next[key])
      return unchanged
        ? current
        : (() => {
          const updated = { ...current, [floorId]: next }
          mapImageStatesRef.current = updated
          return updated
        })()
    })
  }, [])

  const processOriginalQueue = useCallback(async () => {
    if (originalLoadingRef.current) {
      return
    }
    originalLoadingRef.current = true
    try {
      while (originalQueueRef.current.length > 0) {
        const selectedIndex = originalQueueRef.current.findIndex(
          (item) => item.floorId === selectedFloorIdRef.current,
        )
        const item = originalQueueRef.current.splice(selectedIndex >= 0 ? selectedIndex : 0, 1)[0]
        originalQueuedRef.current.delete(item.url)
        originalActiveRef.current = item.url
        try {
          await loadDecodedMapImage(item.url, true)
          updateMapImageState(item.floorId, {
            originalReady: true,
            originalFailed: false,
            originalDisplayUrl: decodedMapImageSources.get(item.url) || item.url,
          })
        } catch {
          updateMapImageState(item.floorId, { originalReady: false, originalFailed: true })
          if (item.floorId === selectedFloorIdRef.current) {
            setErrorMapImageUrl((current) => current || item.url)
          }
        } finally {
          originalActiveRef.current = ''
        }
      }
    } finally {
      originalLoadingRef.current = false
    }
  }, [updateMapImageState])

  const enqueueOriginal = useCallback((floor, priority = false) => {
    const floorId = String(floor._id)
    const url = floor.mapImage
      ? versionedMapImageUrl(SERVER_URL, floor.mapImage, floor.mapImageFileId)
      : ''
    if (
      !url ||
      mapImageStatesRef.current[floorId]?.originalReady ||
      decodedMapImagesReady.has(url) ||
      originalQueuedRef.current.has(url) ||
      originalActiveRef.current === url
    ) {
      return
    }
    originalQueuedRef.current.add(url)
    const item = { floorId, url }
    if (priority) {
      originalQueueRef.current.unshift(item)
    } else {
      originalQueueRef.current.push(item)
    }
    processOriginalQueue()
  }, [processOriginalQueue])

  useEffect(() => {
    let active = true
    contextFloors.forEach((floor) => {
      const floorId = String(floor._id)
      const originalUrl = floor.mapImage
        ? versionedMapImageUrl(SERVER_URL, floor.mapImage, floor.mapImageFileId)
        : ''
      const previewUrl = floor.mapImagePreview
        ? versionedMapImageUrl(SERVER_URL, floor.mapImagePreview, floor.mapImagePreviewFileId)
        : ''
      setMapImageStates((current) => {
        const previous = current[floorId]
        const sameOriginal = previous?.originalUrl === originalUrl
        const samePreview = previous?.previewUrl === previewUrl
        const nextState = {
          ...previous,
          originalUrl,
          previewUrl,
          originalReady: sameOriginal ? previous?.originalReady : false,
          originalFailed: sameOriginal ? previous?.originalFailed : false,
          originalDisplayUrl: sameOriginal ? previous?.originalDisplayUrl : '',
          previewReady: samePreview ? previous?.previewReady : false,
          previewFailed: samePreview ? previous?.previewFailed : false,
        }
        const unchanged = previous &&
          Object.keys(nextState).every((key) => nextState[key] === previous[key]) &&
          Object.keys(previous).every((key) => previous[key] === nextState[key])
        if (unchanged) {
          return current
        }
        const updated = {
          ...current,
          [floorId]: nextState,
        }
        mapImageStatesRef.current = updated
        return updated
      })
      if (previewUrl) {
        loadDecodedMapImage(previewUrl)
          .then(() => {
            if (active) {
              updateMapImageState(floorId, { previewReady: true, previewFailed: false })
            }
          })
          .catch(() => {
            if (active) {
              updateMapImageState(floorId, { previewReady: false, previewFailed: true })
            }
          })
          .finally(() => enqueueOriginal(floor, floorId === selectedFloorIdRef.current))
      } else {
        enqueueOriginal(floor, floorId === selectedFloorIdRef.current)
      }
    })
    return () => {
      active = false
    }
  }, [contextFloors, selectedDisplayFloorId, enqueueOriginal, updateMapImageState])

  function resetMapView() {
    setMapView({ zoom: 1, panX: 0, panY: 0 })
  }

  function setDisplayFloor(floorId) {
    const currentFloorId = selectedDisplayFloor
      ? String(selectedDisplayFloor._id)
      : selectedDisplayFloorId
    if (String(floorId) === currentFloorId) {
      return
    }
    setErrorMapImageUrl('')
    setLoadedMapImageUrl('')
    resetMapView()
    setMaxMapZoom(1)
    mapPanRef.current = null
    pendingMapPanRef.current = null
    setIsMapPanning(false)
    setSelectedDisplayFloorId(floorId)
  }

  function updateMapZoomLimit() {
    const image = mapImageRef.current
    if (!image || !image.complete || !image.naturalWidth || !image.clientWidth) {
      return
    }
    const nextLimit = MAX_MAP_ZOOM
    setMaxMapZoom((currentLimit) => (
      Math.abs(currentLimit - nextLimit) < 0.01 ? currentLimit : nextLimit
    ))
    setMapView((current) => current.zoom > nextLimit
      ? { ...current, zoom: nextLimit }
      : current)
  }

  function handleMapImageLoad() {
    setLoadedMapImageUrl(displayMapImageUrl)
    updateMapZoomLimit()
  }

  const handleMapImageRef = useCallback((node) => {
    mapImageRef.current = node
    if (node && node.complete && node.naturalWidth) {
      setLoadedMapImageUrl(node.getAttribute('src') || '')
    }
  }, [])

  useEffect(() => {
    const image = mapImageRef.current
    if (!image) {
      setMaxMapZoom(1)
      return undefined
    }
    updateMapZoomLimit()
    const observer = new ResizeObserver(updateMapZoomLimit)
    observer.observe(image)
    return () => observer.disconnect()
  }, [selectedDisplayFloorId, selectedDisplayFloor?.mapImage])

  useEffect(() => () => {
    if (mapPanFrameRef.current !== null) {
      cancelAnimationFrame(mapPanFrameRef.current)
    }
    mapPanRef.current = null
    pendingMapPanRef.current = null
  }, [])

  function zoomMapAtPoint(nextZoom, clientX, clientY) {
    const stage = mapStageRef.current
    if (!stage) return
    const zoom = clampMapZoom(nextZoom, maxMapZoom)
    const bounds = stage.getBoundingClientRect()
    const centerX = bounds.left + bounds.width / 2
    const centerY = bounds.top + bounds.height / 2
    setMapView((current) => {
      const scale = zoom / current.zoom
      return {
        zoom,
        panX: clientX - centerX - (clientX - centerX - current.panX) * scale,
        panY: clientY - centerY - (clientY - centerY - current.panY) * scale,
      }
    })
  }

  function handleMapZoomButton(delta) {
    const stage = mapStageRef.current
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    zoomMapAtPoint(
      mapView.zoom + delta,
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    )
  }

  function handleMapWheel(event) {
    event.preventDefault()
    if (event.target.closest('button, input, select, textarea, .user-room-route-marker, .user-cabin-marker')) {
      return
    }
    zoomMapAtPoint(
      mapView.zoom + (event.deltaY < 0 ? MAP_ZOOM_STEP : -MAP_ZOOM_STEP),
      event.clientX,
      event.clientY,
    )
  }

  useEffect(() => {
    mapWheelHandlerRef.current = handleMapWheel
  })

  useEffect(() => {
    const stage = mapStageRef.current
    if (!stage) {
      return undefined
    }
    function handleNativeMapWheel(event) {
      mapWheelHandlerRef.current?.(event)
    }
    stage.addEventListener('wheel', handleNativeMapWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleNativeMapWheel)
  }, [selectedDisplayFloorId, selectedDisplayFloor?.mapImage])

  function handleMapPointerDown(event) {
    if (event.target.closest('button, input, select, textarea, .user-room-route-marker, .user-cabin-marker')) {
      return
    }
    event.preventDefault()
    mapPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: mapView.panX,
      panY: mapView.panY,
    }
    pendingMapPanRef.current = { panX: mapView.panX, panY: mapView.panY }
    setIsMapPanning(true)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture may be unavailable for synthetic or unsupported pointer events.
    }
  }

  function handleMapPointerMove(event) {
    const pan = mapPanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    const deltaX = event.clientX - pan.startX
    const deltaY = event.clientY - pan.startY
    pendingMapPanRef.current = { panX: pan.panX + deltaX, panY: pan.panY + deltaY }
    if (mapPanFrameRef.current === null) {
      mapPanFrameRef.current = requestAnimationFrame(() => {
        mapPanFrameRef.current = null
        if (pendingMapPanRef.current) {
          setMapView((current) => ({ ...current, ...pendingMapPanRef.current }))
        }
      })
    }
  }

  function handleMapPointerEnd(event) {
    if (!mapPanRef.current || mapPanRef.current.pointerId !== event.pointerId) return
    if (mapPanFrameRef.current !== null) {
      cancelAnimationFrame(mapPanFrameRef.current)
      mapPanFrameRef.current = null
    }
    if (pendingMapPanRef.current) {
      setMapView((current) => ({ ...current, ...pendingMapPanRef.current }))
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // The pointer may already have been released by the browser.
    }
    mapPanRef.current = null
    pendingMapPanRef.current = null
    setIsMapPanning(false)
  }

  function getNodeFloorId(node) {
    const floorId = node?.floorId
    return String(floorId && typeof floorId === 'object' ? floorId._id : floorId)
  }

  function decoratePathNode(node) {
    const floor = floorById.get(getNodeFloorId(node))
    return {
      ...node,
      floorName: floor?.name,
      floorNumber: floor?.floorNumber,
      context: floor?.context,
      buildingId: String((floor?.buildingId && typeof floor.buildingId === 'object'
        ? floor.buildingId._id
        : floor?.buildingId) || ''),
    }
  }

  function getFloorMapLabel(floorId) {
    const floor = floorById.get(floorId)
    if (!floor) {
      return null
    }
    const buildingId = String(
      (floor.buildingId && typeof floor.buildingId === 'object'
        ? floor.buildingId._id
        : floor.buildingId) || '',
    )
    const contextLabel = floor.context === 'campus'
      ? 'Campus'
      : buildingNameById.get(buildingId) || 'Building'
    const buildingWords = contextLabel.split(/\s+/).filter(Boolean)
    const abbreviationCandidates = [
      buildingWords.map((word) => word[0]).join(''),
      ...buildingWords.filter((word) => /^[A-Z]{2,}$/.test(word)),
    ]
      .filter(Boolean)
      .sort((first, second) => second.length - first.length)
    const floorName = abbreviationCandidates.reduce((name, abbreviation) => {
      const prefix = `${abbreviation} `
      return name.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())
        ? name.slice(prefix.length)
        : name
    }, floor.name)
    return `${contextLabel} · ${floorName}`
  }

  function getFloorTransitionMessage(fromNode, toNode, fromFloor, toFloor) {
    const destinationLabel = getFloorMapLabel(String(toFloor?._id)) || toFloor?.name || 'the next floor'
    const fromLevel = Number(fromFloor?.floorNumber)
    const toLevel = Number(toFloor?.floorNumber)
    const direction = Number.isFinite(fromLevel) && Number.isFinite(toLevel)
      ? toLevel > fromLevel
        ? 'up'
        : toLevel < fromLevel
          ? 'down'
          : ''
      : ''
    const usesStaircase = [fromNode, toNode].some((node) => node?.type === 'stair')

    if (usesStaircase) {
      return direction
        ? `Take the staircase ${direction} to ${destinationLabel}.`
        : `Take the staircase to ${destinationLabel}.`
    }
    return `Continue to ${destinationLabel}.`
  }

  const transitions = routeNodes.slice(0, -1).flatMap((node, index) => {
    const nextNode = routeNodes[index + 1]
    if (String(node.floorId) === String(nextNode.floorId)) {
      return []
    }

    const nextFloor = floorById.get(String(nextNode.floorId))
    const currentFloor = floorById.get(String(node.floorId))
    return [{
      key: `${node._id}-${nextNode._id}`,
      afterFloorId: String(node.floorId),
      message: getFloorTransitionMessage(node, nextNode, currentFloor, nextFloor),
    }]
  })

  function clearRoute() {
    setRoute(null)
    setMessage('')
    setError('')
    setActiveRouteSegmentIndex(0)
    setDisplayFloor(contextFloors[0] ? String(contextFloors[0]._id) : '')
  }

  function selectContext(contextId) {
    setSelectedContextId(contextId)
    const nextFloors = displayFloors.filter((floor) => contextId === 'campus'
        ? floor.context === 'campus'
        : String(floor.buildingId?._id || floor.buildingId) === contextId)
    setDisplayFloor(nextFloors[0] ? String(nextFloors[0]._id) : '')
  }

  function swapLocations() {
    setStartNodeId(endNodeId)
    setEndNodeId(startNodeId)
    clearRoute()
  }

  function resolveLocationNodeId(value) {
    if (String(value).startsWith('cabin-')) {
      return cabins.find((cabin) => `cabin-${cabin._id}` === value)?.destinationNodeId
    }
    return value
  }

  async function handleNavigate(event) {
    event.preventDefault()
    clearRoute()

    if (!startNodeId || !endNodeId) {
      setMessage('Select a starting point and a destination.')
      return
    }
    if (startNodeId === endNodeId) {
      setMessage('Starting point and destination must be different.')
      return
    }

    setNavigating(true)
    try {
      const resolvedStartNodeId = resolveLocationNodeId(startNodeId)
      const resolvedEndNodeId = resolveLocationNodeId(endNodeId)
      if (!resolvedStartNodeId || !resolvedEndNodeId) {
        setMessage('A selected teacher cabin cannot be reached from the available maps.')
        return
      }

      const response = await fetch(
        `${API_URL}/navigation/path?start=${encodeURIComponent(resolvedStartNodeId)}&end=${encodeURIComponent(resolvedEndNodeId)}`,
      )
      const result = await readResponse(response)
      if (!result.found) {
        setMessage('No route found between the selected points.')
        return
      }
      const decoratedResult = {
        ...result,
        path: result.path.map(decoratePathNode),
      }
      setRoute(decoratedResult)
      setActiveRouteSegmentIndex(0)
      const firstFloorId = getNodeFloorId(decoratedResult.path[0])
      if (firstFloorId && floorById.get(firstFloorId)) {
        const firstFloor = floorById.get(firstFloorId)
        setSelectedContextId(firstFloor.context === 'campus'
          ? 'campus'
          : String(firstFloor.buildingId?._id || firstFloor.buildingId))
        setDisplayFloor(firstFloorId)
      }
    } catch (routeError) {
      setError(routeError.message)
    } finally {
      setNavigating(false)
    }
  }

  function goToRouteSegment(index) {
    const segment = routeGuidanceSegments[index]
    if (!segment) {
      return
    }
    const floorId = getNodeFloorId(segment.nodes[0])
    if (floorId && floorById.get(floorId)) {
      const floor = floorById.get(floorId)
      setSelectedContextId(floor.context === 'campus'
        ? 'campus'
        : String(floor.buildingId?._id || floor.buildingId))
      setActiveRouteSegmentIndex(index)
      setDisplayFloor(floorId)
      setMessage('')
    } else {
      setMessage('A floor in this route is no longer available. Refresh the route or restore the missing floor.')
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('role')
    navigate('/')
  }

  function floorSegments(floorId) {
    return routeNodes.slice(0, -1).flatMap((node, index) => {
      const nextNode = routeNodes[index + 1]
      if (
        String(node.floorId) !== floorId ||
        String(nextNode.floorId) !== floorId
      ) {
        return []
      }
      return [{
        key: `${node._id}-${nextNode._id}-${index}`,
        from: node,
        to: nextNode,
      }]
    })
  }

  const selectedStartRoom = rooms.find((room) => String(room._id) === startNodeId)
  const selectedEndRoom = rooms.find((room) => String(room._id) === endNodeId)
  const selectedStartEntrance = entrances.find((node) => String(node._id) === startNodeId)
  const selectedEndEntrance = entrances.find((node) => String(node._id) === endNodeId)
  const selectedStartCabin = String(startNodeId).startsWith('cabin-')
    ? cabins.find((cabin) => `cabin-${cabin._id}` === startNodeId)
    : null
  const selectedEndCabin = String(endNodeId).startsWith('cabin-')
    ? cabins.find((cabin) => `cabin-${cabin._id}` === endNodeId)
    : null
  const selectedLocation = (room, entrance, cabin) => {
    if (cabin) return `${cabin.teacherName} · ${cabin.name}${cabin.staffroomName ? ` · ${cabin.staffroomName}` : ''}`
    return room?.displayLabel || room?.name || entrance?.displayLabel || entrance?.name || ''
  }
  const routeFloorNames = []
  for (const node of routeNodes) {
    const floorId = String(node.floorId)
    if (!routeFloorNames.some((item) => item.id === floorId)) {
      const floor = floorById.get(floorId)
      if (floor) {
        routeFloorNames.push({ id: floorId, name: getFloorMapLabel(floorId) || floor.name })
      }
    }
  }
  const displayFloorId = selectedDisplayFloor ? String(selectedDisplayFloor._id) : ''
  const displaySegments = displayFloorId ? floorSegments(displayFloorId) : []
  const destinationFloorId = routeNodes.length > 0
    ? getNodeFloorId(routeNodes[routeNodes.length - 1])
    : ''
  const displayRoomMarkers = route
    ? [
        { room: selectedStartRoom, label: 'Start', className: 'is-start' },
        { room: selectedEndRoom, label: 'Destination', className: 'is-destination' },
      ].filter((marker) => marker.room && marker.room.floorId === displayFloorId)
    : []
  const displayDestinationCabinMarkers = route && selectedEndCabin &&
    String(selectedEndCabin.floorId?._id || selectedEndCabin.floorId) === displayFloorId
    ? [selectedEndCabin]
    : []

  const routeGuidanceSegments = buildRouteSegments(routeNodes)
  const activeRouteGuidanceSegment = routeGuidanceSegments[activeRouteSegmentIndex] || null
  const activeRouteGuidanceFloorId = getNodeFloorId(activeRouteGuidanceSegment?.nodes[0] || {})
  const activeRouteGuidanceEdges = activeRouteGuidanceSegment
    ? activeRouteGuidanceSegment.nodes.slice(0, -1).map((fromNode, index) => {
        const toNode = activeRouteGuidanceSegment.nodes[index + 1]
        return {
          key: `${fromNode._id}-${toNode._id}-segment-${activeRouteSegmentIndex}-${index}`,
          from: fromNode,
          to: toNode,
        }
      })
    : []
  const displayRouteSegments =
    activeRouteGuidanceSegment && activeRouteGuidanceFloorId === displayFloorId
      ? activeRouteGuidanceEdges
      : displaySegments
  const missingFloorInRoute = routeNodes.some((node) => !floorById.get(getNodeFloorId(node)))
  const routeGuidanceMatchesDisplay = activeRouteGuidanceFloorId === displayFloorId
  const isDestinationDisplayFloor = displayFloorId === destinationFloorId
  const routeGuidanceCue = (() => {
    if (!activeRouteGuidanceSegment || !routeGuidanceMatchesDisplay) {
      return ''
    }
    return transitions.find((transition) => transition.afterFloorId === activeRouteGuidanceFloorId)?.message || ''
  })()

  return (
    <main className="user-navigation-page">
      <header className="user-navigation-header">
        <div className="user-navigation-brand">
          <span aria-hidden="true" className="user-brand-mark">C</span>
          <div>
            <strong>CampusNAV</strong>
            <span>WAYFINDING SYSTEM</span>
          </div>
        </div>
        <div className="user-navigation-status">
          <span className="user-status-dot" />
          <span>Live campus map</span>
          {selectedDisplayFloor && <strong>{selectedDisplayFloor.name}</strong>}
        </div>
        <button
          className="user-logout-button"
          onClick={handleLogout}
          type="button"
        >
          Log out
        </button>
      </header>

      <div className="user-navigation-content">
        <section className="user-navigation-intro">
          <div>
            <h1>Navigation Guide</h1>
            <p>Select a building and floor, enter your starting point and destination, then select Find Route to view the navigation path.</p>
          </div>
        </section>

        <div className="user-navigation-layout">
          <aside className="user-route-sidebar">
            <section aria-label="Choose route" className="user-navigation-card">
              <div className="user-card-heading">
                <div>
                  <span className="user-section-index">ROUTE PLANNER</span>
                  <h2>Set your course</h2>
                </div>
              </div>
              <form onSubmit={handleNavigate}>
                <label className="user-navigation-field">
                  <span>From</span>
                  <SearchableLocationSelect
                    ariaLabel="Search starting point"
                    excludedValue={endNodeId}
                    groups={destinationGroups}
                    onChange={(nodeId) => {
                      setStartNodeId(nodeId)
                      clearRoute()
                    }}
                    placeholder="Search room, entrance or teacher..."
                    value={startNodeId}
                  />
                </label>

                <button
                  aria-label="Swap starting point and destination"
                  className="user-swap-button"
                  disabled={!startNodeId && !endNodeId}
                  onClick={swapLocations}
                  type="button"
                >
                  ⇅
                </button>

                <label className="user-navigation-field">
                  <span>To</span>
                  <SearchableLocationSelect
                    ariaLabel="Search destination point"
                    excludedValue={startNodeId}
                    groups={destinationGroups}
                    onChange={(nodeId) => {
                      setEndNodeId(nodeId)
                      clearRoute()
                    }}
                    placeholder="Search room, entrance or teacher..."
                    value={endNodeId}
                  />
                </label>

                {startNodeId && startNodeId === endNodeId && (
                  <p className="user-navigation-message" role="status">
                    Starting point and destination must be different.
                  </p>
                )}

                {message && <p className="user-navigation-message" role="status">{message}</p>}
                {error && <p className="user-navigation-error" role="alert">{error}</p>}

                <div className="user-route-actions">
                  <button
                    className="user-navigate-button"
                    disabled={loading || navigating || !startNodeId || !endNodeId || startNodeId === endNodeId}
                    type="submit"
                  >
                    <span>{navigating ? 'Finding route…' : 'Find route'}</span>
                    <span aria-hidden="true">↗</span>
                  </button>
                  <button
                    className="user-clear-button"
                    disabled={!startNodeId && !endNodeId && !route}
                    onClick={() => {
                      setStartNodeId('')
                      setEndNodeId('')
                      clearRoute()
                    }}
                    type="button"
                  >
                    Clear
                  </button>
                </div>
                {loading && <p className="user-navigation-loading">Loading campus locations…</p>}
                {!loading && !error && rooms.length === 0 && (
                  <p className="user-navigation-loading">No rooms are available yet.</p>
                )}
              </form>
            </section>

            <section aria-label="Map context" className="user-context-panel">
              <div className="user-card-heading">
                <div>
                  <span className="user-section-index">MAP CONTEXT</span>
                  <h2>Explore campus</h2>
                </div>
              </div>
              <div className="user-context-list">
                {mapContexts.map((context) => (
                  <button
                    aria-pressed={activeContextId === context.id}
                    className={`user-context-button${activeContextId === context.id ? ' is-active' : ''}`}
                    key={context.id}
                    onClick={() => selectContext(context.id)}
                    type="button"
                  >
                    <span>{context.name}</span>
                    <small>{context.meta}</small>
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <section aria-live="polite" className="user-route-results">
            <div className="user-map-header">
              <div>
                <span className="user-section-index">NAVIGATION VIEW</span>
                <h2>{selectedDisplayFloor ? getFloorMapLabel(String(selectedDisplayFloor._id)) : 'Select a floor'}</h2>
              </div>
              {route && (
                <span className="user-route-live"><i /> Route active</span>
              )}
            </div>
            {route && (
              <div className="user-route-summary">
                <div className="user-summary-title">
                  <span className="user-section-index">YOUR ROUTE</span>
                  <strong>{routeFloorNames.length} {routeFloorNames.length === 1 ? 'floor' : 'floors'}</strong>
                </div>
                <div className="user-route-summary-details">
                  <div><span>From</span><strong>{selectedLocation(selectedStartRoom, selectedStartEntrance, selectedStartCabin)}</strong></div>
                  <div><span>To</span><strong>{selectedLocation(selectedEndRoom, selectedEndEntrance, selectedEndCabin)}</strong></div>
                  <div><span>Distance</span><strong>{Number(route.distance).toFixed(2)} units</strong></div>
                  <div><span>Floors along your route</span><strong>{routeFloorNames.map((floor) => floor.name).join(' → ')}</strong></div>
                </div>
                {missingFloorInRoute && <p className="user-navigation-message">A floor in this route is no longer available. Some maps may be missing.</p>}
              </div>
            )}
            {route && routeGuidanceSegments.length > 1 && (
              <section aria-label="Route map guide" className="user-route-guidance">
                <div className="user-route-guidance-step">
                  <span className="user-route-guidance-indicator">Current floor: {getFloorMapLabel(activeRouteGuidanceFloorId) || 'Unavailable floor'}</span>
                  {routeGuidanceMatchesDisplay && isDestinationDisplayFloor && <span className="user-route-guidance-arrival">Your destination is on this floor.</span>}
                </div>
                {routeGuidanceCue && <p className="user-stair-transition">{routeGuidanceCue}</p>}
                <div className="user-route-guidance-actions">
                  <button className="user-guidance-back-button" disabled={activeRouteSegmentIndex === 0} onClick={() => goToRouteSegment(activeRouteSegmentIndex - 1)} type="button">Back</button>
                  <button className="user-guidance-next-button" disabled={activeRouteSegmentIndex === routeGuidanceSegments.length - 1} onClick={() => goToRouteSegment(activeRouteSegmentIndex + 1)} type="button">Next</button>
                </div>
              </section>
            )}
            {contextFloors.length === 0 && !loading && (
              <div className="user-empty-state"><span>⌁</span><strong>No floor maps in this context</strong><p>Select another map context or ask an administrator to add a floor map.</p></div>
            )}
            {contextFloors.length > 0 && (
              <div className="user-route-viewer">
                {activeContextId !== 'campus' && (
                  <nav aria-label="Select floor" className="user-floor-selector">
                    {contextFloors.map((floor) => {
                      const floorId = String(floor._id)
                      const floorNumber = Number(floor.floorNumber) === 0 ? 'G' : floor.floorNumber
                      return (
                        <button
                          aria-label={`${floor.name}, floor ${floorNumber}`}
                          aria-pressed={selectedDisplayFloor?._id === floor._id}
                          className={`user-floor-button${selectedDisplayFloor?._id === floor._id ? ' is-active' : ''}`}
                          key={floorId}
                          onClick={() => setDisplayFloor(floorId)}
                          type="button"
                        >
                          <strong>{floorNumber}</strong>
                          <span>{floor.name}</span>
                        </button>
                      )
                    })}
                  </nav>
                )}
                {selectedDisplayFloor && (
                  <section aria-label={`${selectedDisplayFloor.name} map`} className="user-route-floor">
                    {selectedDisplayFloor.mapImage ? (
                      <div
                        className={`user-route-map-stage${isMapPanning ? ' is-panning' : ''}`}
                        onPointerCancel={handleMapPointerEnd}
                        onPointerDown={handleMapPointerDown}
                        onPointerMove={handleMapPointerMove}
                        onPointerUp={handleMapPointerEnd}
                        ref={mapStageRef}
                      >
                        <div className="user-map-view-controls" role="toolbar" aria-label="Map view controls">
                          <button
                            aria-label="Zoom in"
                            disabled={mapView.zoom >= maxMapZoom}
                            onClick={() => handleMapZoomButton(MAP_ZOOM_STEP)}
                            type="button"
                          >
                            +
                          </button>
                          <button
                            aria-label="Zoom out"
                            disabled={mapView.zoom <= MIN_MAP_ZOOM}
                            onClick={() => handleMapZoomButton(-MAP_ZOOM_STEP)}
                            type="button"
                          >
                            −
                          </button>
                          <span aria-label={`${Math.round(mapView.zoom * 100)} percent zoom`}>
                            {Math.round(mapView.zoom * 100)}%
                          </span>
                          <button aria-label="Reset map view" onClick={resetMapView} type="button">
                            Reset
                          </button>
                        </div>
                        <div
                          className="user-route-map-canvas"
                          style={{
                            transform: `translate(${mapView.panX}px, ${mapView.panY}px) scale(${mapView.zoom})`,
                          }}
                        >
                          <img
                            alt={`${selectedDisplayFloor.name} route map`}
                            className="user-route-map-image"
                            key={`${selectedDisplayFloor._id}-${selectedDisplayFloor.mapImageFileId || selectedDisplayFloor.mapImage}-${displayMapImageUrl}`}
                            onError={() => setErrorMapImageUrl(displayMapImageUrl)}
                            onLoad={handleMapImageLoad}
                            ref={handleMapImageRef}
                            src={displayMapImageUrl}
                          />
                          {errorMapImageUrl && errorMapImageUrl === displayMapImageUrl && (
                            <p className="user-navigation-error map-image-error" role="alert">
                              This floor map could not be loaded. Please ask an administrator to replace it.
                            </p>
                          )}
                          {mapIsReady && (
                            <>
                              <svg aria-hidden="true" className="user-route-map-overlay" preserveAspectRatio="none" viewBox="0 0 100 100">
                                {displayRouteSegments.map((segment) => <line key={segment.key} x1={segment.from.x} y1={segment.from.y} x2={segment.to.x} y2={segment.to.y} />)}
                              </svg>
                              {displayRoomMarkers.map(({ room, label, className }) => (
                                <div aria-label={`${label}: ${room.name}`} className={`user-room-route-marker ${className}`} key={`${label}-${room._id}`} role="img" style={{ left: `${room.x}%`, top: `${room.y}%` }}>
                                  <span className="user-room-route-marker-pin" /><span className="user-room-route-marker-label"><strong>{label}</strong><span>{room.name}</span></span>
                                </div>
                              ))}
                              {displayDestinationCabinMarkers.map((cabin) => (
                                <div aria-label={`Teacher cabin: ${cabin.name} for ${cabin.teacherName}`} className="user-cabin-marker is-destination" key={cabin._id} role="img" style={{ left: `${cabin.x}%`, top: `${cabin.y}%` }}>
                                  <span className="user-cabin-marker-pin" /><span className="user-cabin-marker-label"><strong>Destination</strong><span>{cabin.teacherName}</span></span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    ) : <div className="user-empty-state compact"><span>⌁</span><strong>No map image available</strong><p>This floor has no uploaded floor plan.</p></div>}
                    {(!routeGuidanceMatchesDisplay || routeGuidanceSegments.length <= 1) && (
                      isDestinationDisplayFloor
                        ? <p className="user-stair-transition">Your destination is on this floor.</p>
                        : transitions.filter((transition) => transition.afterFloorId === displayFloorId).map((transition) => <p className="user-stair-transition" key={transition.key}>{transition.message}</p>)
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

export default UserPage
