# CampusAR

A small React and Express starter for the CampusAR college presentation project.

## Run the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. The presentation login uses demo-only accounts:

- Admin: `admin` / `admin123`
- User: `user` / `user123`

The admin account opens the floor map editor. The user page is a placeholder, and the browser-only demo login is not production authentication.

## Run the backend

1. Copy `backend/.env.example` to `backend/.env`.
2. Replace the example value with your MongoDB Atlas connection string:
   `MONGODB_URI=your_mongodb_atlas_connection_string`
3. In a terminal, run:

```powershell
cd backend
npm install
npm start
```

The API listens on port 5000 by default and reports whether MongoDB connected. Its health endpoint is `http://localhost:5000/api/health`.

Basic API routes are available for floors, nodes, and connections. Floor maps selected in the admin editor are uploaded to `backend/uploads` and served from `/uploads`; the database stores the resulting path in `mapImage`. The editor accepts image files up to 5 MB. JSON floor creation without a file is also supported by the API.

The admin floor editor can delete floors and place/delete navigation, room, and stair nodes. These use the shared Node model; rooms are stored with type `room` and their entered name, while stairs use type `stair` with `stairPart` set to `1` or `2`. Stair parts are restricted by the lowest and highest floor numbers. Node `x` and `y` values are percentages of the displayed map, so markers keep their relative positions when the map is resized or reloaded.

The editor can also create bidirectional connections between navigation nodes, between rooms and navigation nodes, and between navigation nodes and stairs. A room must connect through a navigation node before reaching a stair. Same-floor connections are displayed as map lines; stair Part 2 can connect to Part 1 on the immediately higher floor. Each pair is stored once with a distance calculated from the nodes' percentage coordinates. Connections can be listed by floor and deleted through `GET /api/connections/:floorId`, `POST /api/connections`, and `DELETE /api/connections/:id`. Deleting a node also deletes its attached connections.

The backend provides a reusable weighted Dijkstra service and `GET /api/navigation/path?start=<nodeId>&end=<nodeId>`. It treats each connection as an undirected edge and searches the complete graph, including cross-floor stair links. The endpoint returns `success`, `found`, the ordered `path`, and total `distance`; it does not add navigation UI.

Admins can use the Map Editor's Test tool to select a start and destination, call this API, and preview the returned path. Same-floor route edges are drawn over the current map; cross-floor transitions are listed separately, and Clear Route removes only the temporary preview.

## Next implementation steps

- Connect real login to the backend and enforce admin/user roles.
- Add the user navigation interface.
