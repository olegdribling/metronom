const express = require('express')
const requireAuth = require('../middleware/auth')
const pool = require('../db')

const router = express.Router()

// GET /api/songs — загрузить песни пользователя
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT data FROM songs WHERE user_id = ?',
      [req.userId]
    )
    const songs = rows[0] ? JSON.parse(rows[0].data) : []
    res.json(songs)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// PUT /api/songs — сохранить весь массив песен
router.put('/', requireAuth, async (req, res) => {
  const songs = req.body
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'Expected array' })

  try {
    await pool.execute(
      `INSERT INTO songs (user_id, data)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [req.userId, JSON.stringify(songs)]
    )
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
