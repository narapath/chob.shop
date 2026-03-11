require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const ogs = require('open-graph-scraper');
const {
  postToFacebook, postToInstagram, postToX, postToThreads,
  deleteFromFacebook, deleteFromX, generateAICaption, categorizeProduct
} = require('./socialMedia');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for secure cookies/headers behind reverse proxy (DirectAdmin)
app.set('trust proxy', 1);

// --- Initialize Supabase ---
let supabaseUrl = process.env.SUPABASE_URL || '';
let supabaseKey = process.env.SUPABASE_KEY || '';
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

    let query = supabase.from('products').select('*', { count: 'exact' }).order('date', { ascending: false });

    const { page, limit, category, search } = req.query;

    if (category && category !== 'all' && category !== 'ทั้งหมด') {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum - 1;

      query = query.range(startIndex, endIndex);

      const { data, error, count } = await query;
      if (error) throw error;

      return res.json({
        products: data,
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum)
      });
    }

    // Unpaginated response (fallback for admin panel or no pagination request)
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);

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

    const { data, error } = await supabase.from('products').select('category');
    if (error) throw error;

    const counts = { all: data.length };

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
      twitterPostId: ''
    };

    const { error } = await supabase.from('products').insert([newProduct]);
    if (error) throw error;

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
        twitterPostId: null
      };
    });

    const { error } = await supabase.from('products').insert(itemsToAdd);
    if (error) throw error;

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
    SUPABASE_URL: formatOutput(process.env.SUPABASE_URL),
    SUPABASE_KEY: formatOutput(process.env.SUPABASE_KEY),
    CARD_THEME: process.env.CARD_THEME || 'theme-white'
  });
});

app.put('/api/settings', requireAuth, (req, res) => {
  try {
    const allowedKeys = ['FB_PAGE_ACCESS_TOKEN', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY', 'CARD_THEME'];
    const updates = req.body;

    const SECRET_MARKER = '●●●●●●●●';
    let updatedCount = 0;
    for (const key of allowedKeys) {
      if (updates[key] !== undefined && updates[key] !== '' && updates[key] !== SECRET_MARKER) {
        process.env[key] = updates[key];
        updatedCount++;
      }
    }

    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      try {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        for (const key of allowedKeys) {
          if (updates[key] !== undefined && updates[key] !== '' && updates[key] !== SECRET_MARKER) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (envContent.match(regex)) {
              envContent = envContent.replace(regex, `${key}=${updates[key]}`);
            } else {
              envContent += `\n${key}=${updates[key]}`;
            }
          }
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
      } catch (fileErr) {
        console.warn('Could not persist to .env file:', fileErr.message);
      }
    }

    // Hot-reload Supabase if keys changed
    if (updates.SUPABASE_URL || updates.SUPABASE_KEY) {
      supabaseUrl = process.env.SUPABASE_URL || '';
      supabaseKey = process.env.SUPABASE_KEY || '';
      if (supabaseUrl && supabaseKey) {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("🟢 Supabase client re-initialized with new keys.");
      }
    }

    console.log(`⚙️ Settings updated: ${updatedCount} key(s) changed`);
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
