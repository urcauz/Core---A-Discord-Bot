# DevOps Bot

Internal Discord DevOps bot built with Node.js, discord.js v14, MongoDB (Mongoose), and Express.

## Features

- Slash command task engine under `/task`
- Mongo-backed task persistence with manual auto-increment `taskId`
- Auto-created Discord task threads
- Centralized permission checks by role name
- Reusable action logging to `#server-logs`
- Render-compatible Express health endpoint at `/health`

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Update `.env` values.

4. Start:

```bash
npm start
```

## Render deploy

- Runtime: `Node`
- Build command: `npm install`
- Start command: `npm start`
- Add all `.env` variables from `.env.example`
- Ensure your bot is invited with `applications.commands` + bot permissions required by your server

## MongoDB Atlas

- Create a free/shared cluster
- Create database user with read/write access
- Add network access rule for Render outbound IPs or allow `0.0.0.0/0` if acceptable for your environment
- Use Atlas connection string in `MONGODB_URI`
