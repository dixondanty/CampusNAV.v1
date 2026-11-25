const crypto = require('crypto')
const AdminSession = require('../models/AdminSession')

const ADMIN_SESSION_COOKIE = 'campusnav_admin_session'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function getAllowedOrigins() {
  const configuredOrigins = process.env.FRONTEND_ORIGIN
  const origins = configuredOrigins
    ? configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean)
    : process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://127.0.0.1:5173']

  return new Set(origins.flatMap((origin) => {
    try {
      const parsed = new URL(origin)
      return parsed.origin === origin.replace(/\/$/, '') ? [parsed.origin] : []
    } catch {
      return []
    }
  }))
}

function isTrustedOrigin(origin) {
  return typeof origin === 'string' && getAllowedOrigins().has(origin)
}

function requireTrustedOrigin(req, res, next) {
  if (!isTrustedOrigin(req.get('Origin'))) {
    return res.status(403).json({ message: 'Request origin is not allowed.' })
  }
  return next()
}

function getAdminSessionToken(req) {
  const cookieHeader = req.headers.cookie || ''
  const cookie = cookieHeader.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
  const token = cookie?.slice(ADMIN_SESSION_COOKIE.length + 1)
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : ''
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function requireAdminSession(req, res, next) {
  const token = getAdminSessionToken(req)
  if (!token) {
    return res.status(401).json({ message: 'Admin authentication is required.' })
  }

  try {
    const session = await AdminSession.findOne({
      tokenHash: hashSessionToken(token),
      expiresAt: { $gt: new Date() },
    })
    const approvedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (
      !session ||
      !approvedEmail ||
      !/^[^@\s]+@rajagiri\.edu\.in$/.test(approvedEmail) ||
      session.email !== approvedEmail
    ) {
      return res.status(401).json({ message: 'Admin authentication is required.' })
    }

    req.adminSession = session
    return next()
  } catch (error) {
    return next(error)
  }
}

function requireAdminMutation(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) {
    return next()
  }

  return requireAdminSession(req, res, (error) => {
    if (error) {
      return next(error)
    }
    if (res.headersSent) {
      return undefined
    }
    return requireTrustedOrigin(req, res, next)
  })
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  getAdminSessionToken,
  getAllowedOrigins,
  hashSessionToken,
  isTrustedOrigin,
  requireAdminMutation,
  requireAdminSession,
  requireTrustedOrigin,
}
