export const MIN_MAP_ZOOM = 0.75
export const MAX_MAP_ZOOM = 9
export const MAP_ZOOM_STEP = 0.15

export function clampMapZoom(value, max = MAX_MAP_ZOOM) {
  return Math.max(MIN_MAP_ZOOM, Math.min(max, value))
}
