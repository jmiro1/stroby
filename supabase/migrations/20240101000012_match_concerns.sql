-- Add concerns and niche distance to introductions for better analytics
ALTER TABLE introductions ADD COLUMN match_concerns TEXT;
ALTER TABLE introductions ADD COLUMN niche_distance INTEGER; -- 0 = exact, 1+ = related
