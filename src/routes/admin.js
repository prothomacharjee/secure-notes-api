import { Router } from 'express';
import User from '../models/User.js';
import Note from '../models/Note.js';
import Post from '../models/Post.js';
import { pageParams, pageResult } from '../lib/paginate.js';
import { pick } from '../lib/pick.js';

const router = Router();
const FIELDS = ['name', 'email', 'password', 'role', 'interests'];

router.get('/users', async (req, res) => {
  const p = pageParams(req.query);
  const rows = await User.find({}, '-__v').sort({ _id: -1 }).skip(p.skip).limit(p.limit + 1).lean();
  res.json(pageResult(rows, p));
});

router.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id, '-__v').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.post('/users', async (req, res) => {
  const user = await User.create(pick(req.body, FIELDS));
  res.status(201).json(user);
});

// load + save, not findByIdAndUpdate, so the password hashing hook runs.
router.patch('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.set(pick(req.body, FIELDS));
  await user.save();
  res.json(user);
});

router.delete('/users/:id', async (req, res) => {
  if (req.user._id.equals(req.params.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
  const { deletedCount } = await User.deleteOne({ _id: req.params.id });
  if (!deletedCount) return res.status(404).json({ error: 'User not found' });
  await Promise.all([Note.deleteMany({ owner: req.params.id }), Post.deleteMany({ author: req.params.id })]);
  res.status(204).end();
});

// No filter: walks the _id index. ?owner= uses { owner: 1, _id: -1 }.
router.get('/notes', async (req, res) => {
  const p = pageParams(req.query);
  const filter = req.query.owner ? { owner: req.query.owner } : {};
  const rows = await Note.find(filter)
    .sort({ _id: -1 })
    .skip(p.skip)
    .limit(p.limit + 1)
    .populate('owner', 'name email')
    .lean();
  res.json(pageResult(rows, p));
});

export default router;
