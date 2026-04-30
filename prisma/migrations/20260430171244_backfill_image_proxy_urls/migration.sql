-- Backfill: replace stale raw S3 URLs with /api/images/<key> proxy paths.
--
-- Direct S3 URLs (https://<bucket>.s3.<region>.amazonaws.com/<key>) 403 in
-- the browser because the uploads bucket is locked down. The new proxy
-- route at /api/images/[...key] serves these via the task role with
-- per-prefix auth gating. Any row whose `url` already points at the
-- proxy is left alone (idempotent). Rows whose `url` is a Clerk image,
-- a tastegraph asset, or any other origin we don't proxy are also left
-- alone — only S3 URLs need rewriting.

UPDATE inspiration_photos
SET url = '/api/images/' || s3_key
WHERE url LIKE 'https://%.s3.%amazonaws.com/%';

UPDATE board_photos
SET url = '/api/images/' || s3_key
WHERE url LIKE 'https://%.s3.%amazonaws.com/%';

UPDATE closet_items
SET url = '/api/images/' || s3_key
WHERE url LIKE 'https://%.s3.%amazonaws.com/%';

-- avatars: only rewrite if avatarUrl already points at our S3 (i.e. user
-- uploaded a custom avatar). Clerk-sourced URLs (img.clerk.com / *.clerk.dev)
-- are untouched.
UPDATE users
SET avatar_url = '/api/images/' || regexp_replace(
  avatar_url,
  '^https://[^/]+\.s3\.[^/]+amazonaws\.com/',
  ''
)
WHERE avatar_url LIKE 'https://%.s3.%amazonaws.com/%';
