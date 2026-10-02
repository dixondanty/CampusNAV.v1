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
| Admin | `admin` | `admin123` |
| User | `user` | `user123` |

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
