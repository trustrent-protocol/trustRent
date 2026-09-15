const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const User = require('../../db/models/user');
const validate = require('../middleware/validate');

// Brute-force protection: tight per-IP limits on the credential endpooints.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REGISTER_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later' },
});

// POST /api/v1/users/register
router.post(
  '/register',
  registerLimiter,
  body('email').isEmail(),
  body('password').isLength({ min: 8 }),
  body('role').isIn(['landlord', 'tenant', 'agent']),
  validate,
  async (req, res, next) => {
    try {
      const { email, password, role, stellar_pk } = req.body;
      const hash = await bcrypt.hash(password, 10);
      const { rows } = await User.create({ email, password: hash, role, stellar_pk });
      const user = rows[0];
      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });
      res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      next(err);
    }
  },
);

// POST /api/v1/users/login
router.post(
  '/login',
  loginLimiter,
  body('email').isEmail(),
  body('password').notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { rows } = await User.findByEmail(email);
      const user = rows[0];
      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });
      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
