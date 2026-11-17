import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function auth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing token' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Reload by _id so deleted/demoted users lose access immediately.
  req.user = await User.findById(payload.sub, '-__v').lean();
  if (!req.user) return res.status(401).json({ error: 'User no longer exists' });
  next();
}

export function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}
