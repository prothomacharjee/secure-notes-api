import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET = 'test-secret';
const { default: app } = await import('../src/app.js');
const { default: User } = await import('../src/models/User.js');
const { default: Note } = await import('../src/models/Note.js');

let mongo, server, base;

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

const register = async (name, interests = []) =>
  (await api('/auth/register', { method: 'POST', body: { name, email: `${name}@x.com`, password: 'password123', interests } }))
    .body;

let alice, bob, admin;

test('register, login, me', async () => {
  alice = await register('alice', ['Chess', 'reading']);
  bob = await register('bob', ['chess']);
  assert.equal(alice.user.role, 'user');
  assert.equal(alice.user.password, undefined);

  const dup = await api('/auth/register', { method: 'POST', body: { name: 'a', email: 'ALICE@x.com', password: 'password123' } });
  assert.equal(dup.status, 409);

  const bad = await api('/auth/login', { method: 'POST', body: { email: 'alice@x.com', password: 'nope-nope' } });
  assert.equal(bad.status, 401);

  const me = await api('/auth/me', { token: alice.token });
  assert.equal(me.body.email, 'alice@x.com');
  assert.equal(me.body.password, undefined);

  const forged = await api('/auth/register', { method: 'POST', body: { name: 'eve', email: 'eve@x.com', password: 'password123', role: 'admin' } });
  assert.equal(forged.body.user.role, 'user');

  await User.updateOne({ email: 'eve@x.com' }, { role: 'admin' });
  admin = (await api('/auth/login', { method: 'POST', body: { email: 'eve@x.com', password: 'password123' } })).body;
});

test('notes: CRUD, isolation, pagination', async () => {
  const created = await api('/notes', { token: alice.token, method: 'POST', body: { title: 'n1', owner: bob.user._id } });
  assert.equal(created.status, 201);
  assert.equal(created.body.owner, alice.user._id);
  const id = created.body._id;

  for (const t of ['n2', 'n3']) await api('/notes', { token: alice.token, method: 'POST', body: { title: t } });

  const page1 = await api('/notes?limit=2', { token: alice.token });
  assert.deepEqual(page1.body.items.map((n) => n.title), ['n3', 'n2']);
  assert.equal(page1.body.hasMore, true);
  const page2 = await api('/notes?limit=2&page=2', { token: alice.token });
  assert.deepEqual(page2.body.items.map((n) => n.title), ['n1']);
  assert.equal(page2.body.hasMore, false);

  const clamped = await api('/notes?limit=1000&page=-3', { token: alice.token });
  assert.equal(clamped.body.limit, 50);
  assert.equal(clamped.body.page, 1);

  assert.equal((await api(`/notes/${id}`, { token: bob.token })).status, 404);
  assert.equal((await api(`/notes/${id}`, { token: bob.token, method: 'PATCH', body: { title: 'x' } })).status, 404);
  assert.equal((await api(`/notes/${id}`, { token: bob.token, method: 'DELETE' })).status, 404);
  assert.equal((await api('/notes/not-an-id', { token: bob.token })).status, 400);

  const updated = await api(`/notes/${id}`, { token: alice.token, method: 'PATCH', body: { title: 'n1-edited' } });
  assert.equal(updated.body.title, 'n1-edited');

  assert.equal((await api(`/notes/${id}`, { token: admin.token })).status, 200);
  assert.equal((await api(`/notes/${id}`, { token: alice.token, method: 'DELETE' })).status, 204);
  assert.equal((await api(`/notes/${id}`, { token: alice.token })).status, 404);
});

test('admin: guards, users CRUD, all notes', async () => {
  assert.equal((await api('/admin/users', { token: alice.token })).status, 403);
  assert.equal((await api('/admin/users')).status, 401);

  const users = await api('/admin/users?limit=2', { token: admin.token });
  assert.equal(users.body.items.length, 2);
  assert.equal(users.body.hasMore, true);

  const made = await api('/admin/users', { token: admin.token, method: 'POST', body: { name: 'carl', email: 'carl@x.com', password: 'password123' } });
  assert.equal(made.status, 201);
  const patched = await api(`/admin/users/${made.body._id}`, { token: admin.token, method: 'PATCH', body: { password: 'newpassword1' } });
  assert.equal(patched.status, 200);
  const relog = await api('/auth/login', { method: 'POST', body: { email: 'carl@x.com', password: 'newpassword1' } });
  assert.equal(relog.status, 200);

  await api('/notes', { token: relog.body.token, method: 'POST', body: { title: 'carl note' } });
  const all = await api('/admin/notes', { token: admin.token });
  assert.ok(all.body.items.some((n) => n.owner.name === 'carl'));
  assert.ok(all.body.items.some((n) => n.owner.name === 'alice'));

  assert.equal((await api(`/admin/users/${made.body._id}`, { token: admin.token, method: 'DELETE' })).status, 204);
  assert.equal(await Note.countDocuments({ owner: made.body._id }), 0);
  assert.equal((await api('/auth/me', { token: relog.body.token })).status, 401);
  assert.equal((await api(`/admin/users/${admin.user._id}`, { token: admin.token, method: 'DELETE' })).status, 400);
});

test('aggregation: group by interests', async () => {
  const all = await api('/users/interests', { token: alice.token });
  const chess = all.body.items.find((g) => g.interest === 'chess');
  assert.equal(chess.count, 2);
  assert.deepEqual(chess.users.map((u) => u.name).sort(), ['alice', 'bob']);
  assert.equal(all.body.items.find((g) => g.interest === 'reading').count, 1);
});

test('aggregation: user posts via $lookup', async () => {
  for (const t of ['p1', 'p2', 'p3']) await api('/posts', { token: bob.token, method: 'POST', body: { title: t } });
  const res = await api(`/users/${bob.user._id}/posts?limit=2`, { token: alice.token });
  assert.equal(res.body.user.name, 'bob');
  assert.deepEqual(res.body.items.map((p) => p.title), ['p3', 'p2']);
  assert.equal(res.body.hasMore, true);
  assert.equal((await api('/users/000000000000000000000000/posts', { token: alice.token })).status, 404);
});

test('indexes: exactly the planned set, and list queries use them', async () => {
  const names = async (m) => (await m.collection.indexes()).map((i) => i.name).sort();
  assert.deepEqual(await names(User), ['_id_', 'email_1']);
  assert.deepEqual(await names(Note), ['_id_', 'owner_1__id_-1']);
  assert.deepEqual(await names(mongoose.model('Post')), ['_id_', 'author_1__id_-1']);

  const plan = JSON.stringify(await Note.find({ owner: alice.user._id }).sort({ _id: -1 }).limit(11).explain());
  assert.match(plan, /owner_1__id_-1/);
  assert.doesNotMatch(plan, /"stage":"SORT"/);

});

test('delete user: transaction rolls back when a child delete fails', async () => {
  const victim = await register('victim');
  await api('/notes', { token: victim.token, method: 'POST', body: { title: 'keep me' } });
  const orig = Note.deleteMany;
  Note.deleteMany = () => { throw new Error('boom'); };
  try {
    assert.equal((await api(`/admin/users/${victim.user._id}`, { token: admin.token, method: 'DELETE' })).status, 500);
  } finally {
    Note.deleteMany = orig;
  }
  assert.ok(await User.exists({ _id: victim.user._id })); // user still there
  assert.equal(await Note.countDocuments({ owner: victim.user._id }), 1);
});
