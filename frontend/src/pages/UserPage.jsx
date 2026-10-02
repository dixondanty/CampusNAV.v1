import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const API_URL = 'http://localhost:5000/api'
const SERVER_URL = 'http://localhost:5000'

async function readResponse(response) {
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.message || 'The request could not be completed.')
  }
  return data
}

function UserPage() {
  const [rooms, setRooms] = useState([])
  const [floors, setFloors] = useState([])
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
        const floorList = await readResponse(await fetch(`${API_URL}/floors`))
        const nodeLists = await Promise.all(
          floorList.map(async (floor) => {
            const floorNodes = await readResponse(
              await fetch(`${API_URL}/nodes/${floor._id}`),
            )
            return floorNodes
              .filter((node) => node.type === 'room')
              .map((node) => ({
                ...node,
                floorId: String(floor._id),
                floorName: floor.name,
                floorNumber: floor.floorNumber,
              }))
          }),
        )

        if (active) {
          setFloors(floorList)
          setRooms(nodeLists.flat())
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
  const routeNodes = route?.path || []
  const routeFloors = []
  for (const node of routeNodes) {
    const floorId = String(node.floorId)
    if (!routeFloors.some((item) => String(item._id) === floorId)) {
      const floor = floorById.get(floorId)
      if (floor) {
        routeFloors.push(floor)
      }
    }
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

  const summaryPath = routeNodes
    .filter((node) => node.type === 'room' || node.type === 'stair')
    .map((node) => node.type === 'stair' ? 'Stair' : node.name)

  return (
    <main className="user-navigation-page">
      <header className="user-navigation-header">
        <div className="user-navigation-brand">
          <span aria-hidden="true" className="user-brand-mark">C</span>
          <strong>CampusAR</strong>
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

        {route && (
          <section aria-live="polite" className="user-route-results">
            <div className="user-route-summary">
              <p className="user-route-success">Route Found</p>
              <p className="user-route-distance">
                Distance: {Number(route.distance).toFixed(2)}
              </p>
              <p className="user-route-path">
                {summaryPath.join(' → ')}
              </p>
            </div>

            <div className="user-route-floors">
              {routeFloors.map((floor) => {
                const floorId = String(floor._id)
                const segments = floorSegments(floorId)
                return (
                  <section className="user-route-floor" key={floorId}>
                    <h2>{floor.name}</h2>
                    {floor.mapImage ? (
                      <div className="user-route-map-stage">
                        <div className="user-route-map-canvas">
                          <img
                            alt={`${floor.name} route map`}
                            className="user-route-map-image"
                            src={`${SERVER_URL}${floor.mapImage}`}
                          />
                          <svg
                            aria-hidden="true"
                            className="user-route-map-overlay"
                            preserveAspectRatio="none"
                            viewBox="0 0 100 100"
                          >
                            {segments.map((segment) => (
                              <line
                                key={segment.key}
                                x1={segment.from.x}
                                y1={segment.from.y}
                                x2={segment.to.x}
                                y2={segment.to.y}
                              />
                            ))}
                          </svg>
                        </div>
                      </div>
                    ) : (
                      <p className="user-navigation-message">No map image is available for this floor.</p>
                    )}
                    {transitions
                      .filter((transition) => transition.afterFloorId === floorId)
                      .map((transition) => (
                        <p className="user-stair-transition" key={transition.key}>
                          {transition.message}
                        </p>
                      ))}
                  </section>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

export default UserPage
