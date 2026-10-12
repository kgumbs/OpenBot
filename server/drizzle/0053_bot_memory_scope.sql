-- Keep every existing fact and deletion tombstone. Observations without a source reference
-- remain visible to their owner for review, but are excluded from automatic recall by the API.
-- Their origins cannot safely be inferred from a model-supplied app label.
DROP INDEX "personal_memories_formed_digest_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_memories_formed_digest_idx" ON "personal_memories" USING btree ("owner_user_id", "formed_by_agent_id", "import_digest") WHERE "formed_by" = 'bot';
