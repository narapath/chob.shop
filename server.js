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
        .select('id, title, price, originalPrice, discount, image, affiliateUrl, category, clicks, date, facebookPostId, twitterPostId, seo_keywords, seo_description, seo_title, commission, description, rating_value, review_count');

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
    const { items, autoPostFB, autoPostIG, autoPostX, autoPostThreads, toggleAI } = req.body;
    const shouldPost = autoPostFB || autoPostIG || autoPostX || autoPostThreads;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Expected an array of products' });
    }

    const itemsToAdd = items.map(p => {
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

          let aiCaption = null;
          if (toggleAI) {
            aiCaption = await generateAICaption(product);
          }

          let fbPostId = null, xPostId = null, threadsPostId = null;

          if (autoPostFB) {
            const fbRes = await postToFacebook(product, siteUrl, toggleAI, aiCaption);
            if (fbRes.success && fbRes.postId) fbPostId = fbRes.postId;
          }
          if (autoPostIG) await postToInstagram(product, siteUrl, toggleAI, aiCaption);
          if (autoPostX) {
            const xRes = await postToX(product, siteUrl, toggleAI, aiCaption);
            if (xRes.success && xRes.tweetId) xPostId = xRes.tweetId;
          }
          if (autoPostThreads) {
            const tRes = await postToThreads(product, siteUrl, toggleAI, aiCaption);
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
// ฟังก์ชันสำหรับสร้าง SEO แบบ Local
function generateLocalSEO(title, category, price) {
  if (!title) return { seo_title: '', seo_description: '', seo_keywords: [] };

  // 1. Clean Title: เอาอักขระพิเศษออกเพื่อให้ตัดคำง่ายขึ้น
  const cleanTitle = title.replace(/[\[\]\(\)\-\|\,\.\/]/g, ' ').trim();
  
  // 2. Tokenization: แยกคำด้วยช่องว่าง
  // (Note: This is basic tokenization. Assumes Thai words are spaced, or treats chunks as keywords)
  let words = cleanTitle.split(/\s+/).filter(w => w.length > 0);

  // 3. Stop words ภาษาไทย (คำที่พบบ่อยแต่ไม่มีผลต่อ SEO มากนัก)
  const stopWords = ['ของแท้', 'พร้อมส่ง', 'ราคาถูก', 'ส่งฟรี', 'ด่วน', 'มีโค้ด', 'ลดราคา', 'แท้'];
  
  // 4. สร้าง Keywords
  let keywords = words.filter(word => word.length > 2 && !stopWords.includes(word));
  
  // เพิ่ม Category และการผสมคำ (Combinations)
  if (category) keywords.push(category);
  
  // สร้าง Combinations 2-3 คำแรก (มักจะเป็นชื่อแบรนด์ + รุ่น)
  if (words.length >= 2) keywords.push(`${words[0]} ${words[1]}`);
  if (words.length >= 3) keywords.push(`${words[0]} ${words[1]} ${words[2]}`);

  // จำกัดจำนวน keywords ไม่ให้รกเกินไป (เช่น 10 คำ)
  const finalKeywords = [...new Set(keywords)].slice(0, 10);

  // 5. สร้าง SEO Title (ตัดเหลือ 60 ตัวอักษร)
  const seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;

  // 6. สร้าง SEO Description (Template)
  const numPrice = parseFloat(price) || 0;
  const formattedPrice = numPrice > 0 ? ` ราคาเพียง ${numPrice.toLocaleString()} บาท` : '';
  const seoDescription = `ซื้อ ${title} ในหมวดหมู่ ${category || 'ทั่วไป'}${formattedPrice} ช้อปเลยที่ Chob.Shop แหล่งรวมสินค้าคุ้มค่า พร้อมรีวิวและโปรโมชั่นล่าสุด`;

  return {
      seo_title: seoTitle,
      seo_description: seoDescription,
      seo_keywords: finalKeywords // Keep as array to match frontend expectations
  };
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

// --- POST categorize via Local Logic ---
// ฟังก์ชันวิเคราะห์หมวดหมู่แบบ Local (Scoring Algorithm)
function generateLocalCategory(title, seoKeywords = [], description = '') {
  if (!title) return "ทั่วไป";
  
  const textTitle = (title || '').toLowerCase();
  const textDesc = (description || '').toLowerCase();
  const textKw = Array.isArray(seoKeywords) ? seoKeywords.join(' ').toLowerCase() : (seoKeywords || '').toLowerCase();

  // สร้าง Dictionary คำศัพท์อย่างละเอียด
  const categoryMap = [
      { name: "โทรศัพท์มือถือและอุปกรณ์เสริม", keywords: ['โทรศัพท์', 'มือถือ', 'สมาร์ทโฟน', 'iphone', 'samsung', 'oppo', 'vivo', 'xiaomi', 'เคส', 'สายชาร์จ', 'ฟิล์มกระจก', 'power bank', 'แบตสำรอง', 'หัวชาร์จ', 'สายเคเบิล', 'อะแดปเตอร์'] },
      { name: "แท็บเล็ต", keywords: ['แท็บเล็ต', 'tablet', 'ipad', 'galaxy tab', 'ไอแพด', 'ปากกาไอแพด', 'เคสไอแพด', 'ฟิล์มไอแพด'] },
      { name: "คอมพิวเตอร์และแล็ปท็อป", keywords: ['คอมพิวเตอร์', 'แล็ปท็อป', 'notebook', 'โน๊ตบุ๊ค', 'macbook', 'pc', 'เมาส์', 'คีย์บอร์ด', 'monitor', 'จอมอนิเตอร์', 'แฟลชไดร์ฟ', 'ฮาร์ดดิสก์', 'ssd', 'เมนบอร์ด', 'การ์ดจอ'] },
      { name: "นาฬิกาและแว่นตา", keywords: ['นาฬิกา', 'แว่นตา', 'แว่นกันแดด', 'watch', 'smartwatch', 'สมาร์ทวอทช์', 'apple watch', 'สายนาฬิกา', 'แว่นกรองแสง', 'แว่นสายตา', 'กรอบแว่น'] },
      { name: "เครื่องเสียง", keywords: ['หูฟัง', 'ลำโพง', 'earbuds', 'headphone', 'speaker', 'ไมโครโฟน', 'ไมค์', 'ไร้สาย', 'บลูทูธ', 'soundbar', 'แอมป์', 'เครื่องเล่นเพลง'] },
      { name: "กล้องและอุปกรณ์ถ่ายภาพ", keywords: ['กล้อง', 'camera', 'เลนส์', 'ขาตั้งกล้อง', 'เว็บแคม', 'webcam', 'gopro', 'โกโปร', 'โพลารอยด์', 'ไฟฉาย', 'ไฟสตู', 'กิมบอล', 'เมมโมรี่การ์ด'] },
      { name: "Gaming และอุปกรณ์เกม", keywords: ['gaming', 'เกม', 'nintendo', 'playstation', 'ps4', 'ps5', 'จอยสติ๊ก', 'แผ่นเกม', 'คอนโซล', 'เก้าอี้เกมมิ่ง', 'เมาส์เกมมิ่ง', 'คีย์บอร์ดเกมมิ่ง'] },
      { name: "เครื่องใช้ไฟฟ้าในบ้าน", keywords: ['ทีวี', 'แอร์', 'เตารีด', 'พัดลม', 'เครื่องดูดฝุ่น', 'ไมโครเวฟ', 'หม้อหุงข้าว', 'ตู้เย็น', 'เครื่องซักผ้า', 'เครื่องฟอกอากาศ', 'หม้อทอด', 'กระทะไฟฟ้า', 'เครื่องปั่น', 'กาน้ำร้อน'] },
      { name: "ผลิตภัณฑ์ดูแลผิว", keywords: ['เซรั่ม', 'ครีมกันแดด', 'โฟมล้างหน้า', 'มอยเจอร์ไรเซอร์', 'สลีปปิ้งมาสก์', 'โทนเนอร์', 'skincare', 'บำรุงหน้า', 'เจลแต้มสิว', 'คลีนซิ่ง', 'โลชั่น'] },
      { name: "ความงาม", keywords: ['ครีม', 'สบู่', 'แชมพู', 'น้ำหอม', 'เครื่องสำอาง', 'ดูแลผม', 'ลิป', 'รองพื้น', 'แป้งพัฟ', 'อายแชโดว์', 'บลัชออน', 'มาสคาร่า', 'ที่ดัดขนตา', 'ยาทาเล็บ'] },
      { name: "สุขภาพ", keywords: ['วิตามิน', 'อาหารเสริม', 'คอลลาเจน', 'เวย์โปรตีน', 'แมสก์', 'หน้ากากอนามัย', 'ยาสามัญ', 'เครื่องวัดความดัน', 'สมุนไพร', 'ผ้าพันแผล', 'เฝือก'] },
      { name: "เสื้อผ้าผู้หญิง", keywords: ['เสื้อผู้หญิง', 'สูทผู้หญิง', 'เดรส', 'กางเกงผู้หญิง', 'กระโปรง', 'ชุดชั้นในสตรี', 'ชุดว่ายน้ำผู้หญิง', 'เสื้อครอป', 'เสื้อสายเดี่ยว', 'บรา', 'กางเกงในสตรี'] },
      { name: "เสื้อผ้าผู้ชาย", keywords: ['เสื้อผู้ชาย', 'กางเกงผู้ชาย', 'เสื้อเชิ้ต', 'กางเกงยีนส์', 'เสื้อยืดผู้ชาย', 'แจ็คเก็ต', 'ชุดว่ายน้ำชาย', 'กางเกงในชาย', 'กางเกงสแล็ค', 'เสื้อโปโล'] },
      { name: "กระเป๋า", keywords: ['กระเป๋า', 'เป้', 'กระเป๋าสตางค์', 'bag', 'กระเป๋าสะพาย', 'กระเป๋าผ้า', 'กระเป๋าถือ', 'กระเป๋าคาดอก', 'ถุงผ้า'] },
      { name: "รองเท้าผู้หญิง", keywords: ['รองเท้าส้นสูง', 'รองเท้าแตะหญิง', 'รองเท้าผ้าใบสตรี', 'รองเท้าสตรี', 'รองเท้าผู้หญิง', 'สลิปเปอร์ผู้หญิง', 'คัทชูสตรี'] },
      { name: "รองเท้าผู้ชาย", keywords: ['รองเท้าหนัง', 'รองเท้าแตะชาย', 'รองเท้าผ้าใบชาย', 'รองเท้าบูท', 'รองเท้าคัทชูชาย', 'รองเท้าบุรุษ', 'รองเท้าผู้ชาย', 'ผ้าใบชาย'] },
      { name: "เครื่องประดับ", keywords: ['เครื่องประดับ', 'สร้อยคอ', 'แหวน', 'ต่างหู', 'กำไล', 'สร้อยข้อมือ', 'จิวเวลรี่', 'เข็มกลัด', 'กิ๊บ', 'ยางรัดผม'] },
      { name: "เครื่องใช้ในบ้าน", keywords: ['ผ้าปูที่นอน', 'กล่องเก็บของ', 'โคมไฟ', 'ม่าน', 'พรม', 'กระบอกน้ำ', 'ชั้นวางของ', 'เครื่องครัว', 'จานชาม', 'แก้วน้ำ', 'ไม้แขวนเสื้อ', 'หมอน', 'ผ้าห่ม'] },
      { name: "บ้านและสวน", keywords: ['ต้นไม้', 'เมล็ดพันธุ์', 'กระถาง', 'อุปกรณ์แต่งสวน', 'ปุ๋ย', 'บัวรดน้ำ', 'พลั่ว', 'เครื่องตัดหญ้า', 'สายยาง'] },
      { name: "อาหารและเครื่องดื่ม", keywords: ['อาหาร', 'เครื่องดื่ม', 'ขนม', 'กาแฟ', 'ชา', 'เบเกอรี่', 'อาหารแห้ง', 'น้ำแร่', 'ลูกอม', 'ช็อกโกแลต', 'โซดา', 'มาม่า', 'บะหมี่'] },
      { name: "แม่และเด็ก", keywords: ['ผ้าอ้อม', 'นมผง', 'ขวดนม', 'รถเข็นเด็ก', 'แพมเพิส', 'ทารก', 'เครื่องปั๊มนม', 'คนท้อง', 'ชุดคลุมท้อง', 'เป้อุ้มเด็ก'] },
      { name: "เสื้อผ้าเด็ก", keywords: ['เสื้อผ้าเด็ก', 'ชุดนอนเด็ก', 'กางเกงเด็ก', 'รองเท้าเด็ก', 'ถุงเท้าเด็ก', 'ชุดนักเรียน'] },
      { name: "ของเล่น สินค้างานอดิเรก", keywords: ['ของเล่น', 'บอร์ดเกม', 'ฟิกเกอร์', 'เลโก้', 'โมเดล', 'ตุ๊กตา', 'จิ๊กซอว์', 'การ์ดเกม', 'รูบิค', 'รถบังคับ'] },
      { name: "กีฬาและกิจกรรมกลางแจ้ง", keywords: ['กีฬา', 'ดัมเบล', 'เสื่อโยคะ', 'ลูกฟุตบอล', 'แร็คเกต', 'เต็นท์', 'อุปกรณ์แคมป์', 'วิ่ง', 'จักรยาน', 'สระว่ายน้ำ', 'รองเท้าสตั๊ด', 'ไม้แบด'] },
      { name: "การเดินทางและกระเป๋าเดินทาง", keywords: ['กระเป๋าเดินทาง', 'luggage', 'หมอนรองคอ', 'อุปกรณ์ท่องเที่ยว', 'กระเป๋าจัดระเบียบ'] },
      { name: "สัตว์เลี้ยง", keywords: ['อาหารสัตว์', 'อาหารหมา', 'อาหารแมว', 'ทรายแมว', 'ของเล่นสัตว์', 'ปลอกคอ', 'กรง', 'อาหารปลา', 'ห้องน้ำแมว', 'คอนโดแมว', 'ขนมหมา'] },
      { name: "ยานยนต์", keywords: ['ยานยนต์', 'รถยนต์', 'มอเตอร์ไซค์', 'อุปกรณ์แต่งรถ', 'น้ำมันเครื่อง', 'หมวกกันน็อค', 'ครอบพวงมาลัย', 'กล้องติดรถ', 'ยางรถ', 'ล้อแม็ก', 'อะไหล่รถ'] },
      { name: "หนังสือและสื่อบันเทิง", keywords: ['หนังสือ', 'นิยาย', 'การ์ตูน', 'นิตยสาร', 'มังงะ', 'วรรณกรรม', 'หนังสือเรียน', 'เตรียมสอบ', 'แบบฝึกหัด'] },
      { name: "ตั๋วและบัตรกำนัล", keywords: ['ตั๋ว', 'บัตรกำนัล', 'คูปอง', 'voucher', 'ตั๋วหนัง', 'บัตรเติมเงิน', 'บัตรคอนเสิร์ต', 'e-voucher'] },
      { name: "เครื่องเขียนและอุปกรณ์สำนักงาน", keywords: ['เครื่องเขียน', 'ปากกา', 'สมุด', 'ดินสอ', 'ยางลบ', 'แฟ้ม', 'กระดาษ', 'เครื่องคิดเลข', 'เก้าอี้สำนักงาน', 'โต๊ะทำงาน', 'กรรไกร', 'แม็ก'] },
      { name: "เสื้อผ้าแฟชั่น", keywords: ['เสื้อ', 'กางเกง', 'เดรส', 'รองเท้า', 'กระโปรง', 'หมวก', 'ถุงเท้า', 'ชุดนอน', 'แฟชั่น'] }
  ];

  let bestMatch = "ทั่วไป";
  let highestScore = 0;

  for (const category of categoryMap) {
      let score = 0;
      for (const keyword of category.keywords) {
          const kwLower = keyword.toLowerCase();
          
          // Weight 1: Exact phrase in title (Highest priority)
          if (textTitle.includes(kwLower)) {
              score += 3;
          }
          // Weight 2: Keyword in SEO tags
          if (textKw.includes(kwLower)) {
              score += 2;
          }
          // Weight 3: Keyword in description (Contextual, lowest priority to avoid noise)
          if (textDesc.includes(kwLower)) {
              score += 1;
          }
      }

      if (score > highestScore) {
          highestScore = score;
          bestMatch = category.name;
      }
  }

  // Debug (สามารถเปิดใช้ตอนทดสอบได้): console.log(`Categorizing "${title}" -> ${bestMatch} (Score: ${highestScore})`);
  return bestMatch;
}

app.post('/api/categorize', requireAuth, async (req, res) => {
  const { title, seo_keywords, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const category = generateLocalCategory(title, seo_keywords, description);
    res.json({ success: true, category });
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
