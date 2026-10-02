import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const demoAccounts = {
  admin: { password: 'admin_campusnav123', role: 'admin' },
  user: { password: 'user@123nav', role: 'user' },
}

function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function handleSubmit(event) {
    event.preventDefault()

    const account = demoAccounts[username]
    if (!account || account.password !== password) {
      setError('Invalid username or password.')
      return
    }

    sessionStorage.setItem('role', account.role)
    navigate(`/${account.role}`)
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">CampusNav</p>
        <h1>Campus Navigation</h1>
        <p className="intro">Sign in to continue to your CampusNav workspace.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit">Log in</button>
        </form>

        <p className="demo-credentials">
          Demo accounts (presentation only):<br />
          User: <strong>user / user@123nav</strong>
        </p>
      </section>
    </main>
  )
}

export default LoginPage
