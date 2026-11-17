import { Router } from 'express';
import Post from '../models/Post.js';
import { pick } from '../lib/pick.js';

const router = Router();

router.post('/', async (req, res) => {
  const post = await Post.create({ ...pick(req.body, ['title', 'body']), author: req.user._id });
  res.status(201).json(post);
});

export default router;
