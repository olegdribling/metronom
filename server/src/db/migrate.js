const pool = require('.')

async function migrate() {
  const conn = await pool.getConnection()
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('✓ users')

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        token_hash  VARCHAR(64) NOT NULL,
        expires_at  DATETIME NOT NULL,
        INDEX idx_token_hash (token_hash),
        INDEX idx_user_id (user_id)
      )
    `)
    console.log('✓ refresh_tokens')

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        token_hash  VARCHAR(64) NOT NULL,
        expires_at  DATETIME NOT NULL,
        INDEX idx_token_hash (token_hash)
      )
    `)
    console.log('✓ password_reset_tokens')

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL UNIQUE,
        data        JSON NOT NULL,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id)
      )
    `)
    console.log('✓ songs')

    console.log('\nMigration complete.')
  } finally {
    conn.release()
    await pool.end()
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
