# CampusAR

CampusAR is a student project for indoor campus navigation across floors. It uses a React/Vite frontend and an Express/Node.js backend with MongoDB Atlas and Mongoose.

## Features

- Demo login with Admin and User roles and protected application routes.
- Admin Map Editor for creating floors, uploading floor maps, and placing navigation, room, and stair nodes.
- Stair Part 1 / Part 2 nodes with named stair groups for identifying physical staircases.
- Bidirectional graph connections, including adjacent-floor stair connections validated by stair group and floor number.
- Dijkstra shortest-path navigation, with Admin Test Navigation and a separate User Navigation screen.
- Same-floor route lines on the floor map and multi-floor route instructions between floor maps.
- MongoDB storage for floors, nodes, and connections; uploaded map images are stored by the backend.

Authentication is a presentation-only browser demo using the accounts below. It is not production authentication.

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `admin_campusnav123` |
| User | `user` | `user@123nav` |

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite.

## Run the backend

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` to your MongoDB Atlas connection string.
3. Run:

```powershell
cd backend
npm install
npm start
```

The API listens on port 5000 by default. Its health endpoint is `http://localhost:5000/api/health`.

## Run the tests

The test suite is database-free: it never connects to MongoDB and never starts the server, so it can run without any setup.

```powershell
cd backend
npm test
```

`npm test` runs the Node.js built-in test runner (`node --test`) over:

- `services/dijkstra.test.js` — shortest-path behavior, edge traversal, and invalid weight handling.
- `services/validation.test.js` — building-connection fields, same-floor allow-list, skywalk cross-building rules, stair connection rules, and node schema validation.

The suite currently reports 27 passing tests. Test files use `node:test` and `node:assert/strict` only, with no test framework or extra dependency.

### Not covered by the suite

Because the suite is database-free, it does not exercise HTTP routes end to end. These paths are verified by inspection only and still need a database to run:

- Floor and building lookups against real documents (including missing-floor/missing-building paths).
- Connection persistence via `Connection.create` and the duplicate-edge `409` response.
- Full `GET /api/navigation/path` requests.

### Known limitations

- The duplicate-edge check is a non-atomic read-then-write; there is no unique index to prevent a race between concurrent requests.
- Floor deletion relies on a multi-document transaction and fails closed with `500` if the MongoDB deployment does not support transactions (for example, a standalone server).
- Floor deletion collects node IDs outside the transaction while deleting nodes inside it, so a node added mid-delete could leave an orphan connection.
