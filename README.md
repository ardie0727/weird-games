# Weird Games

Odd little browser games. The first one is **Query Arcade**: a fast, retro arcade for SQL and PySpark.

- `/` is the Weird Games hub.
- `/query-arcade` is Query Arcade (attract screen, 7 modes, high scores, player profile).

## Query Arcade in one minute

- Real SQL runs in your browser with [sql.js](https://sql.js.org) (SQLite compiled to WebAssembly).
- Answers are checked by **result**, not by text, so any correct query passes. Column names and
  column order are ignored; row order only matters when the question asks for it.
- Every day (midnight IST) a new synthetic mini-dataset is generated from one of six themes:
  retail orders, IPL innings, Mumbai locals, movies, food delivery and music streams.
  Everything is invented. No real company or employer data.
- PySpark is taught honestly: no Spark runs in the browser. PySpark answers (tile ordering,
  fill-in-the-blank, picking the right chain) go through a small DataFrame-to-SQL translator
  and are checked against the same result as the SQL.

### Modes

Blitz · Fix the Bug · Predict the Output · Pipeline Builder · Data Detective · SQL vs PySpark · 1v1 Race

### Fair leaderboards

1. `POST /api/qa/run/start` signs a token with the run's seed, mode, day and start time.
2. The browser plays the run and keeps an event log (answers, hints, skips, timestamps).
3. `POST /api/qa/run/submit` rebuilds the exact same questions from the signed seed, re-runs every
   answer with sql.js on the server, and recomputes the score with the same rules. The score the
   browser shows is never trusted. Tokens are single-use, runs expire after 20 minutes, answers
   can't claim more time than has passed, and impossibly fast answers are rejected.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # generates thousands of rounds and checks each is solvable
```

Without `DATABASE_URL` the game runs fully offline with a local (per-device) high score table.

To use the global leaderboard locally, put a Neon connection string in `.env.local`:

```
DATABASE_URL=postgres://...
```

Tables are created automatically on first use (`qa_players`, `qa_scores`, `qa_rooms`).

## Deploy (Vercel + Neon, free tiers)

1. Import this repo as a new Vercel project.
2. In the project, open **Storage**, choose **Create Database**, pick **Neon**, and select the
   Singapore region (`aws-ap-southeast-1`). Vercel adds `DATABASE_URL` to the project for you.
3. Redeploy. Optional: set `GAME_SECRET` to any long random string (otherwise one is derived
   from `DATABASE_URL`).

Never commit the connection string.
