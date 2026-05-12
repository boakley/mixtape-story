-- Cap story length at 10,000 characters. Stories are prose-shaped musings
-- on a single song — a few paragraphs at most. The cap prevents a signed-in
-- user from filling the database with megabyte-sized rows (RLS confines
-- abuse to their own rows, but DB bloat is still possible from a single
-- bad actor).
--
-- 10,000 chars ≈ 1,500–2,000 words ≈ 4–6 pages double-spaced. Plenty of room
-- for the writing group's contemplative essays without inviting trouble.

alter table stories
  add constraint stories_text_length_check
  check (length(text) <= 10000);
