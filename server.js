require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ogs = require('open-graph-scraper');
const sharp = require('sharp');

const { supabase } = require('./lib/supabase');
const { notifyGoogleIndexing, notifyBulkIndexing } = require('./indexingService');
const { deleteFromFacebook, deleteFromX, categorizeProduct, generateSEOData } = require('./socialMedia');
const categoryMapper = require('./js/categories');

// Routes
const { router: authRouter, requireAuth } = require('./routes/auth');
const productsRouter = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Debug Log Middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: ['https://chob-shop.vercel.app', 'https://chobshop-production.up.railway.app', 'http://localhost:3000', 'https://chob.shop'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static Files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/about.html', (req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'assets')));

// Mount API Routes
app.use('/api', authRouter);
app.use('/api/products', productsRouter);

// GET category counts
app.get('/api/categories/count', async (req, res) => {
  try {
    const { data: allCategories, error } = await supabase.from('products').select('category');
    if (error) throw error;

    const { count: trueTotal } = await supabase.from('products').select('*', { count: 'exact', head: true });
    const counts = { all: trueTotal || allCategories.length };

    allCategories.forEach(item => {
      const cat = item.category || 'ทั่วไป';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    res.json(counts);
  } catch (err) {
    console.error('Failed to count categories:', err);
    res.status(500).json({ error: 'Failed to count categories' });
  }
});

// --- Sitemap ---
app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    const { data: products, error: pError } = await supabase
      .from('products')
      .select('id, category, date')
      .order('date', { ascending: false });

    if (pError) throw pError;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    categories.forEach(cat => {
      xml += `
  <url>
    <loc>${siteUrl}/?category=${encodeURIComponent(cat)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    products.forEach(p => {
      const pDate = p.date ? new Date(p.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      xml += `
  <url>
    <loc>${siteUrl}/?productId=${p.id}</loc>
    <lastmod>${pDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    xml += `\n</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('Failed to generate sitemap:', err);
    res.status(500).send('Error generating sitemap');
  }
});

// --- Other API Endpoints ---

// Link Scraper
app.post('/api/scrape-link', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const options = { url, fetchOptions: { headers: { 'user-agent': 'facebookexternalhit/1.1' } } };
    const { result } = await ogs(options);
    const title = result.ogTitle || '';
    let image = '';
    if (result.ogImage && result.ogImage.length > 0) image = result.ogImage[0].url;
    else if (result.ogImage && typeof result.ogImage === 'string') image = result.ogImage;
    res.json({ success: true, title, image });
  } catch (err) {
    res.status(500).json({ error: 'Failed to scrape link', detail: err.message });
  }
});

// Settings (Non-sensitive)
app.get('/api/theme', (req, res) => {
  res.json({
    CARD_THEME: process.env.CARD_THEME || 'theme-white',
    STATS_THEME: process.env.STATS_THEME || 'stats-premium'
  });
});

// GET current settings (masked)
app.get('/api/settings', requireAuth, (req, res) => {
  const mask = (val) => {
    if (!val) return '';
    if (val.length <= 10) return '***';
    return val.substring(0, 6) + '...' + val.substring(val.length - 6);
  };
  res.json({
    FB_PAGE_ACCESS_TOKEN: mask(process.env.FB_PAGE_ACCESS_TOKEN),
    THREADS_USER_ID: process.env.THREADS_USER_ID || '',
    THREADS_ACCESS_TOKEN: mask(process.env.THREADS_ACCESS_TOKEN),
    GEMINI_API_KEY: mask(process.env.GEMINI_API_KEY),
    SUPABASE_URL: mask(process.env.SUPABASE_URL),
    SUPABASE_KEY: mask(process.env.SUPABASE_KEY),
    CARD_THEME: process.env.CARD_THEME || 'theme-white',
    STATS_THEME: process.env.STATS_THEME || 'stats-premium'
  });
});

// PUT update settings (writes to .env and hot-reloads)
app.put('/api/settings', requireAuth, (req, res) => {
  try {
    const allowedKeys = ['FB_PAGE_ACCESS_TOKEN', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'CARD_THEME', 'STATS_THEME'];
    const updates = req.body;

    const envPath = path.join(__dirname, '.env');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    let updatedCount = 0;
    for (const key of allowedKeys) {
      if (updates[key] !== undefined && updates[key] !== '') {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${updates[key]}`);
        } else {
          envContent += `\n${key}=${updates[key]}`;
        }
        process.env[key] = updates[key];
        updatedCount++;
      }
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');
    res.json({ success: true, updatedCount });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings', detail: err.message });
  }
});

// --- POST categorize via AI ---
app.post('/api/categorize', requireAuth, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const category = await categorizeProduct(title);
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- POST generate SEO content via AI (Unsaved) ---
app.post('/api/ai/seo', requireAuth, async (req, res) => {
  const { title, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const seoData = await generateSEOData({ title, category });
    res.json({ success: true, seo_keywords: seoData.keywords, seo_description: seoData.description, seo_title: seoData.seo_title });
  } catch (err) {
    console.error('AI SEO Gen Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Image Proxy
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'URL parameter required' });

    const response = await fetch(imageUrl, { headers: { 'User-Agent': 'ChobShop-ImageProxy/1.0' } });
    if (!response.ok) return res.status(502).json({ error: `Failed to fetch image` });

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const webpBuffer = await sharp(imageBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.send(webpBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Image proxy failed' });
  }
});

// Health Check
app.get('/api/health', async (req, res) => {
  let supabaseValid = false;
  if (supabase) {
    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      if (!error) supabaseValid = true;
    } catch (err) { }
  }
  res.json({ status: 'ok', supabase: !!supabase, supabaseValid, timestamp: new Date().toISOString() });
});

// Catch-all for 404
app.use((req, res) => {
  console.log(`❌ [404] Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Not Found', path: req.url });
});

// Export for Vercel Serverless Function
module.exports = app;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛍️  Chob.Shop server running at http://0.0.0.0:${PORT}`);
    if (supabase) console.log(`✅  Supabase connected`);
  });
}
