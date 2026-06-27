import { Routes, Route, Navigate } from 'react-router-dom'
import { MetronomeApp } from './MetronomeApp'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<Navigate to="/metronome" replace />} />
      <Route path="/app" element={<Navigate to="/metronome" replace />} />
      <Route path="/metronome" element={<MetronomeApp />} />
      <Route path="/songs" element={<MetronomeApp />} />
      <Route path="/settings" element={<MetronomeApp />} />

      <Route path="*" element={<Navigate to="/metronome" replace />} />
    </Routes>
  )
}
