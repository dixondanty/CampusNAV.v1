import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, API_URL } from '../utils/api.js'

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'
let googleScriptPromise

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id)
  }
  if (!googleScriptPromise) {
    googleScriptPromise = new Promise((resolve, reject) => {
      let script = document.querySelector(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`)
      const handleLoad = () => {
        if (window.google?.accounts?.id) {
          resolve(window.google.accounts.id)
        } else {
          reject(new Error('Google Identity Services did not initialize.'))
        }
      }
      const handleError = () => reject(new Error('Google sign-in could not be loaded.'))
      if (!script) {
        script = document.createElement('script')
        script.src = GOOGLE_IDENTITY_SCRIPT
        script.async = true
        script.defer = true
        script.addEventListener('load', handleLoad, { once: true })
        script.addEventListener('error', handleError, { once: true })
        document.head.append(script)
      } else {
        script.addEventListener('load', handleLoad, { once: true })
        script.addEventListener('error', handleError, { once: true })
      }
    })
  }
  return googleScriptPromise
}

function AdminLoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const buttonRef = useRef(null)
  const navigate = useNavigate()
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  useEffect(() => {
    if (!clientId) {
      return undefined
    }

    let active = true
    loadGoogleIdentityScript().then((identity) => {
      if (!active || !buttonRef.current) {
        return
      }
      identity.initialize({
        client_id: clientId,
        auto_select: false,
        callback: async ({ credential }) => {
          setLoading(true)
          setError('')
          try {
            const response = await apiFetch(`${API_URL}/auth/admin/google`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential }),
            })
            const result = await response.json()
            if (!response.ok) {
              throw new Error(result.message || 'Google sign-in was not accepted.')
            }
            navigate('/admin', { replace: true })
          } catch (signInError) {
            setError(signInError.message)
          } finally {
            setLoading(false)
          }
        },
      })
      identity.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 320,
        logo_alignment: 'left',
      })
    }).catch((loadError) => {
      if (active) {
        setError(loadError.message)
      }
    })
    return () => {
      active = false
    }
  }, [clientId, navigate])

  return (
    <main className="admin-login-page">
      <header className="admin-login-header">
        <Link className="admin-login-brand" to="/user">
          <span aria-hidden="true" className="admin-login-brand-mark">C</span>
          <span>CampusNAV</span>
        </Link>
        <span className="admin-login-label">ADMIN ACCESS</span>
      </header>
      <section aria-labelledby="admin-login-title" className="admin-login-card">
        <span className="admin-login-icon" aria-hidden="true">A</span>
        <p className="admin-login-eyebrow">CampusNAV Administration</p>
        <h1 id="admin-login-title">Admin Login</h1>
        <p className="admin-login-description">
          Sign in with the approved Rajagiri Workspace account to manage campus maps and navigation data.
        </p>
        {clientId ? (
          <div
            aria-busy={loading}
            className={`admin-google-button${loading ? ' is-loading' : ''}`}
            ref={buttonRef}
          />
        ) : (
          <button className="admin-google-unconfigured" disabled type="button">
            Continue with Google
          </button>
        )}
        {loading && <p className="admin-login-status" role="status">Verifying Google account…</p>}
        {!clientId && (
          <p className="admin-login-status" role="status">
            Google sign-in is unavailable until the Web Client ID is configured.
          </p>
        )}
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <Link className="admin-login-return" to="/user">Return to Campus Navigation</Link>
      </section>
      <p className="admin-login-footer">Secure access for authorized campus administrators</p>
    </main>
  )
}

export default AdminLoginPage
