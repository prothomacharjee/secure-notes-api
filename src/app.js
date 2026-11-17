import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import postRoutes from './routes/posts.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';
import { auth, adminOnly } from './middleware/auth.js';

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/notes', auth, noteRoutes);
app.use('/api/posts', auth, postRoutes);
app.use('/api/users', auth, userRoutes);
app.use('/api/admin', auth, adminOnly, adminRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  if (err instanceof mongoose.Error.CastError || err.name === 'BSONError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: err.message });
  if (err.code === 11000) return res.status(409).json({ error: 'Email already in use' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
