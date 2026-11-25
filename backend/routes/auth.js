const crypto = require('crypto')
const express = require('express')
const { OAuth2Client } = require('google-auth-library')
const AdminSession = require('../models/AdminSession')
const {
  ADMIN_SESSION_COOKIE,
  getAdminSessionToken,
  getAllowedOrigins,
  hashSessionToken,
  requireAdminSession,
  requireTrustedOrigin,
} = require('../middleware/adminAuth')

const router = express.Router()
const googleClient = new OAuth2Client()
const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const SESSION_COOKIE_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000)

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function isApprovedAdminEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@rajagiri\.edu\.in$/i.test(email.trim())
}

function getAdminConfiguration() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const email = normalizeEmail(process.env.ADMIN_EMAIL)
  if (!clientId || !isApprovedAdminEmail(email) || getAllowedOrigins().size === 0) {
    return null
  }
  return { clientId, email }
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const originIsSecure = req.get('Origin')?.startsWith('https://')
  const secure = process.env.NODE_ENV === 'production' || originIsSecure ? '; Secure' : ''
  res.set(
    'Set-Cookie',
    `${ADMIN_SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure}`,
  )
}

router.post('/admin/google', requireTrustedOrigin, async (req, res, next) => {
  const configuration = getAdminConfiguration()
  if (!configuration) {
    return res.status(503).json({ message: 'Google Admin authentication is not configured.' })
  }

  const idToken = req.body?.credential
  if (typeof idToken !== 'string' || !idToken) {
    return res.status(400).json({ message: 'A Google ID credential is required.' })
  }

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: configuration.clientId,
    })
    payload = ticket.getPayload()
  } catch {
    return res.status(401).json({ message: 'Google authentication could not be verified.' })
  }

  const issuerIsValid = payload?.iss === 'accounts.google.com' ||
    payload?.iss === 'https://accounts.google.com'
  const audienceIsValid = payload?.aud === configuration.clientId
  const tokenIsUnexpired = Number.isFinite(Number(payload?.exp)) &&
    Number(payload.exp) * 1000 > Date.now()
  if (!issuerIsValid || !audienceIsValid || !tokenIsUnexpired || !payload?.sub) {
    return res.status(401).json({ message: 'Google authentication could not be verified.' })
  }

  const email = normalizeEmail(payload.email)
  if (
    payload.email_verified !== true ||
    String(payload.hd || '').toLowerCase() !== 'rajagiri.edu.in' ||
    email !== configuration.email
  ) {
    return res.status(403).json({ message: 'This Google account is not approved for Admin access.' })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  try {
    await AdminSession.create({
      tokenHash: hashSessionToken(token),
      googleSub: payload.sub,
      email,
      expiresAt,
    })
  } catch (error) {
    return next(error)
  }

  setSessionCookie(req, res, token, SESSION_COOKIE_MAX_AGE_SECONDS)
  return res.json({ authenticated: true })
})

router.get('/admin/session', requireAdminSession, (req, res) => {
  res.json({
    authenticated: true,
    email: req.adminSession.email,
  })
})

router.post('/admin/logout', requireTrustedOrigin, async (req, res, next) => {
  const token = getAdminSessionToken(req)
  try {
    if (token) {
      await AdminSession.deleteOne({ tokenHash: hashSessionToken(token) })
    }
  } catch (error) {
    return next(error)
  }

  setSessionCookie(req, res, '', 0)
  return res.status(204).end()
})

module.exports = {
  isApprovedAdminEmail,
  router,
}
