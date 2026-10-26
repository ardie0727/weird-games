import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;
let ready: Promise<void> | null = null;

/** Neon client, or null when DATABASE_URL isn't set (the game then uses local leaderboards). */
export function getDb(): Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!client) client = neon(url);
  return client;
}

/** Create tables on first use, so a fresh Neon database needs no manual migration. */
export function ensureSchema(sql: Sql): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS qa_players (
        id uuid PRIMARY KEY,
        name text NOT NULL,
        last_day date,
        streak int NOT NULL DEFAULT 0,
        best_streak int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS qa_scores (
        id bigserial PRIMARY KEY,
        run_nonce text NOT NULL UNIQUE,
        player_id uuid NOT NULL,
        player_name text NOT NULL,
        mode text NOT NULL,
        score int NOT NULL CHECK (score >= 0),
        time_ms int NOT NULL,
        correct int NOT NULL DEFAULT 0,
        streak int NOT NULL DEFAULT 0,
        day date NOT NULL,
        dataset text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      // Daily and weekly boards filter on (mode, day); all-time sorts on (mode, score).
      await sql`CREATE INDEX IF NOT EXISTS qa_scores_mode_day_score ON qa_scores (mode, day, score DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS qa_scores_mode_score ON qa_scores (mode, score DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS qa_scores_player ON qa_scores (player_id, day)`;
      await sql`CREATE TABLE IF NOT EXISTS qa_rooms (
        code text PRIMARY KEY,
        seed int NOT NULL,
        day date NOT NULL,
        host_id uuid NOT NULL,
        host_name text NOT NULL,
        guest_id uuid,
        guest_name text,
        started_at timestamptz,
        wins jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS qa_rooms_created ON qa_rooms (created_at)`;
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
}
