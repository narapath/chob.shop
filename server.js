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
const { deleteFromFacebook, deleteFromX } = require('./socialMedia');
const categoryMapper = require('./js/categories');

// Routes
const { router: authRouter } = require('./routes/auth');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛍️  Chob.Shop server running at http://0.0.0.0:${PORT}`);
  if (supabase) console.log(`✅  Supabase connected`);
});
