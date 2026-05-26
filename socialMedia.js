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
 * Generate relevant hashtags based on product title only.
 */
function generateHashtags(product) {
    const dynamicHashtags = new Set();
    const title = product.title || '';

    // Split title by common delimiters to find potential keywords
    const keywords = title.split(/[\s,/-]+/).filter(k => k.length > 1 && !/^[0-9]+$/.test(k));

    // Get first few meaningful keywords as tags
    keywords.slice(0, 3).forEach(kw => {
        const cleaned = kw.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '');
        if (cleaned) dynamicHashtags.add(`#${cleaned}`);
    });

    return [...dynamicHashtags].join(' ');
}

/**
 * Generate an AI-powered reviewer-style caption using Google Gemini API.
 * Cleans the title (e.g. 1+1 -> 2ปี) and generates niche hashtags.
 */
async function generateAICaption(product) {
    const apiKey = process.env.GEMINI_API_KEY;
    const title = product.title || '';
    const price = Number(product.price).toLocaleString();
    const category = product.category || 'ทั่วไป';
    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    // Always prioritize direct affiliate URL
    const affiliateUrl = product.affiliateUrl || `${siteUrl}/?productId=${product.id}`;

    if (!apiKey) {
        // High quality fallback
        return `✨ ${title}\n\n💰 ราคาเพียง: ${price} บาท\n📍 สนใจสั่งซื้อได้ที่: ${affiliateUrl}\n\n${generateHashtags(product)}`;
    }

    try {
        const prompt = `คุณคือ Content Creator มือโปรที่เก่งเรื่องการเขียนแคปชั่นขายสินค้าให้น่าดึงดูดและดูเป็นธรรมชาติ
จงเขียนแคปชั่นสำหรับสินค้าชิ้นนี้ โดยมีกฎเหล็กดังนี้:
1. **จัดรูปแบบบรรทัด**: ต้องเว้นบรรทัดให้ชัดเจนตามรูปแบบที่กำหนด (ห้ามเขียนติดกันเป็นพืด)
2. **เนื้อหาเชิงรีวิว**: เขียนสั้นๆ 1-2 ประโยคว่าทำไมสินค้านี้ถึงน่าสนใจ (เช่น "ตัวนี้ใช้ดีมากครับ", "สายแคมป์ปิ้งต้องมี")
3. **แฮชแท็ก**: สร้างแฮชแท็กที่ระบุถึงชื่อสินค้านั้นๆ โดยเฉพาะ (เช่น #เลื่อยตัดแต่งกิ่ง #Osuka #ไฟLED) **ห้ามใช้**แฮชแท็กทั่วไปอย่าง #ChobShop #รีวิวสินค้า
4. **Emoji**: ใช้ Emoji ให้ดูพรีเมียม

ข้อมูลสินค้า:
- ชื่อสินค้า: "${title}"
- ราคา: ${price} บาท

รูปแบบคำตอบที่คุณต้องส่งกลับมาเท่านั้น (ห้ามมีข้อความอื่นปน):
✨ [ชื่อสินค้าสั้นๆ]

[ประโยคป้ายยา/รีวิว]

💰 ราคาเพียง: ${price} บาท
📍 สนใจสั่งซื้อได้ที่: ${affiliateUrl}

[แฮชแท็กเจาะจงสินค้า]`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        return aiText || `✨ ${title}\n\n💰 ราคาเพียง: ${price} บาท\n📍 สนใจสั่งซื้อได้ที่: ${affiliateUrl}\n\n${generateHashtags(product)}`;
    } catch (err) {
        console.error('⚠️ Gemini Caption Gen Error:', err.message);
        return `✨ ${title}\n\n💰 ราคาเพียง: ${price} บาท\n📍 สนใจสั่งซื้อได้ที่: ${affiliateUrl}\n\n${generateHashtags(product)}`;
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
            '',
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

/**
 * Automate posting to Facebook Groups.
 * @param {Object} product 
 * @param {string} siteUrl 
 * @param {string[]} groupUrls
 * @param {boolean} useAI 
 * @param {string} aiCaption 
 */
async function postToFacebookGroups(product, siteUrl, groupUrls = [], useAI = false, aiCaption = null) {
    if (!groupUrls || groupUrls.length === 0) {
        return { success: false, reason: 'No group URLs provided' };
    }

    const logMsg = (m) => fs.appendFileSync('debug_social.log', `[${new Date().toISOString()}] [Groups] ${m}\n`);
    const userDataDir = path.join(__dirname, '.chrome_profile');
    const puppeteer = require('puppeteer');

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
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
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
        });

        // 1. Ensure Logged In
        logMsg('Checking login status...');
        await page.goto('https://mbasic.facebook.com/', { waitUntil: 'networkidle2', timeout: 30000 });

        let loginForm = await page.$('input[name="email"]');
        if (loginForm) {
            logMsg('Attempting to log in...');
            const fbEmail = process.env.FB_EMAIL;
            const fbPassword = process.env.FB_PASSWORD;
            if (!fbEmail || !fbPassword) {
                logMsg('⚠️ Not logged in and missing FB_EMAIL/FB_PASSWORD');
                await page.screenshot({ path: 'debug_login_error.png' });
                await browser.close();
                return { success: false, reason: 'missing_credentials' };
            }
            await page.type('input[name="email"]', fbEmail, { delay: 50 });
            await page.type('input[name="pass"]', fbPassword, { delay: 50 });
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                page.click('input[type="submit"], button[type="submit"], input[name="login"]'),
            ]);

            // Check for login success or "Save Device" page
            if (page.url().includes('login.php') || page.url().includes('checkpoint')) {
                logMsg('⚠️ Login failed or 2FA required. URL: ' + page.url());
                await page.screenshot({ path: 'debug_login_checkpoint.png' });
                await browser.close();
                return { success: false, reason: 'login_failed_or_2fa' };
            }

            // Handle "Save Device" page if it appears
            if (page.url().includes('save-device')) {
                const okBtn = await page.$('input[type="submit"], button');
                if (okBtn) await Promise.all([page.waitForNavigation(), okBtn.click()]);
            }
            logMsg('Successfully logged in.');
        } else {
            logMsg('Already logged in.');
        }

        const groupResults = [];
        const message = buildPostContent(product, siteUrl, useAI, aiCaption);

        for (const rawUrl of groupUrls) {
            const groupUrl = rawUrl.trim();
            if (!groupUrl) continue;

            // Convert regular URL to mbasic URL
            let mbasicUrl = groupUrl.replace('www.facebook.com', 'mbasic.facebook.com');
            if (!mbasicUrl.includes('mbasic.facebook.com')) {
                if (mbasicUrl.startsWith('/')) mbasicUrl = `https://mbasic.facebook.com${mbasicUrl}`;
                else if (!mbasicUrl.startsWith('http')) mbasicUrl = `https://mbasic.facebook.com/groups/${mbasicUrl}`;
            }

            logMsg(`📡 Posting to group: ${mbasicUrl}`);
            try {
                await page.goto(mbasicUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                // Find the "Write something..." link/area in mbasic groups
                // Try multiple patterns for mbasic composer links
                let composerLink = await page.$('a[href*="/composer/mbasic/"]');
                if (!composerLink) {
                    composerLink = await page.$('a[href*="m.facebook.com/composer"]');
                }

                if (!composerLink) {
                    logMsg(`⚠️ Could not find composer link in group: ${mbasicUrl}`);
                    const id = groupUrl.split('/').pop() || 'unknown';
                    await page.screenshot({ path: `debug_no_composer_${id}.png` });
                    groupResults.push({ group: groupUrl, success: false, reason: 'composer_not_found' });
                    continue;
                }
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                    composerLink.click()
                ]);

                // Type message
                let textarea = await page.$('textarea[name="xc_message"]');
                if (!textarea) textarea = await page.$('textarea');

                if (textarea) {
                    // Splitting by newline and typing helps some mobile versions of FB ensure line breaks
                    const lines = message.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                        await textarea.type(lines[i], { delay: 10 });
                        if (i < lines.length - 1) {
                            await page.keyboard.press('Enter');
                        }
                    }

                    // Click Post
                    let postBtn = await page.$('input[type="submit"][name="view_post"]');
                    if (!postBtn) postBtn = await page.$('input[value="โพสต์"], input[value="Post"]');

                    if (postBtn) {
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                            postBtn.click()
                        ]);
                        logMsg(`✅ Posted to group: ${groupUrl}`);
                        groupResults.push({ group: groupUrl, success: true });
                    } else {
                        logMsg(`⚠️ Could not find Post button in group: ${mbasicUrl}`);
                        await page.screenshot({ path: `debug_no_post_btn_${groupUrl.split('/').pop()}.png` });
                        groupResults.push({ group: groupUrl, success: false, reason: 'post_button_not_found' });
                    }
                } else {
                    logMsg(`⚠️ Could not find Textarea in group composer: ${mbasicUrl}`);
                    await page.screenshot({ path: `debug_no_textarea_${groupUrl.split('/').pop()}.png` });
                    groupResults.push({ group: groupUrl, success: false, reason: 'textarea_not_found' });
                }
            } catch (err) {
                logMsg(`❌ Error posting to group ${groupUrl}: ${err.message}`);
                groupResults.push({ group: groupUrl, success: false, reason: err.message });
                try {
                    await page.screenshot({ path: `debug_error_${groupUrl.split('/').pop()}.png` });
                } catch (_) { }
            }
            // Small delay between groups
            await new Promise(r => setTimeout(r, 4000));
        }

        await browser.close();
        return { success: true, results: groupResults };
    } catch (err) {
        logMsg(`❌ Global Group Post Error: ${err.message}`);
        if (browser) await browser.close();
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
 * Enhanced with context analysis and examples for better accuracy.
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
        const prompt = `คุณคือผู้เชี่ยวชาญด้านการจัดหมวดหมู่สินค้าอีคอมเมิร์ซที่มีความแม่นยำสูง จงวิเคราะห์ชื่อสินค้าและเลือกหมวดหมู่ที่เหมาะสมที่สุด

ชื่อสินค้า: "${title}"

รายการหมวดหมู่ที่อนุญาต (เลือกได้เพียง 1 หมวดหมู่):
${categories.map(c => `- ${c}`).join('\n')}

ตัวอย่างการวิเคราะห์ที่ถูกต้อง:
- "เก้าอี้แคมป์ปิ้ง แบบพับได้" → "กีฬาและกิจกรรมกลางแจ้ง" (เพราะเป็นอุปกรณ์แคมป์ปิ้ง/กลางแจ้ง)
- "เก้าอี้เกมมิ่ง" → "Gaming และอุปกรณ์เกม" (เพราะเป็นอุปกรณ์เกมมิ่ง)
- "เก้าอี้ทำงาน" → "เครื่องใช้ในบ้าน" (เพราะเป็นเฟอร์นิเจอร์ในบ้าน/สำนักงาน)
- "เสื้อยืดผู้หญิง" → "เสื้อผ้าผู้หญิง"
- "รองเท้าวิ่ง" → "กีฬาและกิจกรรมกลางแจ้ง" (เพราะเป็นรองเท้ากีฬา)
- "รองเท้าผ้าใบ" → "รองเท้าผู้หญิง" หรือ "รองเท้าผู้ชาย" (ขึ้นอยู่กับบริบท)
- "เคสไอโฟน" → "โทรศัพท์มือถือและอุปกรณ์เสริม"
- "อาหารเสริมคอลลาเจน" → "สุขภาพ"
- "เซรั่มวิตามินซี" → "ผลิตภัณฑ์ดูแลผิว"
- "ลิปสติก" → "ความงาม"

กฎเหล็ก:
1. ตอบ "เฉพาะชื่อหมวดหมู่" ที่เลือกมาเท่านั้น (ตามรายการด้านบนเป๊ะๆ)
2. วิเคราะห์บริบทของสินค้า ไม่ใช่แค่คำเดียว เช่น "เก้าอี้แคมป์" ต้องดูว่าเป็นอุปกรณ์กลางแจ้ง
3. หากสินค้าเกี่ยวข้องกับกีฬา/กิจกรรมกลางแจ้ง ให้優先หมวด "กีฬาและกิจกรรมกลางแจ้ง"
4. หากไม่แน่ใจจริงๆ ให้ตอบว่า "อื่นๆ"
5. ห้ามมีคำอธิบายอื่น ห้ามมีเครื่องหมายวรรคตอน

หมวดหมู่ที่เลือก:`;

        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1, // Low temperature for more deterministic output
                    maxOutputTokens: 50
                }
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        // Clean up the response (sometimes AI adds quotes, markdown, or extra text)
        let cleanedText = aiText ? aiText.replace(/["'#*`]/g, '').trim() : null;

        // Remove any prefix/suffix text that AI might add
        if (cleanedText) {
            // Try to extract just the category name
            for (const cat of categories) {
                if (cleanedText.includes(cat)) {
                    cleanedText = cat;
                    break;
                }
            }
        }

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

/**
 * Generates an AI-friendly caption for social media posts using local logic
 */
async function generateAICaption(product) {
    const siteUrl = process.env.SITE_URL || 'https://chob.shop';
    return `${product.title}\n🛒 ช้อปเลย: ${siteUrl}/?productId=${product.id}\nราคาเพียง ${product.price} บาท!\n#ChobShop #${product.category?.split('>')[0]?.trim() || 'Sale'}`;
}

module.exports = {
    postToFacebook,
    postToFacebookGroups,
    postToInstagram,
    postToX,
    postToThreads,
    deleteFromFacebook,
    deleteFromX,
    generateAICaption,
    buildPostContent
};
