require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const {
  postToFacebook, postToInstagram, postToX, postToThreads,
  deleteFromFacebook, deleteFromX, generateAICaption
} = require('./socialMedia');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for secure cookies/headers behind reverse proxy (DirectAdmin)
app.set('trust proxy', 1);
const PRODUCTS_FILE = path.join(__dirname, 'products.json');

// --- Security Middleware ---
// 1. Helmet for secure headers
app.use(helmet({
  contentSecurityPolicy: false, // Set to false if you have external images/scripts from many domains
}));

// 2. Rate Limiting to prevent brute-force
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

// --- Basic Auth Config from .env ---
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'vibe_secret_token_12345';

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --- [SECURITY] Restricted Static File Serving ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'assets'))); // Alias for safety

// Ensure products.json exists
if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf-8');
}

// --- Auth Middleware ---
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${AUTH_TOKEN}`) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// --- API Routes ---

// Login Endpoint (Apply Rate Limiting)
app.post('/api/login', apiLimiter, (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, token: AUTH_TOKEN });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// GET all products (Public)
app.get('/api/products', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read products' });
  }
});

// POST a new product (Protected)
app.post('/api/products', requireAuth, (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const newProduct = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: req.body.title || 'Untitled Product',
      price: req.body.price || '0',
      originalPrice: req.body.originalPrice || '',
      discount: req.body.discount || '',
      image: req.body.image || '',
      affiliateUrl: req.body.affiliateUrl || '',
      category: req.body.category || 'ทั่วไป',
      description: req.body.description || '',
      clicks: 0,
      createdAt: new Date().toISOString()
    };
    products.unshift(newProduct);
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
    res.json({ success: true, product: newProduct });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add product' });
  }
});

// BULK POST new products (Protected - used for CSV Import)
app.post('/api/products/bulk', requireAuth, async (req, res) => {
  try {
    const { items, autoPostFB, autoPostIG, autoPostX, autoPostThreads, toggleAI } = req.body;
    const shouldPost = autoPostFB || autoPostIG || autoPostX || autoPostThreads;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Expected an array of products' });
    }

    const itemsToAdd = items.map(p => ({
      ...p,
      id: p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7), // Ensure unique ID
      clicks: 0,
      createdAt: new Date().toISOString() // Add createdAt for new items
    }));

    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const updatedProducts = [...itemsToAdd, ...products]; // Prepend new items
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(updatedProducts, null, 2), 'utf-8');

    // Background Social Media Posting
    if (shouldPost) {
      console.log('🚀 Starting background social media job...');
      (async () => {
        const siteUrl = process.env.SITE_URL || 'https://chob.shop';
        for (const product of itemsToAdd) {
          const logMsg = (m) => fs.appendFileSync('debug_social.log', `[${new Date().toISOString()}] ${m}\n`);
          logMsg(`📝 Processing social media for: ${product.title}`);

          let aiCaption = null;
          logMsg(`🔍 AI Toggle Status: ${toggleAI}`);
          if (toggleAI) {
            logMsg(`✨ Generating AI Reviewer caption for: ${product.title}`);
            aiCaption = await generateAICaption(product);
            logMsg(`📝 AI Caption Result: ${aiCaption ? aiCaption.substring(0, 100) + '...' : 'NULL'}`);
          }

          let fbPostId = null;
          if (autoPostFB) {
            logMsg(`📘 Facebook: Attempting post...`);
            const fbRes = await postToFacebook(product, siteUrl, toggleAI, aiCaption);
            if (fbRes.success) {
              logMsg(`✅ Facebook: Post success via ${fbRes.method}`);
              if (fbRes.postId) fbPostId = fbRes.postId;
            } else {
              logMsg(`❌ Facebook: Post failed - ${fbRes.reason || 'Unknown error'}`);
            }
          }

          if (autoPostIG) {
            logMsg(`📷 Instagram: Attempting post...`);
            const igRes = await postToInstagram(product, siteUrl, toggleAI, aiCaption);
            logMsg(igRes.success ? `✅ Instagram: Post success` : `❌ Instagram: Post failed`);
          }
          let xPostId = null;
          if (autoPostX) {
            logMsg(`✨ X: Attempting post...`);
            const xRes = await postToX(product, siteUrl, toggleAI, aiCaption);
            if (xRes.success) {
              logMsg(`✅ X: Post success via API`);
              if (xRes.tweetId) xPostId = xRes.tweetId;
            } else {
              logMsg(`❌ X: Post failed - ${xRes.reason || 'Unknown error'}`);
            }
          }
          let threadsPostId = null;
          if (autoPostThreads) {
            logMsg(`🧵 Threads: Attempting post...`);
            const threadsRes = await postToThreads(product, siteUrl, toggleAI, aiCaption);
            if (threadsRes.success) {
              logMsg(`✅ Threads: Post success via API`);
              if (threadsRes.threadId) threadsPostId = threadsRes.threadId;
            } else {
              logMsg(`❌ Threads: Post failed - ${threadsRes.reason || 'Unknown error'}`);
            }
          }

          // Update product with Social IDs if they exist
          if (fbPostId || xPostId || threadsPostId) {
            try {
              const currentProducts = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
              const pIdx = currentProducts.findIndex(p => p.id === product.id);
              if (pIdx !== -1) {
                if (fbPostId) currentProducts[pIdx].fbPostId = fbPostId;
                if (xPostId) currentProducts[pIdx].xPostId = xPostId;
                if (threadsPostId) currentProducts[pIdx].threadsPostId = threadsPostId;
                fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(currentProducts, null, 2), 'utf-8');
                console.log(`💾 Stored Social IDs for "${product.title}"`);
              }
            } catch (e) {
              console.error('Failed to update Social IDs:', e.message);
            }
          }
          // Delay to avoid rate limits between products
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

// PUT update a product (Protected)
app.put('/api/products/:id', requireAuth, (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });

    products[idx] = { ...products[idx], ...req.body, id: products[idx].id };
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
    res.json({ success: true, product: products[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// DELETE a product (Protected)
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const productToDelete = products.find(p => p.id === req.params.id);

    // Sync deletion with Social Media if ID exists
    if (productToDelete) {
      if (productToDelete.fbPostId) {
        deleteFromFacebook(productToDelete.fbPostId).then(syncRes => {
          console.log(`🗑️ Sync FB deletion for ${productToDelete.fbPostId}:`, syncRes.success ? 'Success' : 'Failed');
        }).catch(e => console.error('FB Sync delete error:', e.message));
      }
      if (productToDelete.xPostId) {
        deleteFromX(productToDelete.xPostId).then(syncRes => {
          console.log(`🗑️ Sync X deletion for ${productToDelete.xPostId}:`, syncRes.success ? 'Success' : 'Failed');
        }).catch(e => console.error('X Sync delete error:', e.message));
      }
    }

    products = products.filter(p => p.id !== req.params.id);
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// BULK DELETE products (Protected)
app.post('/api/products/bulk-delete', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Expected an array of product IDs' });
    }

    let products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const productsToDelete = products.filter(p => ids.includes(p.id));

    // Cleanup Social Media posts
    productsToDelete.forEach(p => {
      if (p.fbPostId) {
        deleteFromFacebook(p.fbPostId).then(syncRes => {
          console.log(`🗑️ Sync FB bulk deletion for ${p.fbPostId}:`, syncRes.success ? 'Success' : 'Failed');
        }).catch(e => console.error('FB Sync bulk delete error:', e.message));
      }
      if (p.xPostId) {
        deleteFromX(p.xPostId).then(syncRes => {
          console.log(`🗑️ Sync X bulk deletion for ${p.xPostId}:`, syncRes.success ? 'Success' : 'Failed');
        }).catch(e => console.error('X Sync bulk delete error:', e.message));
      }
    });

    const updatedProducts = products.filter(p => !ids.includes(p.id));
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(updatedProducts, null, 2), 'utf-8');

    res.json({ success: true, count: productsToDelete.length });
  } catch (err) {
    console.error('Bulk delete error:', err);
    res.status(500).json({ error: 'Failed to bulk delete products' });
  }
});

// POST increment click count (Public)
app.post('/api/products/:id/click', (req, res) => {
  try {
    const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf-8'));
    const idx = products.findIndex(p => p.id === req.params.id);

    if (idx !== -1) {
      products[idx].clicks = (Number(products[idx].clicks) || 0) + 1;
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2), 'utf-8');
      res.json({ success: true, clicks: products[idx].clicks });
    } else {
      res.status(404).json({ error: 'Product not found' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to record click' });
  }
});

// --- API Settings Management ---

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
  });
});

// PUT update settings (writes to .env and hot-reloads)
app.put('/api/settings', requireAuth, (req, res) => {
  try {
    const allowedKeys = ['FB_PAGE_ACCESS_TOKEN', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN', 'GEMINI_API_KEY'];
    const updates = req.body;

    // Read current .env file
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf-8');

    let updatedCount = 0;
    for (const key of allowedKeys) {
      if (updates[key] !== undefined && updates[key] !== '') {
        // Update or add the key in .env
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${updates[key]}`);
        } else {
          envContent += `\n${key}=${updates[key]}`;
        }
        // Hot-reload into process.env
        process.env[key] = updates[key];
        updatedCount++;
      }
    }

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`⚙️ Settings updated: ${updatedCount} key(s) changed`);
    res.json({ success: true, updatedCount });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🛍️  Chob.Shop server running at http://localhost:${PORT}`);
  console.log(`📋  Admin panel: http://localhost:${PORT}/admin.html`);
});
