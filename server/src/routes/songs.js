const express = require('express')
const requireAuth = require('../middleware/auth')
const pool = require('../db')

const router = express.Router()

// GET /api/songs — загрузить песни пользователя + версию для optimistic lock
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT data, updated_at FROM songs WHERE user_id = ?',
      [req.userId]
    )
    if (!rows[0]) return res.json({ songs: [], updatedAt: null })
    res.json({ songs: JSON.parse(rows[0].data), updatedAt: rows[0].updated_at })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

// PUT /api/songs — сохранить весь массив песен с optimistic lock по updatedAt
router.put('/', requireAuth, async (req, res) => {
  const { songs, updatedAt } = req.body
  if (!Array.isArray(songs)) return res.status(400).json({ error: 'Expected { songs: [], updatedAt }' })

  try {
    if (!updatedAt) {
      // Нет версии от клиента — это первый save (новый пользователь без строки
      // в songs) или старый клиент. Обычный upsert без проверки версии.
      await pool.execute(
        `INSERT INTO songs (user_id, data)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
        [req.userId, JSON.stringify(songs)]
      )
      const [fresh] = await pool.execute('SELECT updated_at FROM songs WHERE user_id = ?', [req.userId])
      return res.json({ ok: true, updatedAt: fresh[0].updated_at })
    }

    // Атомарная запись с проверкой версии: если строка успела измениться
    // между GET и этим PUT, affectedRows будет 0.
    const [result] = await pool.execute(
      `UPDATE songs SET data = ?, updated_at = NOW()
       WHERE user_id = ? AND updated_at = ?`,
      [JSON.stringify(songs), req.userId, updatedAt]
    )

    if (result.affectedRows === 0) {
      const [rows] = await pool.execute('SELECT data, updated_at FROM songs WHERE user_id = ?', [req.userId])

      if (!rows[0]) {
        // Строки не было вообще — клиент прислал устаревший updatedAt,
        // но это не конфликт версий, а первый реальный insert.
        await pool.execute('INSERT INTO songs (user_id, data) VALUES (?, ?)', [req.userId, JSON.stringify(songs)])
        const [fresh] = await pool.execute('SELECT updated_at FROM songs WHERE user_id = ?', [req.userId])
        return res.json({ ok: true, updatedAt: fresh[0].updated_at })
      }

      // Реальный конфликт: на сервере уже другая версия данных.
      return res.status(409).json({
        error: 'conflict',
        songs: JSON.parse(rows[0].data),
        updatedAt: rows[0].updated_at,
      })
    }

    const [fresh] = await pool.execute('SELECT updated_at FROM songs WHERE user_id = ?', [req.userId])
    res.json({ ok: true, updatedAt: fresh[0].updated_at })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Ошибка сервера' })
  }
})

module.exports = router
