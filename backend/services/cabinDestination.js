const Connection = require('../models/Connection')
const Floor = require('../models/Floor')
const Node = require('../models/Node')

// Cabin references may be populated objects or raw ObjectIds depending on the
// query, so normalise both shapes to a comparable string.
function toIdString(value) {
  if (value === undefined || value === null) {
    return ''
  }
  const id = typeof value === 'object' && '_id' in value ? value._id : value
  return String(id)
}

function pickNearest(nodes, x, y) {
  return nodes.reduce((nearest, node) => {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
      return nearest
    }

    const distance = (node.x - x) ** 2 + (node.y - y) ** 2
    if (!nearest || distance < nearest.distance) {
      return { node, distance }
    }

    return nearest
  }, null)?.node || null
}

// A teacher cabin is reachable through the staffroom room node it belongs to.
// Prefer an ordinary navigation node directly connected to the staffroom,
// falling back to the nearest navigation node on the same floor.
async function resolveCabinDestination({ staffroomRoomId, floorId, x, y, session }) {
  const staffroomId = toIdString(staffroomRoomId)
  const targetFloorId = toIdString(floorId)

  const connectionQuery = Connection.find({
    $or: [{ from: staffroomId }, { to: staffroomId }],
  })
  if (session) connectionQuery.session(session)
  const connections = await connectionQuery
  const neighbourIds = connections
    .flatMap((connection) => {
      const from = toIdString(connection.from)
      const to = toIdString(connection.to)
      if (from === staffroomId) {
        return [to]
      }
      if (to === staffroomId) {
        return [from]
      }
      return []
    })
    .filter((id) => id && id !== staffroomId)

  if (neighbourIds.length > 0) {
    const neighbourQuery = Node.find({ _id: { $in: neighbourIds } })
    if (session) neighbourQuery.session(session)
    const neighbours = await neighbourQuery
    const navNeighbours = neighbours.filter(
      (node) => node.type === 'nav' && toIdString(node.floorId) === targetFloorId,
    )
    const nearestNav = pickNearest(navNeighbours, Number(x), Number(y))
    if (nearestNav) {
      return String(nearestNav._id)
    }
  }

  const floorNavQuery = Node.find({ type: 'nav', floorId: targetFloorId })
  if (session) floorNavQuery.session(session)
  const floorNavNodes = await floorNavQuery
  const nearestOnFloor = pickNearest(floorNavNodes, Number(x), Number(y))
  return nearestOnFloor ? String(nearestOnFloor._id) : null
}

// Add display metadata (staffroom name, floor label) and the resolved
// destination navigation node to each cabin for the editor and user app.
async function decorateCabins(cabins, { session } = {}) {
  if (cabins.length === 0) {
    return []
  }

  const floorIds = [...new Set(cabins.map((cabin) => toIdString(cabin.floorId)))]
  const roomIds = [...new Set(cabins.map((cabin) => toIdString(cabin.staffroomRoomId)))]

  let floors
  let rooms
  if (session) {
    floors = await Floor.find({ _id: { $in: floorIds } }).session(session)
    rooms = await Node.find({ _id: { $in: roomIds } }).session(session)
  } else {
    [floors, rooms] = await Promise.all([
      Floor.find({ _id: { $in: floorIds } }),
      Node.find({ _id: { $in: roomIds } }),
    ])
  }
  const floorById = new Map(floors.map((floor) => [String(floor._id), floor]))
  const roomById = new Map(rooms.map((room) => [String(room._id), room]))

  const decorate = async (cabin) => {
      const floor = floorById.get(toIdString(cabin.floorId))
      const room = roomById.get(toIdString(cabin.staffroomRoomId))
      const destinationNodeId = floor
        ? await resolveCabinDestination({
            staffroomRoomId: cabin.staffroomRoomId,
            floorId: cabin.floorId,
            x: cabin.x,
            y: cabin.y,
            session,
          })
        : null

      return {
        ...cabin.toObject(),
        staffroomName: room?.name || '',
        floorName: floor?.name || '',
        floorNumber: floor?.floorNumber ?? null,
        floorContext: floor?.context || '',
        buildingId: toIdString(floor?.buildingId),
        destinationNodeId,
      }
    }

  if (session) {
    const decorated = []
    for (const cabin of cabins) {
      decorated.push(await decorate(cabin))
    }
    return decorated
  }

  return Promise.all(cabins.map(decorate))
}

module.exports = {
  resolveCabinDestination,
  decorateCabins,
}
