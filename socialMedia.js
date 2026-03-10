const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const OAuth = require('oauth-1.0a');

// ============================================================
// Social Media Posting Module for Chob.Shop
// - Facebook: Graph API (Preferred) or Puppeteer (Fallback)
// - Instagram: via Graph API
// - X (Twitter): via OAuth 1.0a API
// ============================================================

const COOKIES_PATH = path.join(__dirname, 'fb_cookies.json');

/**
 * Generate relevant hashtags based on product title and category.
 */
function generateHashtags(product) {
    const brandHashtags = ['#ChobShop']; // Removed #ShopeeAffiliate as requested
    const dynamicHashtags = new Set();

    // Add category as hashtag
    if (product.category && product.category !== 'ทั่วไป') {
        dynamicHashtags.add(`#${product.category.replace(/\s+/g, '')}`);
    }

    const title = product.title || '';

    // 1. Detect Brands/Models (Common ones for this store)
    const brands = [
        'apple', 'iphone', 'ipad', 'macbook', 'samsung', 'oppo', 'vivo', 'xiaomi', 'redmi',
        'marshall', 'garmin', 'casio', 'nike', 'adidas', 'sony', 'panasonic', 'sharp',
        'tefal', 'philips', 'dyson', 'uneed', 'f607'
    ];

    brands.forEach(b => {
        const regex = new RegExp(`\\b${b}\\b`, 'i');
        if (title.match(regex)) {
            // Capitalize first letter for aesthetic
            const formatted = b.charAt(0).toUpperCase() + b.slice(1);
            dynamicHashtags.add(`#${formatted}`);
        }
    });

    // 2. Extract keywords from title (specific features/promos)
    const keywords = ['ลดราคา', 'โปรโมชั่น', 'รีวิว', 'ของมันต้องมี', 'sale', 'promotion', 'fashion', 'gadget', 'home', 'powerbank', 'พรีเมียม', 'ราคาถูก'];

    keywords.forEach(kw => {
        if (title.toLowerCase().includes(kw)) {
            dynamicHashtags.add(`#${kw.replace(/\s+/g, '')}`);
        }
    });

    // 3. Fallback generic tags if still too few
    if (dynamicHashtags.size < 2) {
        dynamicHashtags.add('#ของดีบอกต่อ');
        dynamicHashtags.add('#รีวิวของดี');
    }

    return [...brandHashtags, ...dynamicHashtags].join(' ');
}

/**
 * Generate an AI-powered reviewer-style caption using Google Gemini API.
 * Falls back to a high-quality template if the API key is missing or fails.
 */
async function generateAICaption(product) {
    const apiKey = process.env.GEMINI_API_KEY;
    const title = product.title || '';
    const price = Number(product.price).toLocaleString();
    const brand = title.split(' ')[0]; // Simple brand extraction

    if (!apiKey) {
        // High-quality template fallback (Reviewer Style)
        const templates = [
            `🌟 บอกพิกัดของดี! ${title} ตัวนี้คือที่สุดดคุ้มมากกก\n💰 ราคาแค่ ฿${price} เท่านั้น (ราคาดีมากก)\n🛒 ใครหาอยู่รีบเลยย กดที่ลิ้งค์ได้เลยน้าา`,
            `🔥 ป้ายยาแรงๆ! ${title} ของมันต้องมีจริงๆ ทุกคนน\n💸 ค่าตัวน้องอยู่ที่ ฿${price} (คุ้มค่าตัวสุดๆ)\n📍 พิกัดความปังจิ้มเล้ยย`,
            `✨ รีวิวสั้นๆ: ${title} ใช้แล้วชอบมากกก ดีไซน์สวย ใช้งานดี\n💵 ราคา ฿${price} (ราคานี้คือต้องจัดแล้วว)\n🔗 สนใจจิ้มตรงนี้ได้เลยย`,
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }

    try {
        const prompt = `คุณคือ Blogger นักรีวิวสินค้าสาย "ป้ายยา" ตัวแม่ระดับพระกาฬ ที่เขียนโพสต์ได้น่าดึงดูด เป็นธรรมชาติ และไม่ซ้ำซากจำเจ (ห้ามใช้แพทเทิร์นเดิมๆ ทุกโพสต์เด็ดขาด)
        
ข้อมูลสินค้า:
- ชื่อสินค้า: ${title}
- ราคา: ฿${price}
        
คำสั่งพิเศษสำหรับการเขียนโพสต์นี้:
1. การเปิดเรื่อง (Hook): ให้สุ่มเลือกสไตล์การเปิดเรื่องแบบใดแบบหนึ่ง (เช่น ร้องกรี๊ด, เล่าปัญหาชีวิต, กระซิบของดี, ประกาศโปรลับ, หรือท้าให้ลอง) ให้แต่ละโพสต์เริ่มต้นไม่เหมือนกัน
2. สไตล์ภาษา: ใช้ภาษาพูดวัยรุ่น เป็นกันเอง ดึงดูดความสนใจ คล้ายกำลังเมาท์มอยยาป้ายเพื่อนสนิท
3. การรีวิว: ดึงจุดเด่นจากชื่อสินค้ามาอวยแบบเนียนๆ ว่าทำไม "ของมันต้องมี" หรือ "ไม่มีคือพลาดมาก"
4. ความคุ้มค่า: เน้นย้ำราคา ${price} บาท ว่ามันคุ้มค่า หรือถูกเหมือนแจกฟรี
5. Call to Action (CTA): จบประโยคด้วยการบิ๊วให้คนรีบกดลิงก์ด่วนๆ (แต่ไม่ต้องใส่ลิงก์หรือ Hashtag มาให้ เรามีระบบใส่ให้เอง)
6. Emojis: ใส่ Emoji ที่เข้ากับบริบทให้ดูน่ารักและมีสีสัน แต่อย่าใส่จุดเดิมๆ ซ้ำกัน
        
กฎเหล็ก: คิดให้สร้างสรรค์ที่สุด ห้ามเขียนออกมาเป็นหุ่นยนต์ และให้ความรู้สึกรีวิวจริงๆ

เขียนโพสต์สำหรับสินค้านี้มา 1 โพสต์สั้นๆ (ไม่เกิน 4-5 บรรทัด):`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return aiText || "ลองดูนี่! " + title + " ราคา " + price + " บาท ดีมากกก";
    } catch (err) {
        const errorMsg = err.response?.data?.error?.message || err.message;
        console.error('⚠️ Gemini AI Error:', errorMsg);
        // Log to debug file if we are in bulk mode
        if (fs.existsSync('debug_social.log')) {
            fs.appendFileSync('debug_social.log', `[${new Date().toISOString()}] ❌ Gemini API Error: ${errorMsg}\n`);
        }
        return `🌟 แนะนำเลย! ${title} ราคา ฿${price} คุ้มสุดๆ ต้องจัดแล้วว`;
    }
}

/**
 * Build a promotional post message from a product object.
 */
function buildPostContent(product, siteUrl, useAI = false, aiCaption = null) {
    const price = Number(product.price).toLocaleString();

    let content = "";
    if (useAI && aiCaption) {
        content = aiCaption;
    } else {
        const lines = [
            `🛍️ ${product.title}`,
            `💰 ราคา ฿${price}`,
        ];
        if (product.discount) {
            lines.push(`🔥 ลด ${product.discount}%`);
        }
        if (product.category) {
            lines.push(`📂 หมวด: ${product.category}`);
        }
        content = lines.join('\n');
    }

    const footer = [
        '',
        product.affiliateUrl ? `🔗 ${product.affiliateUrl}` : `🔗 ${siteUrl}`,
        '',
        generateHashtags(product)
    ];

    return content + footer.join('\n');
}

// ============================================================
// Cookie helpers
// ============================================================

async function saveCookies(page) {
    const cookies = await page.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

async function loadCookies(page) {
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
        await page.setCookie(...cookies);
        return true;
    }
    return false;
}

// ============================================================
// Facebook Page Posting (Graph API with Browser Fallback)
// ============================================================

async function postToFacebook(product, siteUrl, useAI = false, aiCaption = null) {
    const pageId = process.env.FB_PAGE_ID || '1020446574489867';
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    const logMsg = (m) => fs.appendFileSync('debug_social.log', `[${new Date().toISOString()}] ${m}\n`);

    // --- Try Graph API first (Preferred) ---
    if (accessToken) {
        logMsg(`📘 Facebook: Posting "${product.title}" via Graph API...`);
        const message = buildPostContent(product, siteUrl, useAI, aiCaption);
        try {
            const res = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
                message,
                link: product.affiliateUrl || siteUrl,
                access_token: accessToken,
            });
            logMsg(`✅ Facebook: Posted via API — Post ID: ${res.data.id}`);
            return { success: true, method: 'api', postId: res.data.id };
        } catch (err) {
            const msg = err.response?.data?.error?.message || err.message;
            logMsg(`❌  Facebook: Graph API failed — ${msg}`);
            return { success: false, method: 'api', reason: msg };
        }
    } else {
        logMsg(`❌ Facebook: Graph API failed — Missing FB_PAGE_ACCESS_TOKEN`);
        return { success: false, method: 'api', reason: 'Missing FB_PAGE_ACCESS_TOKEN' };
    }
}

// Ensure the old browser logic is fully isolated or removed (it's skipped now)
async function _legacyBrowserFallback() {

    // Use persistent user data dir so login carries over between runs
    const userDataDir = path.join(__dirname, '.chrome_profile');

    let browser;
    try {
        const browser = await puppeteer.launch({
            headless: 'new', // Using 'new' headless mode for better performance
            userDataDir: userDataDir,
            defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
            ],
        });

        const page = await browser.newPage();
        // Set extra headers to be sure
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        });

        // Check if already logged in by visiting mbasic
        await page.goto('https://mbasic.facebook.com/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });
        await new Promise((r) => setTimeout(r, 1000));

        // If we see a login form, auto-login
        const loginForm = await page.$('input[name="email"]');
        if (loginForm) {
            const fbEmail = process.env.FB_EMAIL;
            const fbPassword = process.env.FB_PASSWORD;
            if (!fbEmail || !fbPassword) {
                console.log('⚠️  Not logged in and no FB_EMAIL/FB_PASSWORD in .env');
                await browser.close();
                return { success: false, reason: 'missing_credentials' };
            }
            logMsg('   Logging in to mbasic.facebook.com...');
            await page.type('input[name="email"]', fbEmail, { delay: 30 });
            await page.type('input[name="pass"]', fbPassword, { delay: 30 });

            // Submit the login form
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                page.keyboard.press('Enter'),
            ]);
            await new Promise((r) => setTimeout(r, 2000));

            // Check if login was successful
            const stillLoginPage = await page.$('input[name="email"]');
            if (stillLoginPage) {
                logMsg('❌ Facebook login failed. Check credentials.');
                await browser.close();
                return { success: false, reason: 'login_failed' };
            }
            logMsg('✅ Logged in successfully!');
        } else {
            logMsg('   Already logged in.');
        }

        // Go to mbasic composer for the page
        const composerUrl = `https://mbasic.facebook.com/${pageId}?v=composer`;
        console.log(`   Navigating to: ${composerUrl}`);
        await page.goto(composerUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 2000));

        // Check for "Switch Profile" button if we are on the page as a user
        const pageContent = await page.content();
        const hasSwitch = pageContent.includes('เปลี่ยน') || pageContent.includes('Switch');

        if (hasSwitch) {
            logMsg('   Detecting potential profile switch requirement...');
            const btns = await page.$$('div[role="button"], span, a');
            for (const btn of btns) {
                try {
                    const text = await page.evaluate(el => el.innerText, btn);
                    if (text && (text.trim() === 'เปลี่ยน' || text.trim() === 'Switch')) {
                        logMsg('   Switching to Page profile...');
                        await btn.click();
                        await new Promise(r => setTimeout(r, 10000)); // Wait longer for switch
                        break;
                    }
                } catch (e) { }
            }
        }

        // Build the message
        const message = buildPostContent(product, siteUrl, useAI, aiCaption);

        // Find textarea (Multi-platform selectors)
        const textareaSelectors = [
            'textarea[name="xc_message"]', // mbasic
            'textarea[name="body"]',       // mbasic alternative
            'textarea[name="message"]',    // mbasic/touch
            'div[role="textbox"]',         // modern mobile/desktop modal
            'div[aria-label^="คุณคิดอะไรอยู่"]', // modern mobile label
            'div[aria-label^="What\'s on your mind"]',
            'textarea',                    // generic fallback
        ];

        // Check for "What's on your mind" button that opens the modern modal
        const openerSelectors = [
            'div[aria-label^="คุณคิดอะไรอยู่"]',
            'div[aria-label^="What\'s on your mind"]',
            'span:contains("แชร์ความคิด")',
            'div[role="button"][aria-label*="โพสต์"]',
        ];

        for (const sel of openerSelectors) {
            try {
                const opener = await page.$(sel);
                if (opener) {
                    logMsg(`   Opening modern composer modal: ${sel}`);
                    await opener.click();
                    await new Promise(r => setTimeout(r, 3000)); // Longer wait for modal
                    break;
                }
            } catch (e) { }
        }

        let textarea = null;
        for (const sel of textareaSelectors) {
            textarea = await page.$(sel);
            if (textarea) {
                logMsg(`   Found textarea/textbox: ${sel}`);
                break;
            }
        }

        if (!textarea) {
            logMsg('⚠️  Cannot find textarea on mbasic/modern.');
            await page.screenshot({ path: 'debug_no_textarea.png' });
            logMsg('   Page title: ' + (await page.title()));
            await browser.close();
            return { success: false, reason: 'textarea_not_found' };
        }

        // Type the message
        logMsg('   Typing message...');
        await textarea.click();
        await textarea.type(message, { delay: 15 });
        await new Promise((r) => setTimeout(r, 1000));

        // Find and click submit button
        const submitSelectors = [
            'input[type="submit"][name="view_post"]', // mbasic
            'input[type="submit"][value*="Post"]',
            'input[type="submit"][value*="โพสต์"]',
            'input[type="submit"][value*="ตกลง"]',
            'div[aria-label*="โพสต์"]',               // modern desktop
            'div[aria-label*="Post"]',                // modern desktop
            'button[type="submit"]',
            'input[type="submit"]',
        ];

        let submitted = false;
        logMsg('   Attempting to post...');

        // If it's a div role=textbox (modern), we need to handle typing differently
        if (textarea && (await textarea.evaluate(el => el.tagName)) === 'DIV') {
            await textarea.click();
            await page.keyboard.type(message, { delay: 15 });
        } else {
            await textarea.click();
            await textarea.type(message, { delay: 15 });
        }
        await new Promise((r) => setTimeout(r, 1500));

        for (const sel of submitSelectors) {
            const btn = await page.$(sel);
            if (btn) {
                await btn.click();
                submitted = true;
                logMsg(`   Clicked submit: ${sel}`);
                break;
            }
        }

        if (!submitted) {
            // Special case for modern mobile: might need to click "Next" then "Post"
            const nextBtn = await page.$('div[aria-label="ถัดไป"], div[aria-label="Next"]');
            if (nextBtn) {
                logMsg('   Clicking "Next" (modern mobile flow)...');
                await nextBtn.click();
                await new Promise(r => setTimeout(r, 1500));
                const finalPost = await page.$('div[aria-label="โพสต์"], div[aria-label="Post"]');
                if (finalPost) {
                    await finalPost.click();
                    submitted = true;
                    logMsg('   Clicked final "Post" button.');
                }
            }
        }

        if (!submitted) {
            logMsg('⚠️  Cannot find submit button.');
            await browser.close();
            return { success: false, reason: 'submit_not_found' };
        }

        await new Promise((r) => setTimeout(r, 3000));

        logMsg('✅ Facebook: Post submitted successfully via browser!');
        await browser.close();
        return { success: true, method: 'mbasic' };
    } catch (err) {
        console.error(`❌ Facebook: Error — ${err.message}`);
        if (browser) {
            try { await browser.close(); } catch (_) { }
        }
        return { success: false, reason: err.message };
    }
}

// ============================================================
// Instagram Business Posting (Graph API)
// ============================================================

async function postToInstagram(product, siteUrl, useAI = false, aiCaption = null) {
    const igUserId = process.env.IG_USER_ID;
    const accessToken = process.env.IG_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;

    if (!igUserId || !accessToken) {
        console.log('⚠️  Instagram: Missing IG_USER_ID or Token — skipping.');
        return { success: false, reason: 'missing_credentials' };
    }

    if (!product.image) {
        console.log(`⚠️  Instagram: Product "${product.title}" has no image — skipping.`);
        return { success: false, reason: 'no_image' };
    }

    const caption = buildPostContent(product, siteUrl, useAI, aiCaption);

    try {
        const containerRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igUserId}/media`,
            { image_url: product.image, caption, access_token: accessToken }
        );
        const publishRes = await axios.post(
            `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
            { creation_id: containerRes.data.id, access_token: accessToken }
        );

        console.log(`✅ Instagram: Posted "${product.title}" — ID: ${publishRes.data.id}`);
        return { success: true, mediaId: publishRes.data.id };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error(`❌ Instagram: Failed — ${msg}`);
        return { success: false, reason: msg };
    }
}

// ============================================================
// X (Twitter) Posting (OAuth 1.0a)
// ============================================================

function getOAuthClient() {
    return OAuth({
        consumer: {
            key: process.env.X_API_KEY,
            secret: process.env.X_API_SECRET
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto.createHmac('sha1', key).update(base_string).digest('base64');
        }
    });
}

function getOAuthHeader(method, url) {
    const oauth = getOAuthClient();
    const token = {
        key: process.env.X_ACCESS_TOKEN,
        secret: process.env.X_ACCESS_TOKEN_SECRET
    };
    const requestData = { url, method };
    return oauth.toHeader(oauth.authorize(requestData, token)).Authorization;
}

async function postToX(product, siteUrl, useAI = false, aiCaption = null) {
    const webhookUrl = 'https://chobshop.app.n8n.cloud/webhook/x-post';

    const caption = buildPostContent(product, siteUrl, useAI, aiCaption);
    let text = caption;

    if (text.length > 280) text = text.substring(0, 277) + '...';

    // Prepare payload for n8n
    const payload = {
        platform: 'x',
        product: {
            id: product.id,
            title: product.title,
            link: `${siteUrl}?productId=${product.id}`,
            image: product.image
        },
        text: text,
        useAI: useAI,
        timestamp: new Date().toISOString()
    };

    try {
        const res = await axios.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout for webhook validation
        });

        // Generate a pseudo-ID since n8n handles the actual posting asynchronously 
        const pseudoTweetId = `n8n_${Date.now()}`;
        console.log(`✅ X: Sent "${product.title}" to n8n Webhook! [Pseudo ID: ${pseudoTweetId}]`);

        return { success: true, tweetId: pseudoTweetId };
    } catch (err) {
        console.error(`❌ X (n8n Webhook): Failed to send payload — ${err.message}`);
        return { success: false, reason: err.message };
    }
}

// ============================================================
// Threads Posting (Meta Threads Publishing API)
// ============================================================

async function postToThreads(product, siteUrl, useAI = false, aiCaption = null) {
    const threadsUserId = process.env.THREADS_USER_ID;
    const accessToken = process.env.THREADS_ACCESS_TOKEN;

    if (!threadsUserId || !accessToken) {
        console.log('⚠️  Threads: Missing THREADS_USER_ID or THREADS_ACCESS_TOKEN — skipping.');
        return { success: false, reason: 'missing_credentials' };
    }

    const caption = buildPostContent(product, siteUrl, useAI, aiCaption);
    let text = caption;
    // Threads has a 500 character limit
    if (text.length > 500) text = text.substring(0, 497) + '...';

    try {
        // Step 1: Create media container
        const containerRes = await axios.post(
            `https://graph.threads.net/v1.0/${threadsUserId}/threads`,
            {
                media_type: 'TEXT',
                text: text,
                access_token: accessToken
            }
        );

        const creationId = containerRes.data?.id;
        if (!creationId) {
            console.error('❌ Threads: Failed to create media container');
            return { success: false, reason: 'container_creation_failed' };
        }

        // Small delay to let Threads process the container
        await new Promise(r => setTimeout(r, 1000));

        // Step 2: Publish the container
        const publishRes = await axios.post(
            `https://graph.threads.net/v1.0/${threadsUserId}/threads_publish`,
            {
                creation_id: creationId,
                access_token: accessToken
            }
        );

        const threadId = publishRes.data?.id;
        console.log(`✅ Threads: Posted "${product.title}" — ID: ${threadId}`);
        return { success: true, threadId: threadId };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error(`❌ Threads: Failed — ${msg}`);
        return { success: false, reason: msg };
    }
}

// ============================================================
// Main: Post to selected platforms
// ============================================================

/**
 * Delete a post from Facebook using the Graph API.
 */
async function deleteFromFacebook(facebookPostId) {
    if (!facebookPostId) return { success: false, error: 'No Facebook Post ID provided' };

    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
        return { success: false, error: 'FB_PAGE_ACCESS_TOKEN missing' };
    }

    try {
        console.log(`🗑️ Facebook: Deleting post ${facebookPostId}...`);
        const response = await axios.delete(`https://graph.facebook.com/v25.0/${facebookPostId}`, {
            params: { access_token: accessToken }
        });
        return { success: response.data.success, data: response.data };
    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('❌ Facebook deletion error:', msg);
        return { success: false, error: msg };
    }
}

/**
 * Delete a post from X (Twitter) using the API v2.
 */
async function deleteFromX(tweetId) {
    if (!tweetId) return { success: false, error: 'No X Tweet ID provided' };

    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
        return { success: false, error: 'missing_credentials' };
    }

    const tweetUrl = `https://api.x.com/2/tweets/${tweetId}`;

    try {
        console.log(`🗑️ X: Deleting tweet ${tweetId}...`);
        const authHeader = getOAuthHeader('DELETE', tweetUrl);
        const res = await axios.delete(tweetUrl, {
            headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        });
        return { success: true, data: res.data };
    } catch (err) {
        const msg = err.response?.data?.detail || err.response?.data?.title || err.message;
        console.error('❌ X deletion error:', msg);
        return { success: false, error: msg };
    }
}

async function postToSocialMedia(product, platforms = {}) {
    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    const results = {};

    if (platforms.facebook) {
        results.facebook = await postToFacebook(product, siteUrl);
    }
    if (platforms.instagram) {
        results.instagram = await postToInstagram(product, siteUrl);
    }
    if (platforms.x) {
        results.x = await postToX(product, siteUrl);
    }

    return results;
}

/**
 * Use Gemini AI to categorize a product based on its title.
 */
async function categorizeProduct(title) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const categories = [
        "เสื้อผ้าผู้หญิง", "เสื้อผ้าผู้ชาย", "กระเป๋า", "รองเท้าผู้หญิง", "รองเท้าผู้ชาย",
        "เครื่องประดับ", "นาฬิกาและแว่นตา", "โทรศัพท์มือถือและอุปกรณ์เสริม",
        "คอมพิวเตอร์และแล็ปท็อป", "เครื่องใช้ไฟฟ้าในบ้าน", "กล้องและอุปกรณ์ถ่ายภาพ",
        "เครื่องเสียง", "Gaming และอุปกรณ์เกม", "ความงาม", "สุขภาพ", "ผลิตภัณฑ์ดูแลผิว",
        "บ้านและสวน", "เครื่องใช้ในบ้าน", "อาหารและเครื่องดื่ม", "ของเล่น สินค้างานอดิเรก",
        "แม่และเด็ก", "เสื้อผ้าเด็ก", "กีฬาและกิจกรรมกลางแจ้ง", "การเดินทางและกระเป๋าเดินทาง",
        "สัตว์เลี้ยง", "ยานยนต์", "หนังสือและสื่อบันเทิง", "ตั๋วและบัตรกำนัล",
        "เครื่องเขียนและอุปกรณ์สำนักงาน", "อื่นๆ"
    ];

    try {
        const prompt = `คุณคือผู้เชี่ยวชาญด้านการจัดหมวดหมู่สินค้าอีคอมเมิร์ซ จงวิเคราะห์ชื่อสินค้าต่อไปนี้และเลือก "หมวดหมู่ที่เหมาะสมที่สุดเพียงหมวดหมู่เดียว" จากรายการที่กำหนดให้เท่านั้น

ชื่อสินค้า: "${title}"

รายการหมวดหมู่ที่อนุญาต:
${categories.map(c => `- ${c}`).join('\n')}

กฎเหล็ก:
1. ตอบ "เฉพาะชื่อหมวดหมู่" ที่เลือกมาเท่านั้น ห้ามมีคำอธิบายอื่น
2. หากไม่แน่ใจจริงๆ ให้ตอบว่า "อื่นๆ"
3. เลือกจากรายการด้านบนเท่านั้น ห้ามคิดหมวดหมู่ใหม่เอง

หมวดหมู่ที่เลือกคือ:`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }]
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        // Clean up the response (sometimes AI adds quotes or markdown)
        const cleanedText = aiText ? aiText.replace(/["'#*]/g, '').trim() : null;

        // Validate that the returned category is in our allowed list
        if (categories.includes(cleanedText)) {
            return cleanedText;
        }

        console.warn(`⚠️ Gemini returned invalid category: "${cleanedText}" for title: "${title}"`);
        return null; // Fallback to keyword-based logic on the client/caller side
    } catch (err) {
        console.error('⚠️ Gemini Categorization Error:', err.message);
        return null;
    }
}

module.exports = {
    postToFacebook,
    postToInstagram,
    postToX,
    postToThreads,
    deleteFromFacebook,
    deleteFromX,
    generateAICaption,
    buildPostContent,
    categorizeProduct
};
