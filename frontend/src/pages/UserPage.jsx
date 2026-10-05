import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
  const [floors, setFloors] = useState([])
  const [selectedDisplayFloorId, setSelectedDisplayFloorId] = useState('')
  const [startNodeId, setStartNodeId] = useState('')
  const [endNodeId, setEndNodeId] = useState('')
  const [route, setRoute] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let active = true

    async function loadRooms() {
      try {
        const bootstrap = await loadRoomsBootstrap()

        if (active) {
          setFloors(bootstrap.floors)
          setRooms(bootstrap.rooms)
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
  const displayFloors = [...floors].sort(
    (first, second) => Number(first.floorNumber) - Number(second.floorNumber),
  )
  const selectedDisplayFloor = displayFloors.find(
    (floor) => String(floor._id) === selectedDisplayFloorId,
  ) || displayFloors[0] || null
  const routeNodes = route?.path || []

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
    setSelectedDisplayFloorId(displayFloors[0] ? String(displayFloors[0]._id) : '')
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
      const response = await fetch(
        `${API_URL}/navigation/path?start=${encodeURIComponent(startNodeId)}&end=${encodeURIComponent(endNodeId)}`,
      )
      const result = await readResponse(response)
      if (!result.found) {
        setMessage('No route found between the selected points.')
        return
      }
      setRoute(result)
      if (result.path?.[0]?.floorId) {
        setSelectedDisplayFloorId(String(result.path[0].floorId))
      }
    } catch (routeError) {
      setError(routeError.message)
    } finally {
      setNavigating(false)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('role')
    navigate('/')
  }

  function roomLabel(room) {
    return `${room.name} — ${room.floorName}`
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
              <select
                onChange={(event) => {
                  setStartNodeId(event.target.value)
                  clearRoute()
                }}
                value={startNodeId}
              >
                <option value="">Select a starting point</option>
                {rooms.map((room) => (
                  <option
                    key={room._id}
                    value={room._id}
                    disabled={room._id === endNodeId}
                  >
                    {roomLabel(room)}
                  </option>
                ))}
              </select>
            </label>

            <label className="user-navigation-field">
              Destination
              <select
                onChange={(event) => {
                  setEndNodeId(event.target.value)
                  clearRoute()
                }}
                value={endNodeId}
              >
                <option value="">Select a destination</option>
                {rooms.map((room) => (
                  <option
                    key={room._id}
                    value={room._id}
                    disabled={room._id === startNodeId}
                  >
                    {roomLabel(room)}
                  </option>
                ))}
              </select>
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
                    {selectedStartRoom
                      ? `${selectedStartRoom.name} · ${selectedStartRoom.floorName}`
                      : ''}
                  </strong>
                </div>
                <div>
                  <span>Destination</span>
                  <strong>
                    {selectedEndRoom
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
            </div>
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
                          {displaySegments.map((segment) => (
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
