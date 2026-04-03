import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!password) return setError('Please enter a new password')
    if (password.length < 6) return setError('Password must be at least 6 characters')
    if (password !== confirm) return setError('Passwords do not match')
    if (!token) return setError('Invalid reset link')
    setError('')
    setLoading(true)
    const data = await api.resetPassword(token, password)
    setLoading(false)
    if (data.error) return setError(data.error)
    navigate('/login?reset=1')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">Invalid link</h1>
          <p className="auth-subtitle">This reset link is missing or invalid.</p>
          <p className="auth-footer"><Link to="/forgot-password">Request a new one</Link></p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-app-name">Metronom</h1>
        <h2 className="auth-title">Set new password</h2>
        <p className="auth-subtitle">Choose a strong password for your account</p>

        <div className="auth-field">
          <label className="auth-label">New password</label>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Confirm password</label>
          <input
            className="auth-input"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="auth-btn" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Save new password'}
        </button>

        <p className="auth-footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
