import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret';
const { default: app } = await import('../src/app.js');
const { seedDemo, DEMO_ADMIN, DEMO_PASSWORD } = await import('../scripts/demo-data.js');

let mongo, server, base, admin, user;

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await mongoose.connection.syncIndexes();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await mongoose.disconnect();
  await mongo.stop();
});

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const login = async (email) => (await api('/auth/login', { method: 'POST', body: { email, password: DEMO_PASSWORD } })).body;

test('seed is re-runnable and logins work', async () => {
  assert.deepEqual(await seedDemo(), { users: 31, notes: 775, posts: 240 });
  assert.deepEqual(await seedDemo(), { users: 31, notes: 775, posts: 240 }); // no duplicates on re-run
  admin = await login(DEMO_ADMIN);
  user = await login('user1@demo.test');
  assert.equal(admin.user.role, 'admin');
  assert.equal(user.user.role, 'user');
});

test('notes pagination: 25 notes = 3 pages, newest first', async () => {
  const p = (n, q = '') => api(`/notes?page=${n}${q}`, { token: user.token });
  const [p1, p2, p3, p4] = [await p(1), await p(2), await p(3), await p(4)];
  assert.deepEqual([p1.body.items.length, p2.body.items.length, p3.body.items.length, p4.body.items.length], [10, 10, 5, 0]);
  assert.deepEqual([p1.body.hasMore, p2.body.hasMore, p3.body.hasMore], [true, true, false]);
  assert.equal((await p(1, '&limit=50')).body.items.length, 25);
  assert.ok(p1.body.items.every((n) => n.body.includes('user1@demo.test'))); // own notes only
  const t = p1.body.items.map((n) => +new Date(n.createdAt));
  assert.deepEqual(t, [...t].sort((a, b) => b - a));
});

test('admin: users pages, all-notes pages, owner filter, role guard', async () => {
  assert.equal((await api('/admin/users', { token: user.token })).status, 403);
  const seen = [];
  for (let n = 1; ; n++) {
    const r = await api(`/admin/users?page=${n}`, { token: admin.token });
    seen.push(...r.body.items);
    if (!r.body.hasMore) break;
  }
  assert.equal(seen.length, 31);
  assert.equal(new Set(seen.map((u) => u._id)).size, 31); // no overlap across pages

  const all = await api('/admin/notes?limit=50', { token: admin.token });
  assert.equal(all.body.items.length, 50);
  assert.equal(all.body.hasMore, true);
  assert.ok(all.body.items[0].owner.name);

  const mine = await api(`/admin/notes?owner=${user.user._id}&limit=50`, { token: admin.token });
  assert.equal(mine.body.items.length, 25);
});

test('interest grouping: all groups, pagination', async () => {
  const all = await api('/users/interests?limit=50', { token: user.token });
  assert.equal(all.body.items.length, 8);
  assert.ok(all.body.items.find((g) => g.interest === 'chess').count > 1);
  const pg = await api('/users/interests?limit=3', { token: user.token });
  assert.equal(pg.body.items.length, 3);
  assert.equal(pg.body.hasMore, true);
});

test('posts of a user: 15 posts = 2 pages; none = empty; unknown user = 404', async () => {
  const users = (await api('/admin/users?limit=50', { token: admin.token })).body.items;
  const id = (email) => users.find((u) => u.email === email)._id;
  const author = id('user2@demo.test'); // even index -> has posts
  const p1 = await api(`/users/${author}/posts`, { token: user.token });
  const p2 = await api(`/users/${author}/posts?page=2`, { token: user.token });
  assert.deepEqual([p1.body.items.length, p1.body.hasMore, p2.body.items.length, p2.body.hasMore], [10, true, 5, false]);
  assert.equal((await api(`/users/${id('user1@demo.test')}/posts`, { token: user.token })).body.items.length, 0);
  assert.equal((await api('/users/000000000000000000000000/posts', { token: user.token })).status, 404);
});

test('duplicate email on seeded data is rejected fast', async () => {
  const t = performance.now();
  const r = await api('/admin/users', { token: admin.token, method: 'POST', body: { name: 'x', email: 'user1@demo.test', password: 'password123' } });
  assert.equal(r.status, 409);
  assert.ok(performance.now() - t < 300);
});
