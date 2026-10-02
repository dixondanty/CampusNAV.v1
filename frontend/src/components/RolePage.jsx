import { useNavigate } from 'react-router-dom'

function RolePage({ title, description }) {
  const navigate = useNavigate()

  function handleLogout() {
    sessionStorage.removeItem('role')
    navigate('/')
  }

  return (
    <main className="role-page">
      <section className="role-card">
        <p className="eyebrow">CampusAR</p>
        <h1>{title}</h1>
        <p>{description}</p>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </section>
    </main>
  )
}

export default RolePage
