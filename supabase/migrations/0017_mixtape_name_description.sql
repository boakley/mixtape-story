-- Phase 4: mixtape name + description columns.
--
-- A creator can rename their mixtape and add a one-line description,
-- just like a group. Two design choices worth noting:
--
-- 1. `name` is nullable. When null, the read path falls back to
--    "{display_name}'s mixtape" — so every existing row keeps its
--    current title without a backfill, and the title reactively
--    follows display-name changes if the creator updates that. The
--    name only gets a real value once the creator explicitly edits it.
--
-- 2. `description` is NOT NULL DEFAULT ''. The editor never has to
--    handle null branches; empty string is the natural "no
--    description set yet" state.
--
-- Length caps (100 for name, 500 for description) live in the server
-- actions, not in the DB schema — mirrors how groups.name and
-- groups.description are handled.

alter table mixtapes add column name text;
alter table mixtapes add column description text not null default '';
