-- What kind of screen each reference shows ("landing", "hero", "body", …), so
-- the library can be filtered by section. NULL until an image is analyzed.
ALTER TABLE items ADD COLUMN section TEXT;
