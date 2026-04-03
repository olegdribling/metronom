const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const rateLimit = require('express-rate-limit')
const { Resend } = require('resend')
const pool = require('../db')
require('dotenv').config()

const getResend = () => new Resend(process.env.RESEND_API_KEY)

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
})

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again later.' },
})

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex')

const makeRefreshToken = () => {
  const token = crypto.randomBytes(64).toString('hex')
  return { token, hash: hashToken(token) }
}

const storeRefreshToken = async (userId, hash) => {
  await pool.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))`,
    [userId, hash]
  )
}

// Регистрация
router.post('/register', authLimiter, async (req, res) => {
  const { email, password } = req.body
  try {
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length > 0)
      return res.status(400).json({ error: 'Email уже занят' })

    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, hash]
    )
    const newUserId = result.insertId

    const accessToken = jwt.sign({ userId: newUserId }, process.env.JWT_SECRET, { expiresIn: '15m' })
    const { token: refreshToken, hash: refreshHash } = makeRefreshToken()
    await storeRefreshToken(newUserId, refreshHash)
    res.json({ token: accessToken, refreshToken, user: { id: newUserId, email } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Логин
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body
  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email])
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Неверный email или пароль' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' })

    const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '15m' })
    const { token: refreshToken, hash: refreshHash } = makeRefreshToken()
    await storeRefreshToken(user.id, refreshHash)
    res.json({ token: accessToken, refreshToken, user: { id: user.id, email: user.email } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Обновление токена
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' })
  try {
    const hash = hashToken(refreshToken)
    const [rows] = await pool.execute(
      `SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > NOW()`,
      [hash]
    )
    if (!rows[0]) return res.status(401).json({ error: 'Invalid or expired refresh token' })
    const { user_id } = rows[0]

    await pool.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [hash])
    const { token: newRefresh, hash: newHash } = makeRefreshToken()
    await storeRefreshToken(user_id, newHash)
    const newAccess = jwt.sign({ userId: user_id }, process.env.JWT_SECRET, { expiresIn: '15m' })
    res.json({ token: newAccess, refreshToken: newRefresh })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Выход
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body
  try {
    if (refreshToken) {
      const hash = hashToken(refreshToken)
      await pool.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', [hash])
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Запрос сброса пароля
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  try {
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
    if (rows.length === 0) return res.json({ ok: true })

    const userId = rows[0].id
    const token = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(token).digest('hex')

    await pool.execute(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [userId, hash]
    )

    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    const appName = process.env.APP_NAME || 'Metronom'
    const fromEmail = process.env.FROM_EMAIL || `noreply@${new URL(appUrl).hostname}`
    const resetLink = `${appUrl}/reset-password?token=${token}`

    await getResend().emails.send({
      from: fromEmail,
      to: email,
      subject: `Reset your password — ${appName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1a2b42">Reset your password</h2>
          <p>We received a request to reset the password for your ${appName} account.</p>
          <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
          <a href="${resetLink}" style="display:inline-block;margin:16px 0;padding:12px 24px;background:#1a2b42;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
            Reset Password
          </a>
          <p style="color:#666;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
          <p style="color:#aaa;font-size:12px">${appName}</p>
        </div>
      `,
    })

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Сброс пароля по токену
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  try {
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const [rows] = await pool.execute(
      `SELECT * FROM password_reset_tokens WHERE token_hash = ? AND expires_at > NOW()`,
      [hash]
    )
    if (!rows[0]) return res.status(400).json({ error: 'Invalid or expired reset link' })

    const { user_id } = rows[0]
    const passwordHash = await bcrypt.hash(password, 10)
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, user_id])
    await pool.execute('DELETE FROM password_reset_tokens WHERE token_hash = ?', [hash])
    await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [user_id])

    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// Текущий пользователь
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [req.userId])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
