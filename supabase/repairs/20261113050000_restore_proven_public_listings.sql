-- Run only after 20261113050000_preserve_public_listing_on_maintenance.sql
-- is applied. This statement sets listed_publicly and no other column.
-- It matches event id and the homepage cover file, not the title.
--
-- c5304898-0304-4f78-83f3-5cf388f94d2f
--   Common Grounds at Charlie Foster's
--   cover 8fc26522-fbca-45dd-8d33-be0a547de0c9.png
-- dd5606ef-25a9-4375-9c9b-71d2c9287fb4
--   Beaver Moon Gratitude Gathering
--   cover bb7b13a5-0ce4-4e60-939a-1fa1eea8266e.png
-- 4ddc1132-0177-49e0-a7be-5ab27483e73d
--   Table Hop Game Night at Lipz Lounge
--   cover 5dd06c47-e123-4b73-83b1-c2dfbaabae88.png

select public.restore_proven_public_event_listings();
