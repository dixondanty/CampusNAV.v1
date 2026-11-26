const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')

export const API_BASE_URL = configuredApiOrigin ||
  (import.meta.env.DEV ? 'http://localhost:5000' : '')
export const API_URL = `${API_BASE_URL}/api`

const RETRYABLE_STATUSES = new Set([429, 503])
export const API_RETRY_DELAYS_MS = [2000, 4000, 8000, 15000]
const MAX_RETRY_AFTER_DELAY_MS = 15000

export function apiFetch(input, options = {}) {
  return fetch(input, {
    ...options,
    credentials: 'include',
  })
}

function parseRetryAfterMs(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_DELAY_MS)
  }

  const dateMs = Date.parse(value)
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), MAX_RETRY_AFTER_DELAY_MS)
  }

  return null
}

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
}

function apiError(message, { response, retryable = false } = {}) {
  const error = new Error(message)
  error.retryable = retryable
  if (response) {
    error.status = response.status
    error.retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'))
  }
  return error
}

function normalizeRetryableError(error) {
  if (error.retryable === true) {
    return error
  }
  if (error instanceof TypeError || error.name === 'TypeError') {
    const wrapped = apiError('Network connection failed.', { retryable: true })
    wrapped.cause = error
    return wrapped
  }
  return error
}

async function readJsonApiResponse(response) {
  let body
  try {
    body = await response.text()
  } catch {
    throw apiError('The server response could not be read.', { response, retryable: true })
  }

  let data
  try {
    data = JSON.parse(body)
  } catch {
    const retryable = response.ok || RETRYABLE_STATUSES.has(response.status)
    const message = response.ok || response.status === 429
      ? 'The server returned an unexpected response.'
      : retryable
        ? `The server is temporarily unavailable (${response.status}).`
        : `The request failed with status ${response.status}.`
    throw apiError(message, { response, retryable })
  }

  if (!response.ok) {
    const retryable = RETRYABLE_STATUSES.has(response.status)
    const message = data?.message ||
      (retryable
        ? `The server is temporarily unavailable (${response.status}).`
        : `The request failed with status ${response.status}.`)
    throw apiError(message, { response, retryable })
  }

  return data
}

export async function apiFetchJsonWithRetry(input, options = {}, onRetry) {
  for (let attempt = 0; attempt <= API_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await apiFetch(input, options)
      return await readJsonApiResponse(response)
    } catch (error) {
      const retryError = normalizeRetryableError(error)
      if (!retryError.retryable || attempt === API_RETRY_DELAYS_MS.length) {
        throw retryError
      }

      const delayMs = retryError.retryAfterMs ?? API_RETRY_DELAYS_MS[attempt]
      onRetry?.({
        attempt: attempt + 1,
        delayMs,
        status: retryError.status ?? null,
        error: retryError,
      })
      await wait(delayMs)
    }
  }

  return undefined
}
