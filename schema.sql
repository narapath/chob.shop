-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price NUMERIC DEFAULT 0,
  original_price NUMERIC,
  discount INTEGER,
  image TEXT,
  affiliate_url TEXT,
  category TEXT DEFAULT 'ทั่วไป',
  description TEXT,
  clicks INTEGER DEFAULT 0,
  date TIMESTAMPTZ DEFAULT NOW(),
  facebook_post_id TEXT,
  twitter_post_id TEXT,
  seo_keywords JSONB DEFAULT '[]',
  seo_description TEXT,
  seo_title TEXT,
  commission NUMERIC DEFAULT 0
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Allow public read access" ON products
  FOR SELECT USING (true);

-- Create policy to allow service role full access (default, but good to ensure)
CREATE POLICY "Allow all for service role" ON products
  FOR ALL TO service_role USING (true) WITH CHECK (true);
