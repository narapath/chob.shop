require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ogs = require('open-graph-scraper');
const sharp = require('sharp');

const { supabase, supabaseAdmin } = require('./lib/supabase');
const { notifyGoogleIndexing, notifyBulkIndexing } = require('./indexingService');
const { deleteFromFacebook, deleteFromX, generateAICaption, postToFacebookGroups } = require('./socialMedia');
const { generateLocalSEO } = require('./lib/seo');
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
  origin: '*', // Allow all for API accessibility by the extension
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
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/images', express.static(path.join(__dirname, 'assets')));

app.use('/api/products', productsRouter);

// --- Supabase Settings Helpers ---
async function getSetting(key, defaultValue = '') {
  try {
    if (supabase) {
      const { data, error } = await supabase.from('settings').select('value').eq('key', key).single();
      if (!error && data) return data.value;
    }
  } catch (err) {
    console.error(`Error fetching setting ${key}:`, err);
  }
  return process.env[key] || defaultValue;
}

async function setSetting(key, value) {
  try {
    if (supabase) {
      const { error } = await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) return { success: false, error: error.message };
    }
    // Also update in-memory for immediate use
    process.env[key] = value;
    return { success: true };
  } catch (err) {
    console.error(`Error saving setting ${key}:`, err);
    return { success: false, error: err.message };
  }
}

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
app.get('/api/settings', requireAuth, async (req, res) => {
  const mask = (val) => {
    if (!val) return '';
    if (val.length <= 10) return '***';
    return val.substring(0, 6) + '...' + val.substring(val.length - 6);
  };

  const FB_TARGET_GROUPS = await getSetting('FB_TARGET_GROUPS', '[]');

  res.json({
    FB_PAGE_ACCESS_TOKEN: mask(process.env.FB_PAGE_ACCESS_TOKEN),
    THREADS_USER_ID: process.env.THREADS_USER_ID || '',
    THREADS_ACCESS_TOKEN: mask(process.env.THREADS_ACCESS_TOKEN),
    GEMINI_API_KEY: mask(process.env.GEMINI_API_KEY),
    SUPABASE_URL: mask(process.env.SUPABASE_URL),
    SUPABASE_KEY: mask(process.env.SUPABASE_KEY),
    CARD_THEME: process.env.CARD_THEME || 'theme-white',
    STATS_THEME: process.env.STATS_THEME || 'stats-premium',
    FB_TARGET_GROUPS: FB_TARGET_GROUPS
  });
});

// GET Facebook Groups (Public/Semi-public for extension)
app.get('/api/fb-groups', async (req, res) => {
  try {
    const groupsJson = await getSetting('FB_TARGET_GROUPS', '[]');
    const groups = JSON.parse(groupsJson);
    res.json({ success: true, groups });
  } catch (err) {
    res.json({ success: false, groups: [] });
  }
});

// PUT update settings (writes to DB and falls back to .env)
app.put('/api/settings', requireAuth, async (req, res) => {
  try {
    const allowedKeys = [
      'FB_PAGE_ACCESS_TOKEN', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN',
      'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY',
      'CARD_THEME', 'STATS_THEME', 'FB_TARGET_GROUPS',
      'FB_EMAIL', 'FB_PASSWORD'
    ];
    const updates = req.body;
    let updatedCount = 0;
    let dbErrorMsg = null;

    for (const key of allowedKeys) {
      if (updates[key] !== undefined) {
        const value = updates[key];
        const resSet = await setSetting(key, value);
        if (!resSet.success) dbErrorMsg = resSet.error;
        updatedCount++;
      }
    }

    // Attempt to persist to .env as well if not on Vercel
    const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_URL;
    if (!isVercel) {
      try {
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        for (const key of allowedKeys) {
          if (updates[key] !== undefined) {
            const line = `${key}='${updates[key]}'`;
            const regex = new RegExp(`^${key}=.*$`, 'm');
            if (envContent.match(regex)) {
              envContent = envContent.replace(regex, () => line);
            } else {
              envContent = envContent.trim() + `\n${line}\n`;
            }
          }
        }
        fs.writeFileSync(envPath, envContent, 'utf-8');
      } catch (e) {
        console.error('Failed to sync .env:', e);
      }
    }

    res.json({ success: true, updatedCount, isVercel, dbPersistence: !dbErrorMsg, dbErrorMsg });
  } catch (err) {
    console.error('Settings update error:', err);
    res.status(500).json({ error: 'Failed to update settings', detail: err.message });
  }
});

// --- Bot Dashboard API ---

// POST Bot Heartbeat (Public, for the extension)
// Supports both legacy /api/heartbeat and new /api/bots/heartbeat
const handleHeartbeat = async (req, res) => {
  // Normalize fields between legacy extension (name, logs) and current schema (bot_name, new_logs)
  let bot_name = (req.body.bot_name || req.body.name || "").trim();
  const status = req.body.status;
  const stats = req.body.stats || {
    postCount: req.body.postCount,
    lastActive: req.body.lastActive,
    ping: req.body.ping
  };

  // Prevent JSONB bloat: Cap history to last 30 entries and strip large images (base64)
  if (stats.history && Array.isArray(stats.history)) {
    stats.history = stats.history.slice(0, 30).map(entry => {
      if (entry.image && entry.image.length > 1000) {
        const { image, ...rest } = entry;
        return rest;
      }
      return entry;
    });
  }

  const browser_type = req.body.browser_type;
  const version = req.body.version;
  const ack_command_ts = req.body.ack_command_ts;
  const new_logs = req.body.new_logs || req.body.logs;

  const payloadSize = JSON.stringify(req.body).length;
  console.log(`🤖 [Heartbeat] Received from "${bot_name}" (Status: ${status}, Logs: ${new_logs ? new_logs.length : 0}, Size: ${(payloadSize / 1024).toFixed(1)}KB)`);

  if (!bot_name) {
    return res.status(400).json({ success: false, error: 'bot_name is required' });
  }

  // Use supabaseAdmin if available, otherwise fall back to supabase
  const db = supabaseAdmin || supabase;
  if (!db) {
    console.error('❌ [Heartbeat] No Supabase client available!');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  console.log(`🤖 [Heartbeat] Using ${supabaseAdmin ? 'supabaseAdmin' : 'supabase (fallback)'} client`);

  try {
    const { data, error } = await db
      .from('extension_bots')
      .upsert({
        bot_name,
        browser_type,
        status,
        stats,
        version,
        last_heartbeat: new Date().toISOString()
      }, { onConflict: 'bot_name' })
      .select();

    if (error) {
      console.error(`❌ [Heartbeat DB Error]`, error);
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return res.status(500).json({
          success: false,
          error: "DATABASE_TABLE_MISSING: ลืมคัดลอก SQL ใน schema.sql ไปรันใน Supabase หรือเปล่า? (ไม่พบตาราง extension_bots)"
        });
      }
      throw error;
    }

    const currentBot = data[0];
    const pendingCommand = currentBot?.command || {};

    // Logs are now embedded in stats.history — no insert to extension_logs needed

    // Clear command only if it was acknowledged by the bot
    if (ack_command_ts && pendingCommand.timestamp && ack_command_ts === pendingCommand.timestamp) {
      console.log(`✅ [Heartbeat] Command acknowledged by "${bot_name}". Clearing...`);
      await db.from('extension_bots').update({ command: {} }).eq('bot_name', bot_name);
      // Return empty object for command since it's now acknowledged
      return res.json({ success: true, bot: currentBot, command: {} });
    }

    res.json({ success: true, bot: currentBot, command: pendingCommand });
  } catch (err) {
    console.error(`❌ [Heartbeat Server Error]`, err);
    res.status(500).json({ success: false, error: err.message });
  }
};

app.post('/api/bots/heartbeat', handleHeartbeat);
app.post('/api/heartbeat', handleHeartbeat);

// POST Send Command to Bot (Protected)
app.post('/api/bots/command', requireAuth, async (req, res) => {
  const { bot_name, action, interval } = req.body;

  console.log(`🎮 [Command] Setting "${action}" for bot "${bot_name}" (Interval: ${interval})`);

  if (!bot_name || !action) {
    return res.status(400).json({ success: false, error: 'bot_name and action are required' });
  }

  try {
    const db = supabaseAdmin || supabase;

    // Normalize name: trim and remove potential zero-width/invisible chars
    const targetBotName = bot_name.trim();

    const { data, error } = await db
      .from('extension_bots')
      .update({
        command: { action, interval, timestamp: new Date().toISOString() }
      })
      .eq('bot_name', targetBotName)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Bot not found' });
    }

    res.json({ success: true, bot: data[0] });
  } catch (err) {
    console.error(`❌ [Command Error]`, err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET All Bots (Public for the dashboard)
app.get('/api/bots', async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not configured' });
    }

    // Select only essential fields for the dashboard, avoid pulling full stats blob
    const { data, error } = await db
      .from('extension_bots')
      .select('id, bot_name, browser_type, status, last_heartbeat, stats, command, version')
      .order('last_heartbeat', { ascending: false });

    if (error) throw error;

    // Trim heavy history from the listing response to keep it fast
    const lightBots = (data || []).map(bot => {
      const { history, ...lightStats } = (bot.stats || {});
      return { ...bot, stats: lightStats };
    });

    res.json({ success: true, bots: lightBots });
  } catch (err) {
    console.error('Fetch bots error:', err);
    res.status(500).json({ success: false, error: err.message, bots: [] });
  }
});

// GET Bot Post History (from stats.history embedded in extension_bots)
app.get('/api/bots/history', async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    const { bot_name, limit = 30 } = req.query;

    // Only select bot_name and the stats column to minimize data transfer
    let query = db.from('extension_bots').select('bot_name, stats');
    if (bot_name) {
      query = query.eq('bot_name', bot_name);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Merge all bots' history, tag with bot_name, sort by time
    let allHistory = [];
    (data || []).forEach(bot => {
      const history = (bot.stats?.history || []).slice(0, 30); // Safety cap
      history.forEach(entry => {
        allHistory.push({ ...entry, bot_name: bot.bot_name });
      });
    });

    allHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    allHistory = allHistory.slice(0, parseInt(limit));

    res.json({ success: true, history: allHistory });
  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ success: false, error: err.message, history: [] });
  }
});

// DELETE Bot (Admin only)
app.delete('/api/bots', requireAuth, async (req, res) => {
  try {
    const db = supabaseAdmin || supabase;
    const { bot_name } = req.body;

    if (!bot_name) {
      return res.status(400).json({ success: false, error: 'bot_name is required' });
    }

    console.log(`🗑️ [Delete] Removing bot "${bot_name}"`);

    const { error } = await db.from('extension_bots').delete().eq('bot_name', bot_name);

    if (error) throw error;
    res.json({ success: true, message: `Bot ${bot_name} deleted successfully` });
  } catch (err) {
    console.error('Delete bot error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- POST categorize via Local AI ---
app.post('/api/categorize', requireAuth, async (req, res) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const category = categoryMapper.categorize(title);
    res.json({ success: true, category });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- POST generate SEO content via Local AI (Unsaved) ---
app.post('/api/ai/seo', requireAuth, async (req, res) => {
  const { title, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  try {
    const seoData = generateLocalSEO(title, category || 'ทั่วไป', 0);
    res.json({
      success: true,
      seo_keywords: seoData.seo_keywords,
      seo_description: seoData.seo_description,
      seo_title: seoData.seo_title
    });
  } catch (err) {
    console.error('Local SEO Gen Error:', err);
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
