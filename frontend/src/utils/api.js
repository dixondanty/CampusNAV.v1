const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')

export const API_BASE_URL = configuredApiOrigin ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '')
export const API_URL = `${API_BASE_URL}/api`

export function apiFetch(input, options = {}) {
  return fetch(input, {
    ...options,
    credentials: 'include',
  })
}
