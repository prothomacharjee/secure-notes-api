import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import { pick } from '../lib/pick.js';

const router = Router();
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy', 12);

const sign = (user) =>
  jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });

router.post('/register', async (req, res) => {
  const user = await User.create({ ...pick(req.body, ['name', 'email', 'password', 'interests']), role: 'user' });
  res.status(201).json({ token: sign(user), user });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  // Hash even when user is missing so response time doesn't reveal which emails exist.
  const ok = user ? await user.checkPassword(password) : await bcrypt.compare(password, DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), user });
});

router.get('/me', auth, (req, res) => res.json(req.user));

export default router;
