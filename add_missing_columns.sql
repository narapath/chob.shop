--- SQL migration to add missing columns to the products table
--- Run this in your Supabase SQL Editor

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rating_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0;

--- Refresh PostgREST schema cache (optional, Supabase usually does this automatically)
NOTIFY pgrst, 'reload schema';
