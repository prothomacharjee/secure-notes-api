# Secure Notes API

REST API for a note-taking app with JWT auth and role-based access (user / admin).
Node 20+, Express 5, MongoDB + Mongoose, bcrypt password hashing.

## Run locally

```bash
npm install
cp .env.example .env      # fill MONGODB_URI and JWT_SECRET
npm run seed:admin        # creates/updates the admin from ADMIN_* vars
npm run dev               # http://localhost:4000/api/health
npm test                  # in-memory MongoDB, no setup needed
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
| GET | /api/users/interests | user | Users grouped by interest — single `aggregate()`; optional `?interest=chess` |
| GET | /api/admin/users | admin | List users |
| GET | /api/admin/users/:id | admin | User profile |
| POST | /api/admin/users | admin | `{ name, email, password, role, interests[] }` |
| PATCH | /api/admin/users/:id | admin | Any of the above fields |
| DELETE | /api/admin/users/:id | admin | Also deletes that user's notes and posts |
| GET | /api/admin/notes | admin | Everyone's notes; optional `?owner=<userId>` |

## Indexes

Defined with `schema.index` in `src/models`. Only these exist besides the default `_id`:

| Collection | Index | Serves |
|---|---|---|
| users | `{ email: 1 }` unique | login lookup, duplicate-email guard |
| users | `{ interests: 1 }` | `?interest=` filter in the group-by-interests pipeline |
| notes | `{ owner: 1, _id: -1 }` | own-notes list (filter + sort, no in-memory sort), owner-scoped get/update/delete, admin `?owner=`, cascade delete |
| posts | `{ author: 1, _id: -1 }` | `$lookup` from users → posts, sorted + paginated inside the sub-pipeline |

Admin "list users", admin "list all notes" and every get-by-id use the built-in `_id` index, because lists are sorted by `_id` (an ObjectId starts with its creation time, so `_id` order is creation order).
