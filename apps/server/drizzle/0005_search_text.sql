ALTER TABLE "nodes" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Hand-written: fills search_text for items that existed before search, from each item's latest revision.
UPDATE "nodes" n SET "search_text" = n."uid" || E'\n' || r."name" || E'\n'
  || coalesce((SELECT string_agg(t #>> '{}', ' ') FROM jsonb_path_query(r."description", '$.**.text') t), '') || E'\n'
  || coalesce((SELECT string_agg(v, ' ') FROM jsonb_each_text(r."attributes") AS a(k, v)), '')
FROM "item_revisions" r
WHERE n."kind" = 'item' AND r."item_id" = n."id"
  AND r."number" = (SELECT max("number") FROM "item_revisions" WHERE "item_id" = n."id");
