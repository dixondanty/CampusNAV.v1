# CampusNAV – Campus Navigation

CampusNAV is a public indoor campus navigation website and installable offline-first PWA. It uses a React/Vite frontend and an Express/Node.js backend with MongoDB Atlas and Mongoose.

## Features

- Public User Mode with no login or registration requirement.
- Separate Google Identity Services login for the single configured CampusNAV Admin.
- Admin Map Editor for creating floors, uploading floor maps, and placing navigation, room, and stair nodes.
- Stair Part 1 / Part 2 nodes with named stair groups for identifying physical staircases.
- Bidirectional graph connections, including adjacent-floor stair connections validated by stair group and floor number.
- Dijkstra shortest-path navigation, with Admin Test Navigation and a separate User Navigation screen.
- Same-floor route lines on the floor map and multi-floor route instructions between floor maps.
- MongoDB storage for floors, nodes, and connections; uploaded map images are stored by the backend.

The public website opens directly to User Mode. Admin access is available only
from the separate Admin Login page and requires a server-verified Google
Workspace ID token plus an active HttpOnly session cookie. Admin write APIs are
protected by the backend; campus navigation and read-only campus data remain
public.

## Run the frontend

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite.

## Run the backend

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` to your MongoDB Atlas connection string.
3. Set `GOOGLE_CLIENT_ID` to the Google OAuth Web Client ID and `ADMIN_EMAIL`
   to the one approved `@rajagiri.edu.in` account.
4. Set `FRONTEND_ORIGIN` to the exact local frontend origin
   (`http://localhost:5173` by default).
5. Optionally set `UPLOAD_DIR` to change where uploaded floor images are stored.
4. Run:

```powershell
cd backend
npm install
npm start
```

The API listens on port 5000 by default. Its health endpoint is `http://localhost:5000/api/health`.

### Google Admin authentication deployment

The backend verifies Google ID tokens with `google-auth-library`; it does not
use a Google Client Secret or request Gmail/Drive permissions. The configured
email must be the one approved, verified `@rajagiri.edu.in` account. The
backend also requires Google's signed `hd` claim to match the Workspace domain.

Configure these values without committing them:

| Platform | Variable | Value |
| --- | --- | --- |
| Vercel | `VITE_GOOGLE_CLIENT_ID` | Google OAuth Web Client ID |
| Vercel | `CAMPUSNAV_BACKEND_ORIGIN` | HTTPS origin of the Render API service, with no path or trailing slash |
| Vercel | `VITE_API_URL` | Leave unset so browser requests use the same-origin Vercel proxy |
| Render | `GOOGLE_CLIENT_ID` | The same Web Client ID used by Vercel |
| Render | `ADMIN_EMAIL` | The one approved Admin email; must end in `@rajagiri.edu.in` |
| Render | `FRONTEND_ORIGIN` | Exact public Vercel website origin, e.g. its configured HTTPS origin |

`frontend/vercel.json` forwards `/api/*` and legacy `/uploads/*` through
Vercel to `CAMPUSNAV_BACKEND_ORIGIN`. This gives the browser a same-origin
session cookie (`HttpOnly`, `Secure` in production, `SameSite=Lax`) instead of
relying on third-party cookies between Vercel and Render. In local development,
the frontend calls `http://localhost:5000` directly and the backend allows the
configured `FRONTEND_ORIGIN`.
`FRONTEND_ORIGIN` accepts a comma-separated allowlist when specific Vercel
preview origins also need access; avoid broad wildcard origins.

In Google Cloud, create a **Web application** OAuth client, add the exact
website and local development origins to its authorized JavaScript origins,
and configure the Rajagiri Workspace domain. Set its Client ID in both
frontend and backend environments. No OAuth Client Secret or redirect URI is
needed for the GIS ID-token button. Actual Vercel/Render deployment origins
and Google credentials are not present in this repository and must be supplied
in the hosting dashboards before production authentication can be verified.

The installed PWA opens directly to User Mode and does not register Admin
routes or show an Admin Login entry. Admin pages are lazy-loaded and omitted
from the service worker's offline app-shell cache; the backend still enforces
Admin authentication for every data mutation.

### Persistent map-image storage

New floor-map uploads use MongoDB GridFS so they survive Render restarts and
redeployments independently of the Render filesystem. Configure this backend
environment variable in Render:

```text
GRIDFS_BUCKET_NAME=floorMaps
```

New images are stored in the MongoDB GridFS bucket as their original bytes.
MongoDB stores the GridFS file ID in `Floor.mapImageFileId`, while the existing
`mapImage` field contains the stable API path used by the frontend.
The backend streams GridFS images from `GET /api/floors/:floorId/image` with
their stored MIME type and `Cache-Control: no-store`, so replacement images are
not hidden behind a stale browser cache.

Legacy `/uploads/...` records remain supported by the backend filesystem route.
They should be replaced through the Admin image-replacement action when their
files are missing. The replacement preserves the floor ID, nodes, connections,
cabins, and coordinates. GridFS uploads do not depend on `UPLOAD_DIR`.
Replaced or deleted GridFS images are retained and logged as
`gridfs-orphan-candidate` records for deferred cleanup. This conservative
policy avoids deleting a file that may still be referenced by another Floor
during concurrent requests; cleanup should be performed only after an
independent reference audit.

## Run the tests

The test suite is database-free: it never connects to MongoDB and never starts the server, so it can run without any setup.

```powershell
cd backend
npm test
```

`npm test` runs the Node.js built-in test runner (`node --test`) over:

- `services/dijkstra.test.js` — shortest-path behavior, edge traversal, and invalid weight handling.
- `services/validation.test.js` — building-connection fields, same-floor allow-list, skywalk cross-building rules, stair connection rules, and node schema validation.
- `routes/floors.integration.test.js` — HTTP/GridFS upload, retrieval, replacement, missing-image, shared-reference, cache, and concurrency checks.

The HTTP/GridFS tests are skipped unless `TEST_MONGODB_URI` is explicitly set
to a MongoDB URI whose database name contains `test`. They drop only that
test database during setup and teardown; never point this variable at a
production database.

The suite currently reports 34 passing tests. Test files use `node:test` and `node:assert/strict` only, with no test framework or extra dependency.

### Not covered by the suite

Because the suite is database-free, it does not exercise HTTP routes end to end. These paths are verified by inspection only and still need a database to run:

- Floor and building lookups against real documents (including missing-floor/missing-building paths).
- Connection persistence via `Connection.create` and the duplicate-edge `409` response.
- Full `GET /api/navigation/path` requests.

### Known limitations

- The duplicate-edge check is a non-atomic read-then-write; there is no unique index to prevent a race between concurrent requests.
- Floor deletion relies on a multi-document transaction and fails closed with `500` if the MongoDB deployment does not support transactions (for example, a standalone server).
- Floor deletion collects node IDs outside the transaction while deleting nodes inside it, so a node added mid-delete could leave an orphan connection.
