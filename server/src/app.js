const express = require('express')
const cors = require('cors')
require('dotenv').config()

const app = express()

app.set('trust proxy', 1)

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://slateblue-crow-206906.hostingersite.com',
  ],
  credentials: true,
}))

app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.use(express.json())

app.use('/api/auth', require('./routes/auth'))
app.use('/api/songs', require('./routes/songs'))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
