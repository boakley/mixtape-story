-- Apple's iTunes Search API returns a `previewUrl` for every song — a 30-second
-- .m4a sample, no auth required, playable inline. We store it at add-time and
-- use it as a placeholder Listen affordance while the song.link universal URL
-- is still being resolved (or in the rare case Odesli never resolves it).
alter table songs add column preview_url text;
