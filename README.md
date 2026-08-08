# Equity Arena — Real-Time Stock Exchange

Equity Arena is a full-stack real-time stock exchange application restructured into independent top-level `/backend` and `/frontend` parent directories for instant deployment to Render (Backend) and Vercel (Frontend).

## Repository Structure

```text
/
├── backend/          # Node.js, Express, Prisma ORM, Socket.io (Deploy to Render)
├── frontend/         # Vite + React + Tailwind CSS (Deploy to Vercel)
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Backend Setup
```bash
cd backend
npm install
npm run dev           # Runs server on http://localhost:5001
```

**No database install required.** On boot the backend checks the host/port in
`DATABASE_URL` and:

- **Nothing listening there** → starts its own PostgreSQL (bundled via
  `embedded-postgres`, cluster kept in `backend/.pgdata`), then creates the
  tables and seeds the exchange. First run takes a few extra seconds.
- **Something already listening** (Docker, Homebrew, your own server) → uses it
  untouched, and creates the tables / seeds only if that database is still empty.
- **A remote `DATABASE_URL`** → never modified at boot; manage its schema with
  `npm run prisma:deploy` as part of your deploy.

Nothing here is destructive — restarting the server never re-seeds or wipes data.
To deliberately reset the local board:

```bash
npx prisma db push --force-reset && npx prisma db seed
```

Seeded logins: `admin@test.com` / `admin123` and `seed_trader@test.com` / `trader123`.

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev           # Runs Vite dev server on http://localhost:5173
```

---

## 🌐 Deployment Guide

### Backend Deployment (Render)
1. Push repository to GitHub.
2. Create a new **Web Service** on [Render](https://render.com) pointing to the `/backend` directory.
3. Configure Environment Variables in Render:
   - `PORT` (assigned automatically)
   - `DATABASE_URL` (Render PostgreSQL URL)
   - `JWT_SECRET` (Secure secret string)
   - `CLIENT_URL` (Your Vercel frontend URL, e.g., `https://equity-arena.vercel.app`)
4. Build & Start Commands:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`

### Frontend Deployment (Vercel)
1. Create a new project on [Vercel](https://vercel.com) pointing to the `/frontend` directory.
2. Configure Environment Variable:
   - `VITE_API_URL`: Your Render backend deployment URL (e.g., `https://equity-arena-backend.onrender.com`)
3. Framework Preset: **Vite** (Build command: `npm run build`, Output directory: `dist`).
