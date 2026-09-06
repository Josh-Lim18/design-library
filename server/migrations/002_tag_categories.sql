-- A coarse subcategory for each tag ("typography", "color", …) so the library
-- can group tags. NULL means uncategorised (all manually-typed tags start here).
ALTER TABLE tags ADD COLUMN category TEXT;
