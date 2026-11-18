import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import { pageParams, pageResult } from '../lib/paginate.js';

const router = Router();
const MEMBERS_PER_GROUP = 20;

// Scenario 1: exactly one aggregate() call.
router.get('/interests', async (req, res) => {
  const p = pageParams(req.query);
  const rows = await User.aggregate([
    { $project: { name: 1, interests: 1 } },
    { $unwind: '$interests' },
    {
      $group: {
        _id: '$interests',
        count: { $sum: 1 },
        users: { $firstN: { n: MEMBERS_PER_GROUP, input: { _id: '$_id', name: '$name' } } },
      },
    },
    { $sort: { _id: 1 } },
    { $skip: p.skip },
    { $limit: p.limit + 1 },
    { $project: { _id: 0, interest: '$_id', count: 1, users: 1 } },
  ]);
  res.json(pageResult(rows, p));
});

// Scenario 2: one pipeline with $lookup; the sub-pipeline pages over { author: 1, _id: -1 }.
router.get('/:id/posts', async (req, res) => {
  const p = pageParams(req.query);
  const [user] = await User.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
    { $project: { name: 1 } },
    {
      $lookup: {
        from: 'posts',
        localField: '_id',
        foreignField: 'author',
        pipeline: [{ $sort: { _id: -1 } }, { $skip: p.skip }, { $limit: p.limit + 1 }, { $project: { author: 0 } }],
        as: 'posts',
      },
    },
  ]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: { _id: user._id, name: user.name }, ...pageResult(user.posts, p) });
});

export default router;
