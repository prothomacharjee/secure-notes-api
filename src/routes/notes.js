import { Router } from 'express';
import Note from '../models/Note.js';
import { pageParams, pageResult } from '../lib/paginate.js';
import { pick } from '../lib/pick.js';

const router = Router();
const FIELDS = ['title', 'body'];

// Uses { owner: 1, _id: -1 }.
router.get('/', async (req, res) => {
  const p = pageParams(req.query);
  const rows = await Note.find({ owner: req.user._id }).sort({ _id: -1 }).skip(p.skip).limit(p.limit + 1).lean();
  res.json(pageResult(rows, p));
});

router.post('/', async (req, res) => {
  const note = await Note.create({ ...pick(req.body, FIELDS), owner: req.user._id });
  res.status(201).json(note);
});

// Admins may read any note; for users a foreign note is a 404 so ids don't leak.
router.get('/:id', async (req, res) => {
  const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, owner: req.user._id };
  const note = await Note.findOne(filter).lean();
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

router.patch('/:id', async (req, res) => {
  const note = await Note.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, pick(req.body, FIELDS), {
    returnDocument: 'after',
    runValidators: true,
  }).lean();
  if (!note) return res.status(404).json({ error: 'Note not found' });
  res.json(note);
});

router.delete('/:id', async (req, res) => {
  const { deletedCount } = await Note.deleteOne({ _id: req.params.id, owner: req.user._id });
  if (!deletedCount) return res.status(404).json({ error: 'Note not found' });
  res.status(204).end();
});

export default router;
