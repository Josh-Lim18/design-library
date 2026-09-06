-- One broad style bucket per reference ("minimal", "editorial", "cinematic", …),
-- for the aesthetic filter strip. NULL until an image is analyzed.
ALTER TABLE items ADD COLUMN style TEXT;
