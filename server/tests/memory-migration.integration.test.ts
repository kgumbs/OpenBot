import { afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
const database = createDatabase(testDatabaseUrl(), TEST_POOL);
afterAll(() => database.$client.end());
test("memory scope migration preserves legacy records and forgotten facts while permitting independent Bot facts", async () => {
  const name = `migration_${randomUUID().replaceAll("-", "")}`;
  try {
    await database.transaction(async (transaction) => {
      await transaction.execute(sql.raw(`CREATE SCHEMA "${name}"`));
      await transaction.execute(sql.raw(`SET LOCAL search_path TO "${name}"`));
      await transaction.execute(
        sql.raw(
          "CREATE TABLE personal_memories (id text primary key, owner_user_id text, formed_by_agent_id text, formed_by text, import_digest text, source_ref text, content text, deleted_at timestamptz)",
        ),
      );
      await transaction.execute(
        sql.raw(
          "CREATE UNIQUE INDEX personal_memories_formed_digest_idx ON personal_memories (owner_user_id, import_digest) WHERE formed_by = 'bot'",
        ),
      );
      await transaction.execute(
        sql.raw(
          "INSERT INTO personal_memories VALUES ('legacy', 'owner', 'bot-a', 'bot', 'same-content', NULL, 'Legacy fact', NULL), ('forgotten', 'owner', 'bot-a', 'bot', 'forgotten-content', 'drive/read', '', '2026-01-01')",
        ),
      );
      const before = await transaction.execute(
        sql.raw("SELECT * FROM personal_memories ORDER BY id"),
      );
      const migration = await readFile(
        new URL("../drizzle/0053_bot_memory_scope.sql", import.meta.url),
        "utf8",
      );
      for (const statement of migration.split("--> statement-breakpoint"))
        await transaction.execute(sql.raw(statement));
      expect([
        ...(await transaction.execute(
          sql.raw("SELECT * FROM personal_memories ORDER BY id"),
        )),
      ]).toEqual([...before]);
      await transaction.execute(
        sql.raw(
          "INSERT INTO personal_memories VALUES ('independent', 'owner', 'bot-b', 'bot', 'same-content', 'conversation', 'Legacy fact', NULL)",
        ),
      );
      expect([
        ...(await transaction.execute(
          sql.raw("SELECT id FROM personal_memories"),
        )),
      ]).toHaveLength(3);
    });
  } finally {
    await database.execute(sql.raw(`DROP SCHEMA IF EXISTS "${name}" CASCADE`));
  }
});
