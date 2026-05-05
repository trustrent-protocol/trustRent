const pool = require('../pool');

const create = (data) => pool.query(
  `INSERT INTO users (email, password, role, stellar_pk)
   VALUES ($1, $2, $3, $4) RETURNING *`,
  [data.email, data.password, data.role, data.stellar_pk || null]
);

const findByEmail = (email) => pool.query(
  'SELECT * FROM users WHERE email = $1', [email]
);

const findById = (id) => pool.query(
  'SELECT id, email, role, stellar_pk, created_at FROM users WHERE id = $1', [id]
);

module.exports = { create, findByEmail, findById };
