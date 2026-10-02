import { useEffect, useRef, useState } from 'react'
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

function MapEditor() {
  const [floors, setFloors] = useState([])
  const [selectedFloorId, setSelectedFloorId] = useState('')
  const [nodes, setNodes] = useState([])
  const [allStairNodes, setAllStairNodes] = useState([])
  const [allTestNodes, setAllTestNodes] = useState([])
  const [connections, setConnections] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [connectionNodeIds, setConnectionNodeIds] = useState([])
  const [roomName, setRoomName] = useState('')
  const [roomPosition, setRoomPosition] = useState(null)
  const [stairPosition, setStairPosition] = useState(null)
  const [stairGroup, setStairGroup] = useState('')
  const [stairPart, setStairPart] = useState('')
  const [name, setName] = useState('')
  const [floorNumber, setFloorNumber] = useState('')
  const [mapImage, setMapImage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingNodes, setLoadingNodes] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingRoom, setSavingRoom] = useState(false)
  const [savingStair, setSavingStair] = useState(false)
  const [savingConnection, setSavingConnection] = useState(false)
  const [crossFloorFromId, setCrossFloorFromId] = useState('')
  const [crossFloorToId, setCrossFloorToId] = useState('')
  const [savingCrossFloorConnection, setSavingCrossFloorConnection] = useState(false)
  const [crossFloorConnectionMessage, setCrossFloorConnectionMessage] = useState('')
  const [startNodeId, setStartNodeId] = useState('')
  const [endNodeId, setEndNodeId] = useState('')
  const [routeResult, setRouteResult] = useState(null)
  const [routeMessage, setRouteMessage] = useState('')
  const [routing, setRouting] = useState(false)
  const [addingFloor, setAddingFloor] = useState(false)
  const [mode, setMode] = useState('select')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const mapImageRef = useRef(null)
  const creatingNodeRef = useRef(false)
  const selectedFloor = floors.find((floor) => floor._id === selectedFloorId)
  const selectedNode = nodes.find((node) => node._id === selectedNodeId)
  const navigationNodes = nodes.filter((node) => node.type === 'nav')
  const roomNodes = nodes.filter((node) => node.type === 'room')
  const stairNodes = nodes.filter((node) => node.type === 'stair')
  const testNodes = allTestNodes.filter((node) =>
    floors.some((floor) => floor._id === String(node.floorId)),
  )
  const stairPart2Nodes = allStairNodes.filter((node) => node.stairPart === 2)
  const stairPart1Nodes = allStairNodes.filter((node) => node.stairPart === 1)
  const crossFloorFromNode = stairPart2Nodes.find((node) => node._id === crossFloorFromId)
  const crossFloorToNode = stairPart1Nodes.find((node) => node._id === crossFloorToId)
  const crossFloorFromFloor = floors.find(
    (floor) => floor._id === String(crossFloorFromNode?.floorId),
  )
  const crossFloorToFloor = floors.find(
    (floor) => floor._id === String(crossFloorToNode?.floorId),
  )
  const crossFloorFromGroup = typeof crossFloorFromNode?.stairGroup === 'string'
    ? crossFloorFromNode.stairGroup.trim()
    : ''
  const crossFloorToOptions = stairPart1Nodes.filter((node) => {
    if (!crossFloorFromNode) {
      return true
    }
    const toGroup = typeof node.stairGroup === 'string' ? node.stairGroup.trim() : ''
    if (crossFloorFromGroup !== toGroup) {
      return false
    }
    if (!crossFloorFromGroup) {
      return true
    }
    const floor = floors.find((item) => item._id === String(node.floorId))
    return Number(floor?.floorNumber) -
      Number(crossFloorFromFloor?.floorNumber) === 1
  })
  const validCrossFloorStairPair = Boolean(
    crossFloorFromNode &&
    crossFloorToNode &&
    crossFloorToOptions.some((node) => node._id === crossFloorToNode._id) &&
    Number(crossFloorToFloor?.floorNumber) - Number(crossFloorFromFloor?.floorNumber) === 1,
  )
  const remoteStairNodes = allStairNodes.filter(
    (node) =>
      String(node.floorId) !== selectedFloorId &&
      floors.some((floor) => floor._id === String(node.floorId)),
  )
  const floorNumbers = floors.map((floor) => Number(floor.floorNumber)).filter(Number.isFinite)
  const lowestFloorNumber = Math.min(...floorNumbers)
  const highestFloorNumber = Math.max(...floorNumbers)
  const selectedFloorNumber = Number(selectedFloor?.floorNumber)
  const allowedStairParts = !selectedFloor || floorNumbers.length < 2
    ? []
    : selectedFloorNumber === lowestFloorNumber
      ? [2]
      : selectedFloorNumber === highestFloorNumber
        ? [1]
        : [1, 2]

  function getConnectionNode(connection, end) {
    const endpoint = connection[end]
    if (endpoint && typeof endpoint === 'object') {
      return endpoint
    }
    return nodes.find((node) => node._id === String(endpoint))
  }

  function getNodeFloorId(node) {
    const floorId = node.floorId
    return String(floorId && typeof floorId === 'object' ? floorId._id : floorId)
  }

  function getFloorLabel(node) {
    const floor = node.floorId && typeof node.floorId === 'object'
      ? node.floorId
      : floors.find((item) => item._id === getNodeFloorId(node))
    return floor ? `Floor ${floor.floorNumber}` : 'Other floor'
  }

  function getFloorName(node) {
    const floor = node.floorId && typeof node.floorId === 'object'
      ? node.floorId
      : floors.find((item) => item._id === getNodeFloorId(node))
    return floor?.name || node.floorName || 'Unknown floor'
  }

  function getStairOptionLabel(node) {
    const group = typeof node.stairGroup === 'string' ? node.stairGroup.trim() : ''
    return `${getFloorName(node)} — ${group ? `${group} — ` : ''}Stair P${node.stairPart}`
  }

  function clearRoute() {
    setRouteResult(null)
    setRouteMessage('')
  }

  async function refreshFloors() {
    const response = await fetch(`${API_URL}/floors`)
    const floorList = await readResponse(response)
    setFloors(floorList)
    return floorList
  }

  async function refreshNodes(floorId) {
    const response = await fetch(`${API_URL}/nodes/${floorId}`)
    const floorNodes = await readResponse(response)
    const floor = floors.find((item) => item._id === floorId)
    const campusFloorNodes = floorNodes
      .filter((node) => ['nav', 'room', 'stair'].includes(node.type))
      .map((node) => ({ ...node, floorName: floor?.name, floorNumber: floor?.floorNumber }))
    setNodes(campusFloorNodes)
    setAllTestNodes((currentNodes) => [
      ...currentNodes.filter((node) => String(node.floorId) !== floorId),
      ...campusFloorNodes,
    ])
    setAllStairNodes((currentNodes) => [
      ...currentNodes.filter((node) => String(node.floorId) !== floorId),
      ...campusFloorNodes.filter((node) => node.type === 'stair'),
    ])
    return floorNodes
  }

  async function refreshConnections(floorId) {
    const response = await fetch(`${API_URL}/connections/${floorId}`)
    const floorConnections = await readResponse(response)
    setConnections(floorConnections)
    return floorConnections
  }

  useEffect(() => {
    async function loadFloors() {
      try {
        const floorList = await refreshFloors()
        if (floorList.length > 0) {
          setSelectedFloorId(floorList[0]._id)
        }
      } catch (loadError) {
        setError(loadError.message)
      } finally {
        setLoading(false)
      }
    }

    loadFloors()
  }, [])

  useEffect(() => {
    if (floors.length === 0) {
      return undefined
    }

    let active = true

    async function loadStairNodes() {
      try {
        const nodeLists = await Promise.all(
          floors.map(async (floor) => {
            const response = await fetch(`${API_URL}/nodes/${floor._id}`)
            const floorNodes = await readResponse(response)
            return floorNodes.map((node) => ({
              ...node,
              floorName: floor.name,
              floorNumber: floor.floorNumber,
            }))
          }),
        )
        if (active) {
          const campusNodes = nodeLists.flat()
          setAllStairNodes(campusNodes.filter((node) => node.type === 'stair'))
          setAllTestNodes(campusNodes.filter((node) => ['nav', 'room', 'stair'].includes(node.type)))
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      }
    }

    loadStairNodes()
    return () => {
      active = false
    }
  }, [floors])

  useEffect(() => {
    if (!selectedFloorId) {
      return undefined
    }

    let active = true

    async function loadFloorData() {
      try {
        const [nodesResponse, connectionsResponse] = await Promise.all([
          fetch(`${API_URL}/nodes/${selectedFloorId}`),
          fetch(`${API_URL}/connections/${selectedFloorId}`),
        ])
        const [floorNodes, floorConnections] = await Promise.all([
          readResponse(nodesResponse),
          readResponse(connectionsResponse),
        ])
        if (active) {
          setNodes(floorNodes.filter((node) => ['nav', 'room', 'stair'].includes(node.type)))
          setConnections(floorConnections)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoadingNodes(false)
        }
      }
    }

    loadFloorData()
    return () => {
      active = false
    }
  }, [selectedFloorId])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('floorNumber', floorNumber)
    if (mapImage) {
      formData.append('mapImage', mapImage)
    }

    try {
      const response = await fetch(`${API_URL}/floors`, {
        method: 'POST',
        body: formData,
      })
      const newFloor = await readResponse(response)
      const floorList = await refreshFloors()
      if (floorList.some((floor) => floor._id === newFloor._id)) {
        setLoadingNodes(true)
        setNodes([])
        setConnections([])
        setSelectedNodeId('')
        setConnectionNodeIds([])
        setSelectedFloorId(newFloor._id)
      }
      setMode('select')
      clearRoute()
      setName('')
      setFloorNumber('')
      setMapImage(null)
      setAddingFloor(false)
      event.target.reset()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteFloor(floor) {
    if (!window.confirm(`Delete ${floor.name} (Floor ${floor.floorNumber})?`)) {
      return
    }

    setError('')
    try {
      const response = await fetch(`${API_URL}/floors/${floor._id}`, {
        method: 'DELETE',
      })
      await readResponse(response)
      await refreshFloors()
      setAllStairNodes((currentNodes) =>
        currentNodes.filter((node) => String(node.floorId) !== floor._id),
      )
      if (selectedFloorId === floor._id) {
        setSelectedFloorId('')
        setNodes([])
        setConnections([])
        setSelectedNodeId('')
        setConnectionNodeIds([])
        setLoadingNodes(false)
        setMode('select')
      }
      clearRoute()
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function handleMapClick(event) {
    if (!['nav', 'room', 'stair'].includes(mode) || !selectedFloor || loadingNodes || creatingNodeRef.current) {
      return
    }

    const image = mapImageRef.current
    if (!image) {
      return
    }

    const bounds = image.getBoundingClientRect()
    const clickX = event.clientX - bounds.left
    const clickY = event.clientY - bounds.top
    if (clickX < 0 || clickX > bounds.width || clickY < 0 || clickY > bounds.height) {
      return
    }

    const x = (clickX / bounds.width) * 100
    const y = (clickY / bounds.height) * 100
    if (mode === 'room') {
      setRoomPosition({ x, y })
      setRoomName('')
      return
    }
    if (mode === 'stair') {
      if (allowedStairParts.length === 0) {
        setError('Stair parts can only be placed when the selected floor is between other floors or at a valid building end.')
        return
      }
      setStairPosition({ x, y })
      setStairGroup('')
      setStairPart(String(allowedStairParts[0]))
      setError('')
      return
    }

    creatingNodeRef.current = true
    setError('')
    try {
      const currentNodesResponse = await fetch(`${API_URL}/nodes/${selectedFloor._id}`)
      const currentNodes = await readResponse(currentNodesResponse)
      const navigationNodes = currentNodes.filter((node) => node.type === 'nav')
      const nextNumber =
        navigationNodes.reduce((highest, node) => {
          const match = /^N(\d+)$/.exec(node.name)
          return match ? Math.max(highest, Number(match[1])) : highest
        }, 0) + 1

      const response = await fetch(`${API_URL}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `N${nextNumber}`,
          type: 'nav',
          x,
          y,
          floorId: selectedFloor._id,
        }),
      })
      const newNode = await readResponse(response)
      const updatedNodes = await refreshNodes(selectedFloor._id)
      const savedNode = updatedNodes.find((node) => node._id === newNode._id)
      setSelectedNodeId(savedNode ? savedNode._id : '')
    } catch (createError) {
      setError(createError.message)
    } finally {
      creatingNodeRef.current = false
    }
  }

  async function handleCreateRoom(event) {
    event.preventDefault()
    if (!selectedFloor || !roomPosition || creatingNodeRef.current) {
      return
    }

    creatingNodeRef.current = true
    setSavingRoom(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: roomName.trim(),
          type: 'room',
          x: roomPosition.x,
          y: roomPosition.y,
          floorId: selectedFloor._id,
        }),
      })
      const newNode = await readResponse(response)
      const updatedNodes = await refreshNodes(selectedFloor._id)
      const savedNode = updatedNodes.find((node) => node._id === newNode._id)
      setSelectedNodeId(savedNode ? savedNode._id : '')
      setRoomPosition(null)
      setRoomName('')
    } catch (createError) {
      setError(createError.message)
    } finally {
      creatingNodeRef.current = false
      setSavingRoom(false)
    }
  }

  async function handleCreateStair(event) {
    event.preventDefault()
    if (
      !selectedFloor ||
      !stairPosition ||
      !stairGroup.trim() ||
      !allowedStairParts.includes(Number(stairPart)) ||
      creatingNodeRef.current
    ) {
      return
    }

    creatingNodeRef.current = true
    setSavingStair(true)
    setError('')
    try {
      const part = Number(stairPart)
      const group = stairGroup.trim()
      const response = await fetch(`${API_URL}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: group ? `${group} - Stair P${part}` : `Stair P${part}`,
          type: 'stair',
          ...(group ? { stairGroup: group } : {}),
          stairPart: part,
          x: stairPosition.x,
          y: stairPosition.y,
          floorId: selectedFloor._id,
        }),
      })
      const newNode = await readResponse(response)
      const updatedNodes = await refreshNodes(selectedFloor._id)
      const savedNode = updatedNodes.find((node) => node._id === newNode._id)
      setSelectedNodeId(savedNode ? savedNode._id : '')
      setAllStairNodes((currentNodes) => [
        ...currentNodes.filter((node) => node._id !== newNode._id),
        { ...newNode, floorName: selectedFloor.name, floorNumber: selectedFloor.floorNumber },
      ])
      setStairPosition(null)
      setStairGroup('')
      setStairPart('')
    } catch (createError) {
      setError(createError.message)
    } finally {
      creatingNodeRef.current = false
      setSavingStair(false)
    }
  }

  async function handleDeleteNode(node) {
    const nodeDescription = node.type === 'room'
      ? 'room'
      : node.type === 'stair'
        ? node.name
        : 'navigation node'
    if (!window.confirm(`Delete ${nodeDescription} ${node.name}?`)) {
      return
    }

    setError('')
    try {
      const response = await fetch(`${API_URL}/nodes/${node._id}`, {
        method: 'DELETE',
      })
      await readResponse(response)
      await refreshNodes(selectedFloorId)
      await refreshConnections(selectedFloorId)
      setAllStairNodes((currentNodes) => currentNodes.filter((item) => item._id !== node._id))
      setSelectedNodeId('')
      setConnectionNodeIds([])
      setMode('select')
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function handleChooseNode(node) {
    if (savingConnection) {
      return
    }

    setSelectedNodeId(nodes.some((item) => item._id === node._id) ? node._id : '')
    if (mode !== 'connect') {
      return
    }

    if (connectionNodeIds.length === 0) {
      setError('')
      setConnectionNodeIds([node._id])
      return
    }

    const firstNode = [...nodes, ...allStairNodes].find((item) => item._id === connectionNodeIds[0])
    if (!firstNode) {
      setConnectionNodeIds([node._id])
      return
    }

    if (firstNode._id === node._id) {
      return
    }

    const sameFloor = getNodeFloorId(firstNode) === getNodeFloorId(node)
    if (sameFloor) {
      const roomToRoom = firstNode.type === 'room' && node.type === 'room'
      const roomToStair =
        (firstNode.type === 'room' && node.type === 'stair') ||
        (firstNode.type === 'stair' && node.type === 'room')
      const invalidStairs =
        firstNode.type === 'stair' &&
        node.type === 'stair' &&
        firstNode.stairPart === node.stairPart
      if (roomToRoom || roomToStair || invalidStairs) {
        setError(roomToRoom
          ? 'Room nodes cannot be connected to other room nodes.'
          : roomToStair
            ? 'Rooms must connect to a navigation node before reaching a stair.'
            : 'Connect Stair Part 1 to Stair Part 2 on the same floor.')
        return
      }
    } else {
      const firstFloor = floors.find((floor) => floor._id === getNodeFloorId(firstNode))
      const secondFloor = floors.find((floor) => floor._id === getNodeFloorId(node))
      const lowerNode = Number(firstFloor?.floorNumber) < Number(secondFloor?.floorNumber)
        ? firstNode
        : node
      const upperNode = lowerNode === firstNode ? node : firstNode
      const lowerFloor = lowerNode === firstNode ? firstFloor : secondFloor
      const upperFloor = lowerNode === firstNode ? secondFloor : firstFloor
      const lowerStairGroup = typeof lowerNode.stairGroup === 'string'
        ? lowerNode.stairGroup.trim()
        : ''
      const upperStairGroup = typeof upperNode.stairGroup === 'string'
        ? upperNode.stairGroup.trim()
        : ''
      if (
        firstNode.type !== 'stair' ||
        node.type !== 'stair' ||
        Number(upperFloor?.floorNumber) - Number(lowerFloor?.floorNumber) !== 1 ||
        lowerNode.stairPart !== 2 ||
        upperNode.stairPart !== 1 ||
        lowerStairGroup !== upperStairGroup
      ) {
        setError('Connect matching stair groups: Part 2 on a floor to Part 1 on the immediately higher floor.')
        return
      }
    }

    setSavingConnection(true)
    setError('')
    try {
      const response = await fetch(`${API_URL}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: firstNode._id, to: node._id }),
      })
      await readResponse(response)
      await refreshConnections(selectedFloorId)
      setConnectionNodeIds([])
    } catch (createError) {
      setError(createError.message)
      setConnectionNodeIds([])
    } finally {
      setSavingConnection(false)
    }
  }

  async function handleConnectCrossFloorStairs() {
    if (!crossFloorFromNode || !crossFloorToNode || !validCrossFloorStairPair) {
      setCrossFloorConnectionMessage(
        'Connect Part 2 on a floor to Part 1 on the immediately higher floor.',
      )
      return
    }

    setSavingCrossFloorConnection(true)
    setCrossFloorConnectionMessage('')
    setError('')
    try {
      const existingResponse = await fetch(
        `${API_URL}/connections/${crossFloorFromNode.floorId}`,
      )
      const existingConnections = await readResponse(existingResponse)
      const alreadyConnected = existingConnections.some((connection) => {
        const fromId = String(connection.from?._id || connection.from)
        const toId = String(connection.to?._id || connection.to)
        return (
          (fromId === crossFloorFromNode._id && toId === crossFloorToNode._id) ||
          (fromId === crossFloorToNode._id && toId === crossFloorFromNode._id)
        )
      })

      if (alreadyConnected) {
        setCrossFloorConnectionMessage('These stairs are already connected.')
        return
      }

      const response = await fetch(`${API_URL}/connections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: crossFloorFromNode._id,
          to: crossFloorToNode._id,
        }),
      })
      const connection = await readResponse(response)
      setConnections((currentConnections) => [
        ...currentConnections.filter((item) => item._id !== connection._id),
        {
          ...connection,
          from: crossFloorFromNode,
          to: crossFloorToNode,
        },
      ])
      setCrossFloorConnectionMessage('Stairs connected successfully.')
    } catch (connectionError) {
      if (connectionError.message === 'These nodes are already connected.') {
        setCrossFloorConnectionMessage('These stairs are already connected.')
      } else {
        setError(connectionError.message)
      }
    } finally {
      setSavingCrossFloorConnection(false)
    }
  }

  async function handleDeleteConnection(connection) {
    if (!window.confirm('Delete this connection?')) {
      return
    }

    setError('')
    try {
      const response = await fetch(`${API_URL}/connections/${connection._id}`, {
        method: 'DELETE',
      })
      await readResponse(response)
      setConnections((currentConnections) =>
        currentConnections.filter((item) => item._id !== connection._id),
      )
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  async function handleNavigate() {
    if (!startNodeId || !endNodeId) {
      clearRoute()
      setRouteMessage('Select both a starting point and a destination.')
      return
    }
    if (startNodeId === endNodeId) {
      clearRoute()
      setRouteMessage('Choose two different points.')
      return
    }

    setRouting(true)
    setError('')
    setRouteMessage('')
    setRouteResult(null)
    try {
      const response = await fetch(
        `${API_URL}/navigation/path?start=${encodeURIComponent(startNodeId)}&end=${encodeURIComponent(endNodeId)}`,
      )
      const result = await readResponse(response)
      if (!result.found) {
        setRouteMessage('No route found between the selected points.')
        return
      }
      setRouteResult(result)
    } catch (routeError) {
      setError(routeError.message)
    } finally {
      setRouting(false)
    }
  }

  function handleSelectFloor(floorId) {
    if (floorId !== selectedFloorId) {
      setLoadingNodes(true)
      setNodes([])
      setConnections([])
      setSelectedNodeId('')
      setConnectionNodeIds([])
      setSelectedFloorId(floorId)
    }
    setStairPosition(null)
    setStairPart('')
    setError('')
    if (mode !== 'test') {
      setMode('select')
    }
  }

  const routePath = routeResult?.path || []
  const routeSegments = routePath.slice(0, -1).flatMap((fromNode, index) => {
    const toNode = routePath[index + 1]
    if (
      getNodeFloorId(fromNode) !== selectedFloorId ||
      getNodeFloorId(toNode) !== selectedFloorId
    ) {
      return []
    }
    return [{ fromNode, toNode, key: `${fromNode._id}-${toNode._id}-${index}` }]
  })
  const stairTransitions = routePath.slice(0, -1).flatMap((fromNode, index) => {
    const toNode = routePath[index + 1]
    if (getNodeFloorId(fromNode) === getNodeFloorId(toNode)) {
      return []
    }
    return [{
      key: `${fromNode._id}-${toNode._id}-${index}`,
      message: `Continue via ${fromNode.name} → ${getFloorLabel(toNode)} ${toNode.name}`,
    }]
  })

  function handleLogout() {
    sessionStorage.removeItem('role')
    navigate('/')
  }

  return (
    <main className="map-editor">
      <header className="map-editor-topbar">
        <div className="topbar-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <strong>CampusNav</strong>
          <span className="topbar-divider" />
          <span className="topbar-title">Map Editor</span>
        </div>
        <div className="topbar-current-floor">
          {selectedFloor ? selectedFloor.name : 'No floor selected'}
        </div>
        <button className="topbar-logout" type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {error && <div className="map-editor-error" role="alert">{error}</div>}

      <div className="map-editor-layout">
        <aside className="editor-sidebar floor-sidebar">
          <div className="sidebar-heading">
            <span>Floors</span>
            <span className="floor-count">{floors.length}</span>
          </div>
          {loading ? (
            <p className="sidebar-message">Loading floors…</p>
          ) : floors.length === 0 ? (
            <p className="sidebar-message">No floors yet.</p>
          ) : (
            <ul className="floor-list">
              {floors.map((floor) => (
                <li
                  className={`floor-item${floor._id === selectedFloorId ? ' is-active' : ''}`}
                  key={floor._id}
                >
                  <button
                    aria-pressed={floor._id === selectedFloorId}
                    className="floor-choice"
                    onClick={() => handleSelectFloor(floor._id)}
                    type="button"
                  >
                    <span className="floor-choice-name">{floor.name}</span>
                    <span className="floor-choice-number">Floor {floor.floorNumber}</span>
                  </button>
                  <button
                    aria-label={`Delete ${floor.name}`}
                    className="floor-delete"
                    onClick={() => handleDeleteFloor(floor)}
                    title="Delete floor"
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="add-floor-button"
            onClick={() => {
              setError('')
              setAddingFloor(true)
            }}
            type="button"
          >
            <span aria-hidden="true">+</span> Add Floor
          </button>
        </aside>

        <section className="map-workspace" aria-label="Floor map workspace">
          <div className="workspace-heading">
            <div>
              <p className="workspace-kicker">MAP WORKSPACE</p>
              <h1>{selectedFloor ? selectedFloor.name : 'Select a floor'}</h1>
            </div>
            {selectedFloor && (
              <span className="workspace-floor-number">
                Floor {selectedFloor.floorNumber}
              </span>
            )}
          </div>

          <div className="map-toolbar" role="toolbar" aria-label="Map tools">
            <button
              aria-pressed={mode === 'select'}
              className={`tool-button${mode === 'select' ? ' is-active' : ''}`}
              onClick={() => {
                setConnectionNodeIds([])
                setMode('select')
              }}
              type="button"
            >
              Select
            </button>
            <button
              aria-pressed={mode === 'nav'}
              className={`tool-button${mode === 'nav' ? ' is-active' : ''}`}
              disabled={!selectedFloor?.mapImage}
              onClick={() => {
                setSelectedNodeId('')
                setConnectionNodeIds([])
                setMode((current) => (current === 'nav' ? 'select' : 'nav'))
              }}
              type="button"
            >
              + Nav Node
            </button>
            <button
              aria-pressed={mode === 'room'}
              className={`tool-button${mode === 'room' ? ' is-active' : ''}`}
              disabled={!selectedFloor?.mapImage}
              onClick={() => {
                setSelectedNodeId('')
                setConnectionNodeIds([])
                setMode((current) => (current === 'room' ? 'select' : 'room'))
              }}
              type="button"
            >
              Room
            </button>
            <button
              aria-pressed={mode === 'stair'}
              className={`tool-button${mode === 'stair' ? ' is-active' : ''}`}
              disabled={!selectedFloor?.mapImage || allowedStairParts.length === 0}
              onClick={() => {
                setSelectedNodeId('')
                setConnectionNodeIds([])
                setMode((current) => (current === 'stair' ? 'select' : 'stair'))
              }}
              title={allowedStairParts.length === 0 ? 'Stair parts require at least two floors.' : ''}
              type="button"
            >
              Stair
            </button>
            <button
              aria-pressed={mode === 'connect'}
              className={`tool-button${mode === 'connect' ? ' is-active' : ''}`}
              disabled={nodes.length + remoteStairNodes.length < 2}
              onClick={() => {
                setSelectedNodeId('')
                setConnectionNodeIds([])
                setError('')
                setMode((current) => (current === 'connect' ? 'select' : 'connect'))
              }}
              type="button"
            >
              Connect
            </button>
            <button
              aria-pressed={mode === 'delete'}
              className={`tool-button${mode === 'delete' ? ' is-active' : ''}`}
              disabled={nodes.length === 0}
              onClick={() => {
                setConnectionNodeIds([])
                setMode((current) => (current === 'delete' ? 'select' : 'delete'))
              }}
              type="button"
            >
              Delete
            </button>
            <span className="toolbar-divider" />
            <button
              aria-pressed={mode === 'test'}
              className={`tool-button${mode === 'test' ? ' is-active' : ''}`}
              disabled={testNodes.length < 2}
              onClick={() => {
                setConnectionNodeIds([])
                setError('')
                setMode((current) => (current === 'test' ? 'select' : 'test'))
              }}
              type="button"
            >
              Test
            </button>
          </div>

          {mode === 'nav' && selectedFloor && (
            <p className="map-mode-hint">Navigation Node mode — click on the map to place a node</p>
          )}
          {mode === 'room' && selectedFloor && (
            <p className="map-mode-hint">Room mode — click on the map, then enter the room name</p>
          )}
          {mode === 'stair' && selectedFloor && (
            <p className="map-mode-hint">Stair mode — click on the map, then choose the allowed stair part</p>
          )}
          {mode === 'connect' && selectedFloor && (
            <p className="map-mode-hint">
              {savingConnection
                ? 'Saving connection…'
                : connectionNodeIds.length > 0
                  ? 'Select a second node to connect'
                  : 'Select two nodes to connect'}
            </p>
          )}
          {mode === 'delete' && selectedNode && (
            <p className="map-mode-hint">Delete mode — select a node, then confirm deletion in the editor panel</p>
          )}

          <div className={`map-stage${['nav', 'room', 'stair'].includes(mode) ? ' is-placing' : ''}`}>
            {selectedFloor ? (
              selectedFloor.mapImage ? (
                <div className="map-image-holder">
                  <div className="map-canvas" onClick={handleMapClick}>
                    <img
                      alt={`Map of ${selectedFloor.name}`}
                      className="floor-map"
                      ref={mapImageRef}
                      src={`${SERVER_URL}${selectedFloor.mapImage}`}
                    />
                    <svg
                      aria-hidden="true"
                      className={`map-connections-overlay${mode === 'test' && routeResult ? ' is-muted' : ''}`}
                      preserveAspectRatio="none"
                      viewBox="0 0 100 100"
                    >
                      {connections.map((connection) => {
                        const fromNode = getConnectionNode(connection, 'from')
                        const toNode = getConnectionNode(connection, 'to')
                        if (
                          !fromNode ||
                          !toNode ||
                          getNodeFloorId(fromNode) !== selectedFloorId ||
                          getNodeFloorId(toNode) !== selectedFloorId
                        ) {
                          return null
                        }
                        return (
                          <line
                            key={connection._id}
                            x1={fromNode.x}
                            y1={fromNode.y}
                            x2={toNode.x}
                            y2={toNode.y}
                          />
                        )
                      })}
                    </svg>
                    {routeResult && (
                      <svg
                        aria-hidden="true"
                        className="map-route-overlay"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 100"
                      >
                        {routeSegments.map((segment) => (
                          <line
                            key={segment.key}
                            x1={segment.fromNode.x}
                            y1={segment.fromNode.y}
                            x2={segment.toNode.x}
                            y2={segment.toNode.y}
                          />
                        ))}
                      </svg>
                    )}
                    {nodes.map((node) => (
                      <button
                        aria-label={`Select ${node.type === 'room' ? 'room' : node.type === 'stair' ? `stair part ${node.stairPart}` : 'navigation node'} ${node.name}`}
                        aria-pressed={node._id === selectedNodeId}
                        className={`map-node-marker ${node.type === 'room' ? 'room-marker' : node.type === 'stair' ? 'stair-marker' : 'navigation-marker'}${node._id === selectedNodeId ? ' is-selected' : ''}${connectionNodeIds.includes(node._id) ? ' is-connection-selected' : ''}`}
                        key={node._id}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleChooseNode(node)
                        }}
                        style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        type="button"
                      >
                        <span className={node.type === 'room' ? 'room-marker-square' : node.type === 'stair' ? 'stair-marker-diamond' : 'navigation-dot'} />
                        <span className={`navigation-marker-label${node.type === 'stair' ? ' stair-marker-label' : ''}`}>
                          {node.type === 'stair' ? `P${node.stairPart}` : node.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="map-empty-state">This floor does not have a map image.</div>
              )
            ) : (
              <div className="map-empty-state">
                {loading ? 'Loading floors…' : 'Choose a floor from the sidebar to view its map.'}
              </div>
            )}
          </div>
        </section>

        <aside className="editor-sidebar properties-sidebar">
          <div className="sidebar-heading">Editor</div>
          <section className="inspector-section">
            <p className="inspector-label">Mode</p>
            <div className="mode-summary">
              <span className={`mode-indicator${mode === 'nav' ? ' is-nav' : mode === 'room' ? ' is-room' : mode === 'stair' ? ' is-stair' : mode === 'connect' ? ' is-connect' : ''}`} />
              {mode === 'nav' ? 'Navigation Node' : mode === 'room' ? 'Room' : mode === 'stair' ? 'Stair' : mode === 'connect' ? 'Connect' : mode === 'test' ? 'Test Navigation' : mode === 'delete' ? 'Delete' : 'Select'}
            </div>
          </section>

          {mode === 'test' && (
            <section className="inspector-section test-navigation-panel">
              <p className="inspector-label">Test Navigation</p>
              <label className="test-navigation-field">
                Start
                <select
                  onChange={(event) => {
                    setStartNodeId(event.target.value)
                    clearRoute()
                  }}
                  value={startNodeId}
                >
                  <option value="">Select starting point</option>
                  {testNodes.map((node) => (
                    <option
                      key={node._id}
                      value={node._id}
                      disabled={node._id === endNodeId}
                    >
                      {node.name} — Floor {node.floorNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="test-navigation-field">
                Destination
                <select
                  onChange={(event) => {
                    setEndNodeId(event.target.value)
                    clearRoute()
                  }}
                  value={endNodeId}
                >
                  <option value="">Select destination</option>
                  {testNodes.map((node) => (
                    <option
                      key={node._id}
                      value={node._id}
                      disabled={node._id === startNodeId}
                    >
                      {node.name} — Floor {node.floorNumber}
                    </option>
                  ))}
                </select>
              </label>
              <div className="test-navigation-actions">
                <button
                  className="test-navigate-button"
                  disabled={routing || !startNodeId || !endNodeId || startNodeId === endNodeId}
                  onClick={handleNavigate}
                  type="button"
                >
                  {routing ? 'Calculating…' : 'Navigate'}
                </button>
                {(routeResult || routeMessage) && (
                  <button
                    className="test-clear-button"
                    onClick={() => {
                      clearRoute()
                    }}
                    type="button"
                  >
                    Clear Route
                  </button>
                )}
              </div>
              {routeMessage && (
                <p className="test-route-message" role="status">{routeMessage}</p>
              )}
              {routeResult && (
                <div className="test-route-result" role="status">
                  <strong>Route found</strong>
                  <span>Distance: {Number(routeResult.distance).toFixed(2)}</span>
                  <p>{routePath.map((node) => node.name).join(' → ')}</p>
                  {stairTransitions.map((transition) => (
                    <p className="test-stair-transition" key={transition.key}>
                      {transition.message}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="inspector-section cross-floor-stair-panel">
            <p className="inspector-label">Cross-Floor Stair Connection</p>
            <label className="test-navigation-field">
              From
              <select
                onChange={(event) => {
                  setCrossFloorFromId(event.target.value)
                  setCrossFloorToId('')
                  setCrossFloorConnectionMessage('')
                }}
                value={crossFloorFromId}
              >
                <option value="">Select lower-floor Stair P2</option>
                {stairPart2Nodes.map((node) => (
                  <option key={node._id} value={node._id}>
                    {getStairOptionLabel(node)}
                  </option>
                ))}
              </select>
            </label>
            <label className="test-navigation-field">
              To
              <select
                onChange={(event) => {
                  setCrossFloorToId(event.target.value)
                  setCrossFloorConnectionMessage('')
                }}
                value={crossFloorToId}
              >
                <option value="">Select higher-floor Stair P1</option>
                {crossFloorToOptions.map((node) => (
                  <option key={node._id} value={node._id}>
                    {getStairOptionLabel(node)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="test-navigate-button cross-floor-stair-button"
              disabled={
                savingCrossFloorConnection ||
                !crossFloorFromNode ||
                !crossFloorToNode ||
                !validCrossFloorStairPair
              }
              onClick={handleConnectCrossFloorStairs}
              type="button"
            >
              {savingCrossFloorConnection ? 'Connecting…' : 'Connect Stairs'}
            </button>
            {crossFloorFromNode && crossFloorToNode && !validCrossFloorStairPair && (
              <p className="test-route-message" role="status">
                Connect Part 2 on a floor to Part 1 on the immediately higher floor.
              </p>
            )}
            {crossFloorConnectionMessage && (
              <p className="test-route-message" role="status">
                {crossFloorConnectionMessage}
              </p>
            )}
          </section>

          <section className="inspector-section">
            <div className="inspector-section-heading">
              <p className="inspector-label">Navigation Nodes</p>
              <span className="node-count">{navigationNodes.length}</span>
            </div>
            {loadingNodes ? (
              <p className="sidebar-message">Loading nodes…</p>
            ) : navigationNodes.length === 0 ? (
              <p className="sidebar-message">No nodes on this floor.</p>
            ) : (
              <ul className="inspector-node-list">
                {navigationNodes.map((node) => (
                  <li key={node._id}>
                    <button
                      aria-pressed={node._id === selectedNodeId}
                      className={`inspector-node${node._id === selectedNodeId ? ' is-active' : ''}`}
                      onClick={() => handleChooseNode(node)}
                      type="button"
                    >
                      <span className="inspector-node-dot" />
                      {node.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="inspector-section">
            <div className="inspector-section-heading">
              <p className="inspector-label">Rooms</p>
              <span className="node-count">{roomNodes.length}</span>
            </div>
            {loadingNodes ? (
              <p className="sidebar-message">Loading rooms…</p>
            ) : roomNodes.length === 0 ? (
              <p className="sidebar-message">No rooms on this floor.</p>
            ) : (
              <ul className="inspector-node-list">
                {roomNodes.map((node) => (
                  <li key={node._id}>
                    <button
                      aria-pressed={node._id === selectedNodeId}
                      className={`inspector-node${node._id === selectedNodeId ? ' is-active' : ''}`}
                      onClick={() => handleChooseNode(node)}
                      type="button"
                    >
                      <span className="inspector-room-square" />
                      {node.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="inspector-section">
            <div className="inspector-section-heading">
              <p className="inspector-label">Stair Nodes</p>
              <span className="node-count">{stairNodes.length}</span>
            </div>
            {loadingNodes ? (
              <p className="sidebar-message">Loading stairs…</p>
            ) : stairNodes.length === 0 ? (
              <p className="sidebar-message">No stair nodes on this floor.</p>
            ) : (
              <ul className="inspector-node-list">
                {stairNodes.map((node) => (
                  <li key={node._id}>
                    <button
                      aria-pressed={node._id === selectedNodeId}
                      className={`inspector-node${node._id === selectedNodeId ? ' is-active' : ''}`}
                      onClick={() => handleChooseNode(node)}
                      type="button"
                    >
                      <span className="inspector-stair-diamond" />
                      {node.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {mode === 'connect' && remoteStairNodes.length > 0 && (
            <section className="inspector-section">
              <div className="inspector-section-heading">
                <p className="inspector-label">Stairs on Other Floors</p>
                <span className="node-count">{remoteStairNodes.length}</span>
              </div>
              <ul className="inspector-node-list">
                {remoteStairNodes.map((node) => (
                  <li key={node._id}>
                    <button
                      aria-pressed={connectionNodeIds.includes(node._id)}
                      className={`inspector-node${connectionNodeIds.includes(node._id) ? ' is-active' : ''}`}
                      onClick={() => handleChooseNode(node)}
                      type="button"
                    >
                      <span className="inspector-stair-diamond" />
                      {node.name} · Floor {node.floorNumber}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="inspector-section">
            <div className="inspector-section-heading">
              <p className="inspector-label">Connections</p>
              <span className="node-count">{connections.length}</span>
            </div>
            {connections.length === 0 ? (
              <p className="sidebar-message">No connections on this floor.</p>
            ) : (
              <ul className="connection-list">
                {connections.map((connection) => {
                  const fromNode = getConnectionNode(connection, 'from')
                  const toNode = getConnectionNode(connection, 'to')
                  if (!fromNode || !toNode) {
                    return null
                  }
                  const crossesFloors = getNodeFloorId(fromNode) !== getNodeFloorId(toNode)
                  const stairGroup = typeof fromNode.stairGroup === 'string'
                    ? fromNode.stairGroup.trim()
                    : ''
                  const fromName = crossesFloors
                    ? `${getFloorName(fromNode)} — P${fromNode.stairPart}`
                    : fromNode.name
                  const toName = crossesFloors
                    ? `${getFloorName(toNode)} — P${toNode.stairPart}`
                    : toNode.name
                  return (
                    <li className="connection-item" key={connection._id}>
                      {crossesFloors ? (
                        <span className="connection-name cross-floor-connection-name">
                          <strong>{stairGroup || 'Stair connection'}</strong>
                          <span>{fromName}</span>
                          <span aria-hidden="true">↕</span>
                          <span>{toName}</span>
                          <small>Cross-floor</small>
                        </span>
                      ) : (
                        <span className="connection-name">{fromName} ↔ {toName}</span>
                      )}
                      <button
                        aria-label={`Delete connection ${fromName} to ${toName}`}
                        className="connection-delete"
                        onClick={() => handleDeleteConnection(connection)}
                        type="button"
                      >
                        Delete
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {selectedNode && (
            <section className="inspector-section selected-node">
              <p className="inspector-label">
                {selectedNode.type === 'room' ? 'Selected Room' : selectedNode.type === 'stair' ? 'Selected Stair' : 'Selected Node'}
              </p>
              <strong className="selected-node-name">{selectedNode.name}</strong>
              <p className="inspector-label node-type-label">Type</p>
              <span className="node-type-value">
                {selectedNode.type === 'room' ? 'Room' : selectedNode.type === 'stair' ? 'Stair' : 'Navigation Node'}
              </span>
              {selectedNode.type === 'stair' && (
                <>
                  {selectedNode.stairGroup && (
                    <>
                      <p className="inspector-label node-type-label">Stair Group</p>
                      <span className="node-type-value">{selectedNode.stairGroup}</span>
                    </>
                  )}
                  <p className="inspector-label node-type-label">Part</p>
                  <span className="node-type-value">Part {selectedNode.stairPart}</span>
                  <p className="inspector-label node-type-label">Floor</p>
                  <span className="node-type-value">
                    {selectedFloor.name} (Floor {selectedFloor.floorNumber})
                  </span>
                </>
              )}
              <button
                className="inspector-delete-button"
                onClick={() => handleDeleteNode(selectedNode)}
                type="button"
              >
                Delete Node
              </button>
            </section>
          )}
        </aside>
      </div>

      {addingFloor && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setAddingFloor(false)
            }
          }}
        >
          <section
            aria-labelledby="add-floor-title"
            aria-modal="true"
            className="floor-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="workspace-kicker">FLOOR SETTINGS</p>
                <h2 id="add-floor-title">Add Floor</h2>
              </div>
              <button
                aria-label="Close"
                className="modal-close"
                disabled={saving}
                onClick={() => setAddingFloor(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="floor-form" onSubmit={handleSubmit}>
              <label>
                Floor name
                <input
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label>
                Floor number
                <input
                  onChange={(event) => setFloorNumber(event.target.value)}
                  required
                  type="number"
                  value={floorNumber}
                />
              </label>
              <label>
                Floor map image
                <input
                  accept="image/*"
                  onChange={(event) => setMapImage(event.target.files[0] || null)}
                  required
                  type="file"
                />
              </label>
              <div className="modal-actions">
                <button
                  className="modal-cancel"
                  disabled={saving}
                  onClick={() => setAddingFloor(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button disabled={saving} type="submit">
                  {saving ? 'Saving…' : 'Save Floor'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {roomPosition && (
        <div className="modal-backdrop">
          <section
            aria-labelledby="room-name-title"
            aria-modal="true"
            className="floor-modal room-name-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="workspace-kicker">ROOM NODE</p>
                <h2 id="room-name-title">Name this room</h2>
              </div>
              <button
                aria-label="Cancel room placement"
                className="modal-close"
                onClick={() => setRoomPosition(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="floor-form" onSubmit={handleCreateRoom}>
              <label>
                Room name
                <input
                  autoFocus
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="e.g. Computer Lab"
                  required
                  value={roomName}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="modal-cancel"
                  onClick={() => setRoomPosition(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button disabled={savingRoom} type="submit">
                  {savingRoom ? 'Saving…' : 'Save Room'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {stairPosition && (
        <div className="modal-backdrop">
          <section
            aria-labelledby="stair-part-title"
            aria-modal="true"
            className="floor-modal room-name-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="workspace-kicker">STAIR NODE</p>
                <h2 id="stair-part-title">Choose the stair part</h2>
              </div>
              <button
                aria-label="Cancel stair placement"
                className="modal-close"
                disabled={savingStair}
                onClick={() => setStairPosition(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="floor-form" onSubmit={handleCreateStair}>
              <label>
                Staircase / Stair Group
                <input
                  autoFocus
                  onChange={(event) => setStairGroup(event.target.value)}
                  placeholder="e.g. Main Stair A"
                  required
                  value={stairGroup}
                />
              </label>
              <label>
                Stair part
                <select
                  onChange={(event) => setStairPart(event.target.value)}
                  required
                  value={stairPart}
                >
                  {allowedStairParts.map((part) => (
                    <option key={part} value={part}>Part {part}</option>
                  ))}
                </select>
              </label>
              <div className="modal-actions">
                <button
                  className="modal-cancel"
                  disabled={savingStair}
                  onClick={() => setStairPosition(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button disabled={savingStair} type="submit">
                  {savingStair ? 'Saving…' : 'Save Stair'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default MapEditor
