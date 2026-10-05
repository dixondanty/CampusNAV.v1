function getFloorId(floorId) {
  const id = floorId && typeof floorId === 'object' ? floorId._id : floorId
  return id === undefined || id === null ? '' : String(id)
}

function getFloorNumber(value) {
  const floorNumber = Number(value)
  return value !== undefined && value !== null && Number.isFinite(floorNumber)
    ? floorNumber
    : null
}

function groupNodesByFloor(nodes, floors) {
  const groupsById = new Map()
  const groups = floors.map((floor, index) => {
    const id = getFloorId(floor._id) || `floor-${index}`
    const group = {
      id,
      name: floor.name || `Floor ${floor.floorNumber ?? ''}`.trim(),
      floorNumber: getFloorNumber(floor.floorNumber),
      index,
      nodes: [],
    }
    groupsById.set(id, group)
    return group
  })

  nodes.forEach((node, index) => {
    const floorId = getFloorId(node.floorId)
    let group = groupsById.get(floorId)
    if (!group) {
      const nodeFloorNumber = getFloorNumber(node.floorNumber)
      const id = floorId || `unknown-${node.floorName || index}`
      group = {
        id,
        name: node.floorName || (nodeFloorNumber === null ? 'Unknown floor' : `Floor ${nodeFloorNumber}`),
        floorNumber: nodeFloorNumber,
        index: floors.length + index,
        nodes: [],
      }
      groupsById.set(id, group)
      groups.push(group)
    }
    group.nodes.push(node)
  })

  groups.sort((first, second) => {
    if (first.floorNumber === null && second.floorNumber !== null) return 1
    if (first.floorNumber !== null && second.floorNumber === null) return -1
    return (first.floorNumber ?? 0) - (second.floorNumber ?? 0) ||
      first.index - second.index ||
      first.name.localeCompare(second.name, undefined, { sensitivity: 'base' })
  })

  for (const group of groups) {
    group.nodes.sort((first, second) =>
      String(first.name || '').trim().localeCompare(
        String(second.name || '').trim(),
        undefined,
        { sensitivity: 'base' },
      ),
    )
  }

  return groups
}

export default groupNodesByFloor
