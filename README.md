# Secure Notes API

REST API for a note-taking app with JWT auth and role-based access (user / admin).
Node 20+, Express 5, MongoDB + Mongoose, bcrypt password hashing.

## Run locally

```bash
npm install
cp .env.example .env      # fill MONGODB_URI and JWT_SECRET
npm run seed:admin        # creates/updates the admin from ADMIN_* vars
npm run seed:demo         # optional: dummy users, notes and posts (see Demo data)
npm run dev               # http://localhost:4000/api/health
npm test                  # in-memory MongoDB replica set, no setup needed (first run downloads mongod)
```

## Endpoints

All list endpoints take `?page=1&limit=10` (limit max 50) and return `{ items, page, limit, hasMore }`.
Send `Authorization: Bearer <token>` on everything except register/login/health.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | /api/auth/register | public | `{ name, email, password, interests[] }` → `{ token, user }`. Role is always `user`. |
| POST | /api/auth/login | public | `{ email, password }` → `{ token, user }` |
| GET | /api/auth/me | user | Current profile |
| GET | /api/notes | user | Own notes, newest first |
| POST | /api/notes | user | `{ title, body }` |
| GET | /api/notes/:id | user | Own note; admin can read any note |
| PATCH | /api/notes/:id | user | Own note only |
| DELETE | /api/notes/:id | user | Own note only |
| POST | /api/posts | user | `{ title, body }` (posts are public to all users) |
| GET | /api/users/:id/posts | user | One user's posts — single aggregation with `$lookup` |
| GET | /api/users/interests | user | Users grouped by interest — single `aggregate()`, paginated over groups |
| GET | /api/admin/users | admin | List users |
| GET | /api/admin/users/:id | admin | User profile |
| POST | /api/admin/users | admin | `{ name, email, password, role, interests[] }` |
| PATCH | /api/admin/users/:id | admin | Any of the above fields |
| DELETE | /api/admin/users/:id | admin | Deletes the user and their notes and posts in one transaction (all or nothing) |
| GET | /api/admin/notes | admin | Everyone's notes; optional `?owner=<userId>` |

## Indexes

Defined with `schema.index` in `src/models`. Exactly three secondary indexes exist besides the default `_id`, and a test asserts that:

| Collection | Index | Serves |
|---|---|---|
| users | `{ email: 1 }` unique | login lookup, duplicate-email guard |
| notes | `{ owner: 1, _id: -1 }` | own-notes list (filter + sort, no in-memory sort), owner-scoped get/update/delete, admin `?owner=`, cascade delete |
| posts | `{ author: 1, _id: -1 }` | `$lookup` from users → posts, sorted + paginated inside the sub-pipeline |

Admin "list users", admin "list all notes" and every get-by-id use the built-in `_id` index, because lists are sorted by `_id` (an ObjectId starts with its creation time, so `_id` order is creation order).

### Why no other indexes

- **Users by interest (Scenario 1):** grouping every user by interest has to read every user, so no index can help. A multikey index on `interests` can't cover it either, so there is none.
- **No `createdAt`, `role`, `name` or `title` indexes:** nothing filters or sorts on them.
- **No `{ owner: 1 }` on notes:** it is a prefix of the compound index.
- **Get / update / delete one note:** `_id` is unique, so the `_id` index already finds exactly one document; the owner is then checked.
- `npm test` runs `explain()` on the own-notes list and asserts it uses `owner_1__id_-1` with no in-memory SORT stage.

## Demo data

`npm run seed:demo` fills the database in the `MONGODB_URI` with dummy data. It is re-runnable: it deletes the previous `@demo.test` accounts (and their notes and posts), then inserts again.

| What | Count |
|---|---|
| Users | 30 (`user1@demo.test` … `user30@demo.test`), 1–3 interests each from 8 topics |
| Admin | 1 (`admin@demo.test`) |
| Notes | 25 per account (3 pages at the default page size of 10) |
| Posts | 15 each for the admin and the even-numbered users (2 pages); odd-numbered users have none |

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Admin | `admin@demo.test` | `Demo@1234` |
| User | `user1@demo.test` … `user30@demo.test` | `Demo@1234` |

**These accounts are for review only. Delete them before using the database for anything real.**

### What to try

- **Notes pagination:** log in as `user1@demo.test` → My notes → Next/Prev (10, 10, 5), or `GET /api/notes?page=2&limit=5`.
- **Isolation:** user1 sees only their own notes; `GET /api/notes/<another user's note id>` → 404.
- **Admin:** log in as `admin@demo.test` → add, edit and delete users; "All notes" shows everyone's notes (`/api/admin/notes?owner=<userId>` filters by owner). A normal user calling `/api/admin/*` gets 403.
- **Group by interest:** "Users by interest" in the UI, or `GET /api/users/interests`.
- **User posts (`$lookup`):** `GET /api/users/<id of user2>/posts?page=2` (user2 has 15 posts); user1 has none → empty list; unknown id → 404.
- **Duplicate email:** create a user with an existing email → 409 immediately (checked before the slow password hash).
- **Delete cascade:** delete a user in the admin panel; their notes and posts are removed in the same transaction.

If `npm run seed:demo` fails with `querySrv ECONNREFUSED`, your local DNS refuses SRV lookups; switch DNS (e.g. 8.8.8.8) or use another network.

## Notes

- Login takes ~0.5 s locally and ~2 s on a free Render instance: bcrypt runs at cost 12 on a very small CPU. The first request after idle is also slow (cold start).
