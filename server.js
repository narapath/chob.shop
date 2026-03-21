require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const ogs = require('open-graph-scraper');
const sharp = require('sharp');
const { notifyGoogleIndexing, notifyBulkIndexing } = require('./indexingService');
const {
  postToFacebook, postToInstagram, postToX, postToThreads,
  deleteFromFacebook, deleteFromX, generateAICaption, categorizeProduct,
  generateSEOData
} = require('./socialMedia');
const categoryMapper = require('./js/categories');
const { ai, recordPrediction, recordCorrection, getKeywordWeight, extractKeywords } = require('./js/selfEvolvingAI');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for secure cookies/headers behind reverse proxy (DirectAdmin)
app.set('trust proxy', 1);

// Debug Log Middleware
app.use((req, res, next) => {
  console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// --- Initialize Supabase ---
const EMBEDDED_SUPABASE_URL = 'https://zcplipytalprkniwxurs.supabase.co';
const EMBEDDED_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjcGxpcHl0YWxwcmtuaXd4dXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc2NjMsImV4cCI6MjA4ODU2MzY2M30.P2leswWIjMGkxpobp-9aUbYlvRxBcWIDJGPciDF6mF4';

let supabaseUrl = process.env.SUPABASE_URL || EMBEDDED_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_KEY || EMBEDDED_SUPABASE_KEY;
let supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// --- Security Middleware ---
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));

app.use(cors({
  origin: ['https://chob-shop.vercel.app', 'https://chobshop-production.up.railway.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'vibe_secret_token_12345';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/about.html', (req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'assets'))); // Alias for safety

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${AUTH_TOKEN}`) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// --- API Routes ---

app.post('/api/login', apiLimiter, (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: AUTH_TOKEN });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// GET all products (Support Pagination via Supabase)
app.get('/api/products', async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Supabase is not configured yet. Please update settings in Admin Panel.' });
    const { page, limit, category, search } = req.query;
    console.log(`🔍 Fetching products: Page=${page}, Limit=${limit}, Category=${category}, Search=${search}`);
    let query = supabase.from('products').select('*', { count: 'exact' }).order('date', { ascending: false });

    if (category && category !== 'all' && category !== 'ทั้งหมด') {
      console.log(`   Filtering by category: ${category}`);
      query = query.eq('category', category);
    }

    if (search) {
      console.log(`   Filtering by search: ${search}`);
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum - 1;

      query = query.range(startIndex, endIndex);

      console.log(`   Executing Supabase query...`);
      const { data, error, count } = await query;
      console.log(`   Supabase response received. Success: ${!error}`);
      if (error) throw error;

      return res.json({
        products: data,
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil((count || 0) / limitNum)
      });
    }

    // Unpaginated response (fallback for admin panel or no pagination request)
    // Fetch all items in chunks to bypass the 1000-row limit in Supabase
    
    // First, just execute the query to get the total count
    const { count: totalCount, error: countError } = await query.limit(1);
    if (countError) throw countError;

    if (!totalCount || totalCount === 0) {
      return res.json({ products: [], total: 0 });
    }

    let allData = [];
    let from = 0;
    const chunkSize = 800;
    
    // Loop to fetch all chunks
    while (true) {
      // Re-create the base query for each chunk to avoid state mutation issues
      let chunkQuery = supabase
        .from('products')
        .select('*');

      if (category && category !== 'all' && category !== 'ทั้งหมด') {
        chunkQuery = chunkQuery.eq('category', category);
      }
      if (search) {
        chunkQuery = chunkQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
      }

      // Supabase range is inclusive: range(0, 799) fetches 800 items
      const { data: chunk, error: chunkError } = await chunkQuery
        .order('date', { ascending: false })
        .range(from, from + chunkSize - 1);
        
      if (chunkError) throw chunkError;
      
      if (!chunk || chunk.length === 0) break;
      
      allData = allData.concat(chunk);
      
      if (chunk.length < chunkSize) break;
      from += chunkSize;
    }

    res.json({ products: allData, total: totalCount || allData.length });

  } catch (err) {
    console.error('Failed to read products from Supabase:', err);
    res.status(500).json({ error: 'Failed to read products', detail: err.message });
  }
});

// Cache object
let cachedCategoryCounts = null;
let lastCategoryCountTime = 0;
const CATEGORY_CACHE_TTL = 60 * 1000; // 1 minute TTL

// GET category counts
app.get('/api/categories/count', async (req, res) => {
  try {
    if (!supabase) return res.json({}); // Silently return empty object if no DB

    const now = Date.now();
    if (cachedCategoryCounts && (now - lastCategoryCountTime) < CATEGORY_CACHE_TTL) {
      return res.json(cachedCategoryCounts);
    }

    // Get distinct categories and their counts
    // For large datasets, we can use a simpler approach if needed
    // But for 1000+ we can fetch all categories (just one column)
    const { data, error } = await supabase.from('products').select('category');
    if (error) throw error;

    // Get true total count separately to be safe
    const { count: trueTotal } = await supabase.from('products').select('*', { count: 'exact', head: true });

    const counts = { all: trueTotal || data.length };

    data.forEach(item => {
      const cat = item.category || 'ทั่วไป';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    cachedCategoryCounts = counts;
    lastCategoryCountTime = now;
    res.json(counts);
  } catch (err) {
    console.error('Failed to count categories:', err);
    res.status(500).json({ error: 'Failed to count categories' });
  }
});

// --- Dynamic Sitemap.xml ---
app.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = 'https://chob.shop';
    
    // 1. Fetch all products and categories
    const { data: products, error: pError } = await supabase
      .from('products')
      .select('id, category, date')
      .order('date', { ascending: false });
    
    if (pError) throw pError;

    // 2. Generate XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Home Page -->
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

    // 3. Add Categories
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    categories.forEach(cat => {
      xml += `
  <url>
    <loc>${siteUrl}/?category=${encodeURIComponent(cat)}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // 4. Add Individual Products (Direct ID links for AI/Search context)
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

// POST a new product
app.post('/api/products', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const date = new Date().toISOString();

    const newProduct = {
      id,
      title: req.body.title || 'Untitled Product',
      price: req.body.price || '0',
      originalPrice: req.body.originalPrice || '',
      discount: req.body.discount || '',
      image: req.body.image || '',
      affiliateUrl: req.body.affiliateUrl || '',
      category: req.body.category || 'ทั่วไป',
      description: req.body.description || '',
      clicks: 0,
      date,
      facebookPostId: '',
      twitterPostId: '',
      seo_keywords: [],
      seo_description: '',
      seo_title: req.body.seo_title || '',
      commission: req.body.commission || 0
    };

    if (req.body.toggleAI) {
      try {
        const seoData = await generateSEOData(newProduct);
        newProduct.seo_keywords = seoData.keywords;
        newProduct.seo_description = seoData.description;
        newProduct.seo_title = seoData.title;
      } catch (err) {
        console.error('AI SEO generation failed for single product:', err);
      }
    }

    const { error } = await supabase.from('products').insert([newProduct]);
    if (error) throw error;

    // 🔔 Fire-and-forget: Notify Google to index the new product URL
    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    const productUrl = `${siteUrl}/?productId=${newProduct.id}`;
    notifyGoogleIndexing(productUrl).catch(e => console.error('Indexing notify error:', e.message));

    res.json({ success: true, product: newProduct });
  } catch (err) {
    console.error("Failed to add product:", err);
    res.status(500).json({ error: 'Failed to add product', detail: err.message });
  }
});

// BULK POST new products
app.post('/api/products/bulk', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { items, autoPostFB, autoPostIG, autoPostX, autoPostThreads } = req.body;
    const shouldPost = autoPostFB || autoPostIG || autoPostX || autoPostThreads;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Expected an array of products' });
    }

    // Auto Generate SEO สำหรับสินค้าที่ยังไม่มี
    const itemsWithSEO = await Promise.all(items.map(async (p) => {
      // ถ้ามี SEO อยู่แล้ว ใช้ได้เลย
      if (p.seo_description && p.seo_keywords && p.seo_keywords.length > 0) {
        return p;
      }

      // Generate SEO ใหม่
      try {
        const seoData = generateLocalSEO(p.title, p.category, p.price);
        return {
          ...p,
          seo_keywords: seoData.seo_keywords,
          seo_description: seoData.seo_description,
          seo_title: seoData.seo_title
        };
      } catch (err) {
        console.error('Failed to generate SEO for:', p.title, err.message);
        return p;
      }
    }));

    const itemsToAdd = itemsWithSEO.map(p => {
      const parsedPrice = parseFloat(p.price) || 0;
      const parsedOriginalPrice = p.originalPrice ? parseFloat(p.originalPrice) : null;
      const parsedDiscount = p.discount ? parseInt(p.discount, 10) : null;

      return {
        title: p.title || 'Untitled Product',
        price: parsedPrice,
        originalPrice: parsedOriginalPrice,
        discount: parsedDiscount,
        image: p.image || '',
        affiliateUrl: p.affiliateUrl || '',
        category: p.category || 'ทั่วไป',
        description: p.description || '',
        id: p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        clicks: 0,
        date: new Date().toISOString(),
        facebookPostId: null,
        twitterPostId: null,
        seo_keywords: p.seo_keywords || [],
        seo_description: p.seo_description || '',
        seo_title: p.seo_title || '',
        commission: p.commission || 0
      };
    });

    const { error } = await supabase.from('products').insert(itemsToAdd);
    if (error) throw error;

    // 🔔 Background: Notify Google to index all new product URLs
    const siteUrlForIndex = process.env.SITE_URL || 'https://chob.shop';
    const productUrls = itemsToAdd.map(p => `${siteUrlForIndex}/?productId=${p.id}`);
    notifyBulkIndexing(productUrls).catch(e => console.error('Bulk indexing error:', e.message));

    // Background Social Media Posting
    if (shouldPost) {
      console.log('🚀 Starting background social media job...');
      (async () => {
        const siteUrl = process.env.SITE_URL || 'https://chob.shop';
        for (const product of itemsToAdd) {
          const logMsg = (m) => fs.appendFileSync('debug_social.log', `[${new Date().toISOString()}] ${m}\n`);
          logMsg(`📝 Processing social media for: ${product.title}`);

          // Generate AI Caption สำหรับโซเชียลมีเดีย
          let aiCaption = null;
          try {
            aiCaption = await generateAICaption(product);
          } catch (err) {
            console.error('Failed to generate AI caption:', err.message);
          }

          let fbPostId = null, xPostId = null, threadsPostId = null;

          if (autoPostFB) {
            const fbRes = await postToFacebook(product, siteUrl, true, aiCaption);
            if (fbRes.success && fbRes.postId) fbPostId = fbRes.postId;
          }
          if (autoPostIG) await postToInstagram(product, siteUrl, true, aiCaption);
          if (autoPostX) {
            const xRes = await postToX(product, siteUrl, true, aiCaption);
            if (xRes.success && xRes.tweetId) xPostId = xRes.tweetId;
          }
          if (autoPostThreads) {
            const tRes = await postToThreads(product, siteUrl, true, aiCaption);
            if (tRes.success && tRes.threadId) threadsPostId = tRes.threadId;
          }

          if (fbPostId || xPostId || threadsPostId) {
            try {
              const updates = {};
              if (fbPostId) updates.facebookPostId = fbPostId;
              if (xPostId) updates.twitterPostId = xPostId;

              await supabase.from('products').update(updates).eq('id', product.id);
              console.log(`💾 Stored Social IDs for "${product.title}"`);
            } catch (e) {
              console.error('Failed to update Social IDs:', e.message);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log('🏁 Background social media job finished.');
      })();
    }

    res.json({ success: true, count: itemsToAdd.length, backgroundPosting: !!shouldPost });
  } catch (err) {
    console.error('Bulk import error:', err);
    res.status(500).json({ error: 'Failed to bulk add products', detail: err.message });
  }
});

// RESTORE Backup bulk UPSERT
app.post('/api/products/restore', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Expected an array of products' });
    }

    const { error } = await supabase.from('products').upsert(items);
    if (error) throw error;

    res.json({ success: true, count: items.length });
  } catch (err) {
    console.error('Failed to restore products:', err);
    res.status(500).json({ error: 'Failed to restore products', detail: err.message });
  }
});

// PUT update a product
app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");

    // Remove id from updates if present to prevent primary key change
    const updatePayload = { ...req.body };
    delete updatePayload.id;

    const { error } = await supabase.from('products').update(updatePayload).eq('id', req.params.id);
    if (error) throw error;

    res.json({ success: true, product: { ...req.body, id: req.params.id } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product', detail: err.message });
  }
});

// DELETE a product
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data: productToDelete, error: fetchErr } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (!fetchErr && productToDelete) {
      if (productToDelete.facebookPostId) {
        deleteFromFacebook(productToDelete.facebookPostId).catch(e => console.error('FB Sync delete err:', e.message));
      }
      if (productToDelete.twitterPostId) {
        deleteFromX(productToDelete.twitterPostId).catch(e => console.error('X Sync delete err:', e.message));
      }
    }

    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product', detail: err.message });
  }
});

// BULK DELETE
app.post('/api/products/bulk-delete', requireAuth, async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Expected an array of product IDs' });
    }

    const { data: productsToDelete } = await supabase.from('products').select('*').in('id', ids);
    if (productsToDelete) {
      productsToDelete.forEach(p => {
        if (p.facebookPostId) deleteFromFacebook(p.facebookPostId).catch(e => console.error('FB err:', e.message));
        if (p.twitterPostId) deleteFromX(p.twitterPostId).catch(e => console.error('X err:', e.message));
      });
    }

    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) throw error;

    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk delete products', detail: err.message });
  }
});

// POST increment click
app.post('/api/products/:id/click', async (req, res) => {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");

    // We fetch current clicks, increment, and save. (Supabase RPC is better, but this works)
    const { data: product, error: fetchErr } = await supabase.from('products').select('clicks').eq('id', req.params.id).single();
    if (fetchErr) throw fetchErr;

    const newClicks = (product.clicks || 0) + 1;
    const { error } = await supabase.from('products').update({ clicks: newClicks }).eq('id', req.params.id);
    if (error) throw error;

    res.json({ success: true, clicks: newClicks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record click', detail: err.message });
  }
});

// --- POST generate SEO with Local Logic (Replaces Gemini API) ---
// ฟังก์ชันสำหรับสร้าง SEO แบบ Local - เขียนคอนเทนต์ให้เหมือนคนรีวิวจริง
function generateLocalSEO(title, category, price) {
  if (!title) return { seo_title: '', seo_description: '', seo_keywords: [] };

  // 1. Clean Title
  const cleanTitle = title.replace(/[\[\]\(\)\-\|\,\.\/]/g, ' ').trim();

  // 2. Tokenization
  let words = cleanTitle.split(/\s+/).filter(w => w.length > 0);

  // 3. Stop words
  const stopWords = ['ของแท้', 'พร้อมส่ง', 'ราคาถูก', 'ส่งฟรี', 'ด่วน', 'มีโค้ด', 'ลดราคา', 'แท้'];

  // 4. สร้าง Keywords
  let keywords = words.filter(word => word.length > 2 && !stopWords.includes(word));
  if (category) keywords.push(category);
  if (words.length >= 2) keywords.push(`${words[0]} ${words[1]}`);
  if (words.length >= 3) keywords.push(`${words[0]} ${words[1]} ${words[2]}`);
  const finalKeywords = [...new Set(keywords)].slice(0, 10);

  // 5. สร้าง SEO Title
  const seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;

  // 6. สร้าง SEO Description - เขียนให้เหมือนคนรีวิวจริง
  const numPrice = parseFloat(price) || 0;

  // กำหนดโทนการเขียนตามหมวดหมู่
  const categoryTone = getCategoryTone(category);

  // Template การเขียนแบบต่างๆ (10 แบบ)
  const reviewTemplates = getReviewTemplates(categoryTone);

  // สุ่มเลือก template
  const randomIndex = Math.floor(Math.random() * reviewTemplates.length);
  const template = reviewTemplates[randomIndex];

  // แทนที่ตัวแปรใน template
  const seoDescription = template
    .replace(/{title}/g, title)
    .replace(/{price}/g, numPrice.toLocaleString())
    .replace(/{category}/g, category || 'สินค้าดีๆ');

  return {
      seo_title: seoTitle,
      seo_description: seoDescription,
      seo_keywords: finalKeywords
  };
}

// ฟังก์ชันกำหนดโทนการเขียนตามหมวดหมู่
function getCategoryTone(category) {
  if (!category) return 'general';

  const catLower = category.toLowerCase();

  if (catLower.includes('แฟชั่น') || catLower.includes('เสื้อผ้า') || catLower.includes('กระเป๋า') || catLower.includes('รองเท้า')) {
    return 'fashion';
  }
  if (catLower.includes('อิเล็ก') || catLower.includes('มือถือ') || catLower.includes('คอม') || catLower.includes('กล้อง') || catLower.includes('เครื่องเสียง')) {
    return 'tech';
  }
  if (catLower.includes('ความงาม') || catLower.includes('สุขภาพ') || catLower.includes('ผิว')) {
    return 'beauty';
  }
  if (catLower.includes('บ้าน') || catLower.includes('เครื่องใช้') || catLower.includes('สวน')) {
    return 'home';
  }
  if (catLower.includes('แม่และเด็ก') || catLower.includes('เด็ก') || catLower.includes('ของเล่น')) {
    return 'baby';
  }
  if (catLower.includes('กีฬา') || catLower.includes('ท่องเที่ยว') || catLower.includes('กลางแจ้ง')) {
    return 'sport';
  }
  if (catLower.includes('อาหาร') || catLower.includes('เครื่องดื่ม')) {
    return 'food';
  }

  return 'general';
}

// ฟังก์ชันดึง template ตามโทน
function getReviewTemplates(tone) {
  const templates = {
    // ===== FASHION TONE =====
    fashion: [
      `{title} - เสื้อผ้าแฟชั่น สวมใส่สบาย วัสดุดี ราคานี้แค่ {price} บาท คุ้มค่า ใช้งานได้ในชีวิตประจำวัน`,
      `{title} - เสื้อผ้าสไตล์ทันสมัย ใส่สบาย วัสดุคุณภาพดี ราคา {price} บาท เหมาะใส่ไปทำงานหรือเที่ยว`,
      `{title} - แฟชั่นใส่สบาย วัสดุนุ่ม ไม่ร้อน ราคานี้ {price} บาท คุ้มค่า เหมาะใส่ทุกวัน`,
      `{title} - เสื้อผ้าแฟชั่น 做工ดี สีตรงภาพ ราค {price} บาท ใส่ได้หลายโอกาส`,
      `{title} - เสื้อผ้าสไตล์เกาหลี ใส่สบาย วัสดุดี ราคานี้ {price} บาท คุ้มค่า`,
      `{title} - แฟชั่นลำลอง ใส่สบาย วัสดุ breathable ราค {price} บาท เหมาะอากาศเมืองไทย`,
      `{title} - เสื้อผ้าใส่สบาย 做工เรียบร้อย ราค {price} บาท เหมาะใส่ทำงานหรือเที่ยว`,
      `{title} - แฟชั่นสวยเรียบง่าย วัสดุดี ราคานี้ {price} บาท คุ้มค่า`,
      `{title} - เสื้อผ้าสไตล์มินิมอล ใส่สบาย ราค {price} บาท เหมาะทุกวัย`,
      `{title} - แฟชั่นใส่ได้ทุกวัน วัสดุดี 做工ดี ราค {price} บาท`,
    ],

    // ===== TECH TONE =====
    tech: [
      `{title} - อุปกรณ์ไอที ใช้งานง่าย ฟีเจอร์ครบ ราคานี้แค่ {price} บาท คุ้มค่า`,
      `{title} - Gadget เทคโนโลยีใหม่ ใช้งานสะดวก ราค {price} บาท เหมาะใช้ในชีวิตประจำวัน`,
      `{title} - อุปกรณ์อิเล็กทรอนิกส์ 做工ดี ใช้งานลื่นไหล ราค {price} บาท`,
      `{title} - อุปกรณ์ไอทีคุณภาพดี ใช้งานง่าย ฟีเจอร์ครบ ราค {price} บาท`,
      `{title} - Gadget ใช้งานสะดวก พกพาง่าย ราค {price} บาท เหมาะคนยุคใหม่`,
      `{title} - อุปกรณ์เทคโนโลยี 做工ละเอียด ใช้งานดี ราค {price} บาท`,
      `{title} - อุปกรณ์ไอทีราคาประหยัด ใช้งานดี ฟีเจอร์ครบ ราค {price} บาท`,
      `{title} - Gadget คุณภาพดี ใช้งานง่าย ราค {price} บาท คุ้มค่า`,
      `{title} - อุปกรณ์อิเล็กทรอนิกส์ ใช้งานลื่นไหล ราค {price} บาท`,
      `{title} - อุปกรณ์ไอที做工ดี ใช้งานสะดวก ราค {price} บาท`,
    ],

    // ===== BEAUTY TONE =====
    beauty: [
      `{title} - เครื่องสำอาง ใช้งานง่าย ให้ผลลัพธ์ดี ราคานี้แค่ {price} บาท`,
      `{title} - สกินแคร์บำรุงผิว ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องสำอางคุณภาพดี ใช้งานง่าย ราค {price} บาท เหมาะใช้ทุกวัน`,
      `{title} - สกินแคร์ผิวหน้า ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องสำอางแบรนด์ดัง ใช้งานดี ราค {price} บาท คุ้มค่า`,
      `{title} - สกินแคร์บำรุงผิวหน้า ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องสำอางให้สีสวย ใช้งานง่าย ราค {price} บาท`,
      `{title} - สกินแคร์ผิวใส ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องสำอางติดทน ใช้งานง่าย ราค {price} บาท`,
      `{title} - สกินแคร์ลดริ้วรอย ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
    ],

    // ===== HOME TONE =====
    home: [
      `{title} - ของใช้ในบ้าน ใช้งานสะดวก วัสดุดี ราคานี้แค่ {price} บาท`,
      `{title} - อุปกรณ์จัดเก็บของ ใช้งานง่าย ประหยัดพื้นที่ ราค {price} บาท`,
      `{title} - ของใช้ในบ้านคุณภาพดี ใช้งานสะดวก ราค {price} บาท`,
      `{title} - อุปกรณ์ครัว ใช้งานง่าย วัสดุดี ราค {price} บาท`,
      `{title} - ของใช้ในบ้าน做工ดี ใช้งานสะดวก ราค {price} บาท`,
      `{title} - อุปกรณ์จัดบ้าน ใช้งานง่าย ราค {price} บาท คุ้มค่า`,
      `{title} - ของใช้ในบ้านสไตล์มินิมอล ใช้งานดี ราค {price} บาท`,
      `{title} - อุปกรณ์ในบ้าน ใช้งานสะดวก วัสดุดี ราค {price} บาท`,
      `{title} - ของใช้做工ดี ใช้งานง่าย ราค {price} บาท`,
      `{title} - อุปกรณ์ใช้ในบ้าน ใช้งานสะดวก ราค {price} บาท`,
    ],

    // ===== BABY TONE =====
    baby: [
      `{title} - สินค้าแม่และเด็ก ใช้งานสะดวก ปลอดภัย ราคานี้แค่ {price} บาท`,
      `{title} - อุปกรณ์เด็กเล็ก ใช้งานง่าย วัสดุนุ่ม ปลอดภัย ราค {price} บาท`,
      `{title} - สินค้าสำหรับเด็ก ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - อุปกรณ์แม่และเด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
      `{title} - สินค้าเด็กอ่อน ใช้งานสะดวก วัสดุดี ปลอดภัย ราค {price} บาท`,
      `{title} - อุปกรณ์เด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
      `{title} - สินค้าแม่และเด็กคุณภาพดี ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - อุปกรณ์เด็กเล็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
      `{title} - สินค้าสำหรับเด็ก ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
      `{title} - อุปกรณ์แม่และเด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
    ],

    // ===== SPORT TONE =====
    sport: [
      `{title} - อุปกรณ์กีฬา ใช้งานดี ทนทาน ราคานี้แค่ {price} บาท`,
      `{title} - อุปกรณ์ออกกำลังกาย ใช้งานง่าย วัสดุดี ราค {price} บาท`,
      `{title} - อุปกรณ์กีฬาคุณภาพดี ใช้งานทนทาน ราค {price} บาท`,
      `{title} - อุปกรณ์ฟิตเนส ใช้งานง่าย ราค {price} บาท`,
      `{title} - อุปกรณ์กีฬา做工ดี ใช้งานทนทาน ราค {price} บาท`,
      `{title} - อุปกรณ์ออกกำลังกาย ใช้งานดี ราค {price} บาท`,
      `{title} - อุปกรณ์กีฬา ใช้งานสะดวก ราค {price} บาท`,
      `{title} - อุปกรณ์กีฬาคุณภาพ ใช้งานทนทาน ราค {price} บาท`,
      `{title} - อุปกรณ์ออกกำลังกาย ใช้งานง่าย ราค {price} บาท`,
      `{title} - อุปกรณ์กีฬา ใช้งานดี วัสดุดี ราค {price} บาท`,
    ],

    // ===== FOOD TONE =====
    food: [
      `{title} - อาหารและเครื่องดื่ม รสชาติอร่อย ปลอดภัย ราคานี้แค่ {price} บาท`,
      `{title} - ขนมอร่อย วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
      `{title} - อาหารสำเร็จรูป รสชาติดี ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องดื่มอร่อย วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
      `{title} - ขนมรสชาติดี ปลอดภัย ราค {price} บาท`,
      `{title} - อาหารอร่อย วัตถุดิบสดใหม่ ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องดื่มคุณภาพดี ปลอดภัย ราค {price} บาท`,
      `{title} - ขนมรสชาติอร่อย ปลอดภัย ราค {price} บาท`,
      `{title} - อาหารรสชาติดี วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
      `{title} - เครื่องดื่มอร่อย ปลอดภัย ราค {price} บาท`,
    ],

    // ===== GENERAL TONE =====
    general: [
      `{title} - สินค้าคุณภาพดี ใช้งานสะดวก ราคานี้แค่ {price} บาท คุ้มค่า`,
      `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท เหมาะใช้ในชีวิตประจำวัน`,
      `{title} - สินค้าคุณภาพ ใช้งานสะดวก ราค {price} บาท คุ้มค่า`,
      `{title} - สินค้าใช้งานดี วัสดุดี ราค {price} บาท`,
      `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท`,
      `{title} - สินค้าคุณภาพดี ใช้งานสะดวก ราค {price} บาท`,
      `{title} - สินค้าใช้งานดี คุ้มค่า ราค {price} บาท`,
      `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท`,
      `{title} - สินค้าคุณภาพ ใช้งานสะดวก ราค {price} บาท`,
      `{title} - สินค้าใช้งานดี วัสดุดี ราค {price} บาท`,
    ],
  };

  return templates[tone] || templates.general;
}

app.post('/api/ai/seo', requireAuth, async (req, res) => {
  const { title, category, price } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  
  try {
    const seoData = generateLocalSEO(title, category, price);
    res.json({ success: true, ...seoData });
  } catch (err) {
    res.status(500).json({ error: 'Local SEO failed', detail: err.message });
  }
});

// --- POST generate SEO with AI for a specific product ---
app.post('/api/products/:id/gen-seo', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    // 1. Fetch current product
    const { data: product, error: fetchError } = await supabase.from('products').select('*').eq('id', id).single();
    if (fetchError || !product) return res.status(404).json({ error: 'Product not found' });

    // 2. Generate SEO Data Locally
    const seoData = generateLocalSEO(product.title, product.category, product.price);

    // 3. Update product
    const { error: updateError } = await supabase.from('products').update({
      seo_keywords: seoData.seo_keywords,
      seo_description: seoData.seo_description,
      seo_title: seoData.seo_title
    }).eq('id', id);

    if (updateError) throw updateError;

    res.json({ success: true, seo_keywords: seoData.seo_keywords, seo_description: seoData.seo_description, seo_title: seoData.seo_title });
  } catch (err) {
    console.error('AI SEO Endpoint Error:', err);
    res.status(500).json({ error: 'Failed to generate SEO', detail: err.message });
  }
});

// --- POST generate SEO in bulk ---
app.post('/api/products/bulk/gen-seo', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid IDs' });

  try {
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    console.log(`⏳ Generating Local SEO for ${ids.length} items...`);
    const results = { successCount: 0, failedCount: 0 };

    for (const id of ids) {
      try {
        const { data: product } = await supabase.from('products').select('*').eq('id', id).single();
        if (product) {
          const seoData = generateLocalSEO(product.title, product.category, product.price);
          await supabase.from('products').update({
            seo_keywords: seoData.seo_keywords,
            seo_description: seoData.seo_description,
            seo_title: seoData.seo_title
          }).eq('id', id);
          results.successCount++;
        }
      } catch (e) {
        results.failedCount++;
      }
    }

    res.json({ success: true, message: `Updated ${results.successCount} items, ${results.failedCount} failed.`, ...results });
  } catch (err) {
    res.status(500).json({ error: 'Bulk SEO failed', detail: err.message });
  }
});

// --- POST scrape link for Auto-fill ---
app.post('/api/scrape-link', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const options = {
      url,
      fetchOptions: {
        headers: {
          'user-agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
        }
      }
    };
    
    const { result } = await ogs(options);
    
    // Fallback logic could be added here if ogImage/ogTitle are missing, but Shopee usually provides them.
    const title = result.ogTitle || '';
    let image = '';
    
    if (result.ogImage && result.ogImage.length > 0) {
      image = result.ogImage[0].url;
    } else if (result.ogImage && typeof result.ogImage === 'string') {
        image = result.ogImage;
    }

    res.json({ success: true, title, image });
  } catch (err) {
    console.error('Failed to scrape link:', err.message);
    res.status(500).json({ error: 'Failed to scrape link', detail: err.message });
  }
});

// --- API Settings Management ---
app.get('/api/settings', requireAuth, (req, res) => {
  const isRaw = req.query.raw === 'true';

  const formatOutput = (val) => {
    if (!val) return '';
    if (isRaw) return val;
    return '●●●●●●●●'; // Use a consistent identifiable marker
  };

  res.json({
    FB_PAGE_ACCESS_TOKEN: formatOutput(process.env.FB_PAGE_ACCESS_TOKEN),
    THREADS_USER_ID: process.env.THREADS_USER_ID || '', // User ID isn't a secret typically, so we just return it
    THREADS_ACCESS_TOKEN: formatOutput(process.env.THREADS_ACCESS_TOKEN),
    GEMINI_API_KEY: formatOutput(process.env.GEMINI_API_KEY),
    SUPABASE_URL: formatOutput(process.env.SUPABASE_URL || EMBEDDED_SUPABASE_URL),
    SUPABASE_KEY: formatOutput(process.env.SUPABASE_KEY || EMBEDDED_SUPABASE_KEY),
    CARD_THEME: process.env.CARD_THEME || 'theme-white',
    STATS_THEME: process.env.STATS_THEME || 'stats-premium'
  });
});

app.get('/api/theme', (req, res) => {
  res.json({
    CARD_THEME: process.env.CARD_THEME || 'theme-white',
    STATS_THEME: process.env.STATS_THEME || 'stats-premium'
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  try {
    const allowedKeys = ['FB_PAGE_ACCESS_TOKEN', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'CARD_THEME', 'STATS_THEME'];
    const updates = req.body;

    const SECRET_MARKER = '●●●●●●●●';
    let updatedCount = 0;
    let supabaseChanged = false;

    for (const key of allowedKeys) {
      const newValue = updates[key];
      // Only update if value is provided, not empty, and not the secret marker
      if (newValue !== undefined && newValue !== '' && newValue !== SECRET_MARKER) {
        // Check if value actually changed
        if (process.env[key] !== newValue) {
          process.env[key] = newValue;
          updatedCount++;
          if (key === 'SUPABASE_URL' || key === 'SUPABASE_KEY') {
            supabaseChanged = true;
          }
        }
      }
    }

    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath) && updatedCount > 0) {
      try {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        for (const key of allowedKeys) {
          const newValue = updates[key];
          if (newValue !== undefined && newValue !== '' && newValue !== SECRET_MARKER) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (envContent.match(regex)) {
              envContent = envContent.replace(regex, `${key}=${newValue}`);
            } else {
              envContent += `\n${key}=${newValue}`;
            }
          }
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
      } catch (fileErr) {
        console.warn('Could not persist to .env file:', fileErr.message);
      }
    }

    // Hot-reload Supabase only if keys ACTUALLY changed
    if (supabaseChanged) {
      const newUrl = process.env.SUPABASE_URL || '';
      const newKey = process.env.SUPABASE_KEY || '';
      if (newUrl && newKey) {
        supabaseUrl = newUrl;
        supabaseKey = newKey;
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("🟢 Supabase client re-initialized with new keys.");
      }
    } else {
      console.log("ℹ️ Settings updated. Supabase configuration remains unchanged.");
    }

    console.log(`⚙️ Settings updated: ${updatedCount} key(s) modified.`);
    res.json({ success: true, updatedCount });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings', detail: err.message });
  }
});

// --- POST categorize via Local Logic with AI Learning ---
// ฟังก์ชันวิเคราะห์หมวดหมู่แบบ Local พร้อมเรียนรู้
function generateLocalCategory(title, seoKeywords = [], description = '') {
  if (!title) return "อื่นๆ";

  const t = title.toLowerCase();
  const titleKeywords = extractKeywords(title);
  const categories = categoryMapper.categories;

  let bestMatch = 'อื่นๆ';
  let highestScore = 0;

  for (const [categoryName, categoryData] of Object.entries(categories)) {
    if (!categoryData.keywords || categoryData.keywords.length === 0) continue;

    let score = 0;

    // 1. Predefined keyword matching
    for (const keyword of categoryData.keywords) {
      const kwLower = keyword.toLowerCase();
      // Use word-based match from titleKeywords or exact match
      const isMatch = titleKeywords.includes(kwLower) || t === kwLower;

      if (isMatch) {
        const learnedWeight = getKeywordWeight(kwLower, categoryName);
        score += (t === kwLower ? 5 : 3) * learnedWeight;
      }
    }

    // 2. AI Learned weights for all keywords in title
    for (const kw of titleKeywords) {
      const weight = getKeywordWeight(kw, categoryName);
      if (weight > 1.0) {
        score += (weight - 1.0) * 10;
      } else if (weight < 1.0) {
        score -= (1.0 - weight) * 5;
      }
    }

    // Apply priority multiplier
    if (score > 0) {
      score *= (categoryData.priority || 1);
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = categoryName;
    }
  }

  // Record prediction for learning
  const confidence = Math.min(1, highestScore / 100);
  recordPrediction(title, bestMatch, confidence);

  return bestMatch;
}

app.post('/api/categorize', requireAuth, async (req, res) => {
  const { title, seo_keywords, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const category = generateLocalCategory(title, seo_keywords, description);
    res.json({ success: true, category, learningEnabled: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// === AI LEARNING ENDPOINTS ===

// Test endpoint (Public - no auth required for testing)
app.get('/api/ai/test', async (req, res) => {
  try {
    const stats = ai.getStats();
    res.json({
      success: true,
      message: 'AI Learning is working!',
      ...stats
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record correction (user feedback)
app.post('/api/ai/learn/correct', requireAuth, async (req, res) => {
  const { title, predictedCategory, correctCategory } = req.body;

  console.log('🎓 Learning correction:', { title, predictedCategory, correctCategory });

  if (!title || !predictedCategory || !correctCategory) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = recordCorrection(title, predictedCategory, correctCategory);
    console.log('✅ Learning result:', result);
    res.json(result);
  } catch (err) {
    console.error('❌ Learning error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get AI learning statistics
app.get('/api/ai/stats', requireAuth, async (req, res) => {
  try {
    const stats = ai.getStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Analyze learning patterns
app.get('/api/ai/analyze', requireAuth, async (req, res) => {
  try {
    const patterns = ai.analyzePatterns();
    res.json({ success: true, ...patterns });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export learning data
app.get('/api/ai/export', requireAuth, async (req, res) => {
  try {
    const data = ai.exportLearningData();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import learning data
app.post('/api/ai/import', requireAuth, async (req, res) => {
  const { learningData, keywordWeights } = req.body;

  try {
    const result = ai.importLearningData({ learningData, keywordWeights });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset learning data
app.post('/api/ai/reset', requireAuth, async (req, res) => {
  try {
    const result = ai.resetLearning();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- POST bulk categorize ---
app.post('/api/products/bulk/categorize', requireAuth, async (req, res) => {
  const { productIds } = req.body;
  
  // Accept both productIds (from new plan) or ids (existing bulk style)
  const idsToProcess = productIds || req.body.ids;
  
  if (!idsToProcess || !Array.isArray(idsToProcess)) {
      return res.status(400).json({ error: 'Invalid IDs' });
  }

  try {
      if (!supabase) return res.status(500).json({ error: 'Database not configured' });

      let updatedCount = 0;
      let failedCount = 0;

      for (const id of idsToProcess) {
          try {
              const { data: product } = await supabase.from('products').select('title, seo_keywords, description').eq('id', id).single();
              if (product) {
                  const newCategory = generateLocalCategory(product.title, product.seo_keywords, product.description);
                  // Update only if category changes, optionally
                  await supabase.from('products').update({ category: newCategory }).eq('id', id);
                  updatedCount++;
              }
          } catch (e) {
              failedCount++;
          }
      }
      res.json({ success: true, updatedCount, failedCount });
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

// --- POST categorize ALL ---
app.post('/api/products/categorize-all', requireAuth, async (req, res) => {
  try {
      if (!supabase) return res.status(500).json({ error: 'Database not configured' });

      // Fetch all products that need categorization (or all of them)
      const { data: products, error } = await supabase.from('products').select('id, title, seo_keywords, description, category');
      
      if (error) throw error;
      if (!products || products.length === 0) return res.json({ success: true, updatedCount: 0, message: "No products found" });

      let updatedCount = 0;
      
      // Batch processing to respect Supabase limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < products.length; i += BATCH_SIZE) {
          const batch = products.slice(i, i + BATCH_SIZE);
          const updatePromises = batch.map(async (product) => {
              const newCategory = generateLocalCategory(product.title, product.seo_keywords, product.description);
              
              // Only update if the category is actually different (saves API calls)
              if (newCategory !== product.category) {
                  const { error: updateError } = await supabase.from('products').update({ category: newCategory }).eq('id', product.id);
                  if (!updateError) updatedCount++;
              }
          });
          
          await Promise.all(updatePromises);
      }

      res.json({ success: true, updatedCount, totalEvaluated: products.length });
  } catch (error) {
      console.error("Categorize All Error:", error);
      res.status(500).json({ error: error.message });
  }
});

// --- Image Proxy (Auto WebP Conversion) ---
const imageCache = new Map();
const IMAGE_CACHE_MAX = 100;
const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'URL parameter required' });

    // Validate URL
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Only allow known image hosts for security
    const allowedHosts = ['cf.shopee.co.th', 'down-th.img.susercontent.com', 'cf.shopee.com', 'img.lazcdn.com', 'placehold.co'];
    const isAllowed = allowedHosts.some(h => parsedUrl.hostname.includes(h));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Image host not allowed' });
    }

    // Check cache
    const cacheKey = imageUrl;
    const cached = imageCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < IMAGE_CACHE_TTL)) {
      res.set('Content-Type', 'image/webp');
      res.set('Cache-Control', 'public, max-age=604800, immutable');
      res.set('X-Cache', 'HIT');
      return res.send(cached.buffer);
    }

    // Fetch the original image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'ChobShop-ImageProxy/1.0' }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Failed to fetch image: ${response.status}` });
    }

    // Check size (max 5MB)
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Image too large (max 5MB)' });
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Convert to WebP with sharp
    const webpBuffer = await sharp(imageBuffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    // Store in cache (LRU eviction)
    if (imageCache.size >= IMAGE_CACHE_MAX) {
      const oldestKey = imageCache.keys().next().value;
      imageCache.delete(oldestKey);
    }
    imageCache.set(cacheKey, { buffer: webpBuffer, timestamp: Date.now() });

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.set('X-Cache', 'MISS');
    res.send(webpBuffer);

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Image fetch timeout' });
    }
    console.error('Image proxy error:', err.message);
    res.status(500).json({ error: 'Image proxy failed', detail: err.message });
  }
});

// --- Manual Google Indexing Submit ---
app.post('/api/indexing/submit', requireAuth, async (req, res) => {
  try {
    const { url, urls } = req.body;

    if (urls && Array.isArray(urls)) {
      // Bulk submit
      const result = await notifyBulkIndexing(urls);
      return res.json(result);
    }

    if (url) {
      // Single submit
      const result = await notifyGoogleIndexing(url);
      return res.json(result);
    }

    return res.status(400).json({ error: 'URL or URLs array required' });
  } catch (err) {
    res.status(500).json({ error: 'Indexing submit failed', detail: err.message });
  }
});

// --- Reindex All Products ---
app.post('/api/indexing/reindex-all', requireAuth, async (req, res) => {
  try {
    if (!supabase) return res.status(500).json({ error: 'Database not configured' });

    const { data: products, error } = await supabase.from('products').select('id').order('date', { ascending: false });
    if (error) throw error;

    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    const productUrls = products.map(p => `${siteUrl}/?productId=${p.id}`);

    // Include homepage and sitemap
    const allUrls = [`${siteUrl}/`, ...productUrls];

    // Fire-and-forget background job
    notifyBulkIndexing(allUrls).then(result => {
      console.log(`📊 Reindex-all completed: ${JSON.stringify(result.results)}`);
    }).catch(e => console.error('Reindex-all error:', e.message));

    res.json({ success: true, message: `กำลังส่ง ${allUrls.length} URLs ให้ Google (background)`, totalUrls: allUrls.length });
  } catch (err) {
    res.status(500).json({ error: 'Reindex-all failed', detail: err.message });
  }
});

// --- Health Check ---
app.get('/api/health', async (req, res) => {
  const supabaseConfigured = !!(supabaseUrl && supabaseKey && supabase);
  let supabaseValid = false;
  let supabaseError = null;

  if (supabaseConfigured) {
    try {
      const { data, error } = await supabase.from('products').select('id').limit(1);
      if (error) {
        supabaseError = error.message;
      } else {
        supabaseValid = true;
      }
    } catch (err) {
      supabaseError = err.message;
    }
  }

  res.json({
    status: 'ok',
    supabase: supabaseConfigured,
    supabaseValid,
    supabaseError,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🛍️  Chob.Shop server running at http://0.0.0.0:${PORT}`);
  console.log(`📋  Admin panel: http://0.0.0.0:${PORT}/admin.html`);
  if (supabase) {
    console.log(`✅  Supabase connected: ${supabaseUrl}`);
  } else {
    console.warn(`⚠️  WARNING: Supabase is NOT configured! Set SUPABASE_URL and SUPABASE_KEY environment variables on Railway.`);
  }
});
