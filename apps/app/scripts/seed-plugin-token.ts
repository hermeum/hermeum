import DatabaseClient from "better-sqlite3";

import { generatePluginToken, hashPluginToken } from "../src/server/libs/plugin-token";

// Seeds (or replaces) a per-agent plugin ingest token in the local SQLite
// database so the hermeum plugin's authenticated ingest can be exercised
// manually: normally the token is generated at agent-create time and never
// surfaces again (its raw value lives only in the agent's env), which makes
// a hand-run plugin client impossible to authenticate. This script mints a
// token straight into the app database and prints the raw value.
//
// Treat the output like any other credential — it authorizes ingest for the
// agent. Avoid pasting it into shared logs or persistent shell history
// (e.g. with HISTCONTROL=ignorespace, prefix the export with a space).
//
// Usage:
//   HERMEUM_DATABASE_URL=file:./sqlite.db pnpm exec tsx scripts/seed-plugin-token.ts <agentId>
//
// The agent id must exist in the Runtime the server sees (with
// HERMEUM_MOCK_RUNTIME=true, create the agent in the UI first and copy its
// id) — the token stamps ingested events with the agent id, and session
// reads are ownership-guarded through the runtime agent lookup.

const main = (): void => {
  const agentId = process.argv[2];
  if (!agentId) {
    console.error("Usage: tsx scripts/seed-plugin-token.ts <agentId>");
    process.exit(1);
  }

  const databaseUrl = process.env.HERMEUM_DATABASE_URL ?? "file:./sqlite.db";
  const dbPath = databaseUrl.replace(/^file:(\/\/)?/, "");
  const db = new DatabaseClient(dbPath);

  const token = generatePluginToken();
  db.prepare(
    `INSERT INTO agent_tokens (agent_id, token_hash, created_at, revoked_at)
     VALUES (?, ?, ?, NULL)
     ON CONFLICT(agent_id) DO UPDATE SET token_hash = excluded.token_hash, revoked_at = NULL`
  ).run(agentId, hashPluginToken(token), Date.now());

  db.close();
  console.info(`Token seeded for agent ${agentId}.`);
  console.info("Set it for the plugin client:");
  console.info(`  export HERMEUM_PLUGIN_TOKEN=${token}`);
};

main();
