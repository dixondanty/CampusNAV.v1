import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SearchableLocationSelect from '../components/SearchableLocationSelect.jsx'
import buildRouteSegments from '../utils/buildRouteSegments.js'
import groupNodesByFloor from '../utils/groupNodesByFloor.js'

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'
const API_URL = `${SERVER_URL}/api`

async function readResponse(response) {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || 'The request could not be completed.')
  }
  return data
}

let roomsBootstrapRequest

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
  const [cabins, setCabins] = useState([])
  const [floors, setFloors] = useState([])
  const [buildings, setBuildings] = useState([])
  const [selectedDisplayFloorId, setSelectedDisplayFloorId] = useState('')
  const [startNodeId, setStartNodeId] = useState('')
  const [endNodeId, setEndNodeId] = useState('')
  const [route, setRoute] = useState(null)
  const [activeRouteSegmentIndex, setActiveRouteSegmentIndex] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
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
  const displayFloors = [...floors].sort(
    (first, second) => Number(first.floorNumber) - Number(second.floorNumber),
  )
  const roomGroups = groupNodesByFloor(rooms, floors)
  const destinationGroups = useMemo(() => {
    if (cabins.length === 0) {
      return roomGroups
    }

    const merged = roomGroups.map((group) => ({ ...group, nodes: [...group.nodes] }))
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
  }, [cabins, roomGroups])
  const selectedDisplayFloor = displayFloors.find(
    (floor) => String(floor._id) === selectedDisplayFloorId,
  ) || displayFloors[0] || null
  const routeNodes = route?.path || []

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
    return `${contextLabel} · ${floor.name}`
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
      message: `Continue via stairs to ${nextFloor?.name || 'the next floor'}.`,
      detail: `${node.name} → ${nextNode.name}${currentFloor && nextFloor ? ` (${currentFloor.name} to ${nextFloor.name})` : ''}`,
    }]
  })

  function clearRoute() {
    setRoute(null)
    setMessage('')
    setError('')
    setActiveRouteSegmentIndex(0)
    setSelectedDisplayFloorId(displayFloors[0] ? String(displayFloors[0]._id) : '')
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
        setSelectedDisplayFloorId(firstFloorId)
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
      setActiveRouteSegmentIndex(index)
      setSelectedDisplayFloorId(floorId)
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
  const selectedStartCabin = String(startNodeId).startsWith('cabin-')
    ? cabins.find((cabin) => `cabin-${cabin._id}` === startNodeId)
    : null
  const selectedEndCabin = String(endNodeId).startsWith('cabin-')
    ? cabins.find((cabin) => `cabin-${cabin._id}` === endNodeId)
    : null
  const routeFloorNames = []
  for (const node of routeNodes) {
    const floorId = String(node.floorId)
    if (!routeFloorNames.some((item) => item.id === floorId)) {
      const floor = floorById.get(floorId)
      if (floor) {
        routeFloorNames.push({ id: floorId, name: floor.name })
      }
    }
  }
  const displayFloorId = selectedDisplayFloor ? String(selectedDisplayFloor._id) : ''
  const displaySegments = displayFloorId ? floorSegments(displayFloorId) : []
  const displayRoomMarkers = route
    ? [
        { room: selectedStartRoom, label: 'Start', className: 'is-start' },
        { room: selectedEndRoom, label: 'Destination', className: 'is-destination' },
      ].filter((marker) => marker.room && marker.room.floorId === displayFloorId)
    : []
  const displayFloorCabinMarkers = cabins.filter(
    (cabin) => String(cabin.floorId?._id || cabin.floorId) === displayFloorId,
  )

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
  const routeGuidanceCue = (() => {
    if (!activeRouteGuidanceSegment || activeRouteSegmentIndex === 0) {
      return ''
    }
    const previousSegment = routeGuidanceSegments[activeRouteSegmentIndex - 1]
    const entryNode = previousSegment?.nodes[previousSegment.nodes.length - 1]
    const label = getFloorMapLabel(activeRouteGuidanceFloorId) || 'the next map'
    return entryNode ? `Continue via ${entryNode.name} → ${label}` : `Continue to ${label}`
  })()

  return (
    <main className="user-navigation-page">
      <header className="user-navigation-header">
        <div className="user-navigation-brand">
          <span aria-hidden="true" className="user-brand-mark">C</span>
          <strong>CampusNav</strong>
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
          <p className="user-navigation-kicker">INDOOR WAYFINDING</p>
          <h1>Campus Navigation</h1>
          <p>Choose two rooms to find a route through campus.</p>
        </section>

        <section aria-label="Choose route" className="user-navigation-card">
          <form onSubmit={handleNavigate}>
            <label className="user-navigation-field">
              Starting Point
              <SearchableLocationSelect
                ariaLabel="Search starting point"
                excludedValue={endNodeId}
                groups={destinationGroups}
                onChange={(nodeId) => {
                  setStartNodeId(nodeId)
                  clearRoute()
                }}
                placeholder="Search room, teacher or location..."
                value={startNodeId}
              />
            </label>

            <label className="user-navigation-field">
              Destination
              <SearchableLocationSelect
                ariaLabel="Search destination point"
                excludedValue={startNodeId}
                groups={destinationGroups}
                onChange={(nodeId) => {
                  setEndNodeId(nodeId)
                  clearRoute()
                }}
                placeholder="Search room, teacher or location..."
                value={endNodeId}
              />
            </label>

            {startNodeId && startNodeId === endNodeId && (
              <p className="user-navigation-message" role="status">
                Starting point and destination must be different.
              </p>
            )}

            {message && (
              <p className="user-navigation-message" role="status">{message}</p>
            )}
            {error && (
              <p className="user-navigation-error" role="alert">{error}</p>
            )}

            <button
              className="user-navigate-button"
              disabled={loading || navigating || !startNodeId || !endNodeId || startNodeId === endNodeId}
              type="submit"
            >
              {navigating ? 'Finding route…' : 'Navigate'}
            </button>
            {loading && <p className="user-navigation-loading">Loading rooms…</p>}
            {!loading && !error && rooms.length === 0 && (
              <p className="user-navigation-loading">No rooms are available yet.</p>
            )}
          </form>
        </section>

        <section aria-live="polite" className="user-route-results">
          {route && (
            <div className="user-route-summary">
              <h2>Your route</h2>
              <div className="user-route-summary-details">
                <div>
                  <span>Start</span>
                  <strong>
                    {selectedStartCabin
                      ? `${selectedStartCabin.teacherName} · ${selectedStartCabin.name}${selectedStartCabin.staffroomName ? ` · ${selectedStartCabin.staffroomName}` : ''} · ${selectedStartCabin.floorName}`
                      : selectedStartRoom
                        ? `${selectedStartRoom.name} · ${selectedStartRoom.floorName}`
                        : ''}
                  </strong>
                </div>
                <div>
                  <span>Destination</span>
                  <strong>
                    {selectedEndCabin
                      ? `${selectedEndCabin.teacherName} · ${selectedEndCabin.name}${selectedEndCabin.staffroomName ? ` · ${selectedEndCabin.staffroomName}` : ''} · ${selectedEndCabin.floorName}`
                      : selectedEndRoom
                        ? `${selectedEndRoom.name} · ${selectedEndRoom.floorName}`
                        : ''}
                  </strong>
                </div>
                <div>
                  <span>Distance</span>
                  <strong>{Number(route.distance).toFixed(2)}</strong>
                </div>
                <div>
                  <span>Route</span>
                  <strong>{routeFloorNames.map((floor) => floor.name).join(' → ')}</strong>
                </div>
              </div>
              {missingFloorInRoute && (
                <p className="user-navigation-message">
                  A floor in this route is no longer available. Some maps may be missing.
                </p>
              )}
            </div>
          )}

          {route && routeGuidanceSegments.length > 1 && (
            <section
              aria-label="Route map guide"
              className="user-route-guidance"
            >
              <div className="user-route-guidance-step">
                <span className="user-route-guidance-indicator">
                  Map {activeRouteSegmentIndex + 1} of {routeGuidanceSegments.length}
                </span>
                <span className="user-route-guidance-map">
                  {getFloorMapLabel(activeRouteGuidanceFloorId) || 'Unavailable floor'}
                </span>
                {activeRouteSegmentIndex === routeGuidanceSegments.length - 1 && (
                  <span className="user-route-guidance-arrival">Arrived at destination</span>
                )}
              </div>
              {routeGuidanceCue && (
                <p className="user-stair-transition">{routeGuidanceCue}</p>
              )}
              <div className="user-route-guidance-actions">
                <button
                  className="user-guidance-back-button"
                  disabled={activeRouteSegmentIndex === 0}
                  onClick={() => goToRouteSegment(activeRouteSegmentIndex - 1)}
                  type="button"
                >
                  Back
                </button>
                <button
                  className="user-guidance-next-button"
                  disabled={activeRouteSegmentIndex === routeGuidanceSegments.length - 1}
                  onClick={() => goToRouteSegment(activeRouteSegmentIndex + 1)}
                  type="button"
                >
                  Next
                </button>
              </div>
            </section>
          )}

          {displayFloors.length > 0 && (
            <div className="user-route-viewer">
              <nav aria-label="Select floor" className="user-floor-selector">
                <h2>Floors</h2>
                {displayFloors.map((floor) => {
                  const floorId = String(floor._id)
                  return (
                    <button
                      aria-pressed={selectedDisplayFloor?._id === floor._id}
                      className={`user-floor-button${selectedDisplayFloor?._id === floor._id ? ' is-active' : ''}`}
                      key={floorId}
                      onClick={() => setSelectedDisplayFloorId(floorId)}
                      type="button"
                    >
                      {floor.name}
                    </button>
                  )
                })}
              </nav>
              {selectedDisplayFloor && (
                <section aria-label={`${selectedDisplayFloor.name} map`} className="user-route-floor">
                  <h2>{selectedDisplayFloor.name}</h2>
                  {selectedDisplayFloor.mapImage ? (
                    <div className="user-route-map-stage">
                      <div className="user-route-map-canvas">
                        <img
                          alt={`${selectedDisplayFloor.name} route map`}
                          className="user-route-map-image"
                          src={`${SERVER_URL}${selectedDisplayFloor.mapImage}`}
                        />
                        <svg
                          aria-hidden="true"
                          className="user-route-map-overlay"
                          preserveAspectRatio="none"
                          viewBox="0 0 100 100"
                        >
                          {displayRouteSegments.map((segment) => (
                            <line
                              key={segment.key}
                              x1={segment.from.x}
                              y1={segment.from.y}
                              x2={segment.to.x}
                              y2={segment.to.y}
                            />
                          ))}
                        </svg>
                        {displayRoomMarkers.map(({ room, label, className }) => (
                          <div
                            aria-label={`${label}: ${room.name}`}
                            className={`user-room-route-marker ${className}`}
                            key={`${label}-${room._id}`}
                            role="img"
                            style={{ left: `${room.x}%`, top: `${room.y}%` }}
                          >
                            <span className="user-room-route-marker-pin" />
                            <span className="user-room-route-marker-label">
                              <strong>{label}</strong>
                              <span>{room.name}</span>
                            </span>
                          </div>
                        ))}
                        {displayFloorCabinMarkers.map((cabin) => {
                          const isStart = selectedStartCabin?._id === cabin._id
                          const isDestination = selectedEndCabin?._id === cabin._id
                          return (
                            <div
                              aria-label={`Teacher cabin: ${cabin.name} for ${cabin.teacherName}`}
                              className={`user-cabin-marker${isStart ? ' is-start' : ''}${isDestination ? ' is-destination' : ''}`}
                              key={cabin._id}
                              role="img"
                              style={{ left: `${cabin.x}%`, top: `${cabin.y}%` }}
                            >
                              <span className="user-cabin-marker-pin" />
                              <span className="user-cabin-marker-label">
                                {isStart && <strong>Start</strong>}
                                {isDestination && <strong>Destination</strong>}
                                <span>{cabin.teacherName}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="user-navigation-message">No map image is available for this floor.</p>
                  )}
                  {transitions
                    .filter((transition) => transition.afterFloorId === displayFloorId)
                    .map((transition) => (
                      <p className="user-stair-transition" key={transition.key}>
                        {transition.message}
                      </p>
                    ))}
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default UserPage
