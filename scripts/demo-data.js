import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Note from '../src/models/Note.js';
import Post from '../src/models/Post.js';

export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_ADMIN = 'admin@demo.test';
const DOMAIN = '@demo.test';
const INTERESTS = ['chess', 'reading', 'hiking', 'cooking', 'music', 'gaming', 'travel', 'photography'];
const FIRST = ['Ava', 'Ben', 'Cara', 'Dev', 'Ella', 'Finn', 'Gia', 'Hugo', 'Ivy', 'Jay', 'Kai', 'Lena', 'Max', 'Nia', 'Omar'];

// Re-runnable: wipes previous demo users (and their notes/posts), then re-inserts.
// 1 admin + 30 users: 25 notes each (3 pages), 15 posts for every 2nd user, 1-3 interests each.
export async function seedDemo() {
  const old = await User.find({ email: new RegExp(`${DOMAIN}$`) }, '_id').lean();
  const oldIds = old.map((u) => u._id);
  await Promise.all([
    Note.deleteMany({ owner: { $in: oldIds } }),
    Post.deleteMany({ author: { $in: oldIds } }),
    User.deleteMany({ _id: { $in: oldIds } }),
  ]);

  const password = await bcrypt.hash(DEMO_PASSWORD, 12); // hash once; insertMany skips the save hook
  const rows = [{ name: 'Demo Admin', email: DEMO_ADMIN, role: 'admin', interests: ['chess'] }];
  for (let i = 1; i <= 30; i++) {
    const interests = [...new Set([INTERESTS[i % 8], INTERESTS[(i * 3) % 8], ...(i % 3 ? [] : [INTERESTS[(i + 5) % 8]])])];
    rows.push({ name: `${FIRST[i % FIRST.length]} ${i}`, email: `user${i}${DOMAIN}`, role: 'user', interests });
  }
  const users = await User.insertMany(rows.map((r) => ({ ...r, password })));

  const now = Date.now();
  const notes = [];
  const posts = [];
  users.forEach((u, ui) => {
    for (let n = 1; n <= 25; n++) {
      notes.push({
        owner: u._id,
        title: `${u.name.split(' ')[0]} note ${n}`,
        body: `Private note ${n} of ${u.email}`,
        createdAt: new Date(now - (ui * 25 + 25 - n) * 60000),
      });
    }
    if (ui % 2 === 0) for (let p = 1; p <= 15; p++) posts.push({ author: u._id, title: `Post ${p} by ${u.name}`, body: `Public post ${p}` });
  });
  await Note.insertMany(notes);
  await Post.insertMany(posts);
  return { users: users.length, notes: notes.length, posts: posts.length };
}
