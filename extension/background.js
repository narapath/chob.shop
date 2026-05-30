// ChobShop Auto-Post Background Service Worker
// Uses Chrome Alarms API to schedule posts and cycle through Facebook groups

const ALARM_NAME = 'CHOBSHOP_AUTO_POST';
const HEARTBEAT_ALARM = 'CHOBSHOP_HEARTBEAT';
let logQueue = []; // Queue for syncing to server
let lastPing = 0;   // Store last heartbeat duration

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('[AutoPost] Alarm fired, starting auto-post cycle...');
        await executeAutoPost();
    }
});

// Clear alarms on install/update then recreate to ensure persistence
chrome.runtime.onInstalled.addListener(() => {
    setupAlarms();
    migrateTemplate();
    console.log('[AutoPost] Extension installed/updated, alarms initialized.');
});

async function migrateTemplate() {
    chrome.storage.sync.get(['captionTemplate'], (result) => {
        if (result.captionTemplate) {
            let t = result.captionTemplate;
            const toRemove = [
                '✅ สินค้าคุณภาพดี คัดสรรมาเพื่อคุณ',
                '🌟 ดีไซน์สวย ทันสมัย ใช้งานง่าย',
                '💎 แข็งแรง ทนทาน คุ้มค่าที่สุด',
                '🚀 พร้อมส่งด่วน สั่งซื้อได้เลยวันนี้!',
                '#ช้อปปิ้งออนไลน์ #สินค้าดีบอกต่อ #คุ้มค่า #รับประกันคุณภาพ',
                '💰 ราคาพิเศษเพียง:',
                '📍 สนใจสั่งซื้อได้ที่นี่:'
            ];
            let modified = false;
            toRemove.forEach(line => {
                if (t.includes(line)) {
                    t = t.replace(line, '').trim();
                    modified = true;
                }
            });
            if (modified) {
                // Clean up double newlines that might result from removal
                t = t.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
                chrome.storage.sync.set({ captionTemplate: t });
                console.log('[Migration] Cleaned up caption template');
            }
        }
    });
}

chrome.runtime.onStartup.addListener(() => {
    setupAlarms();
    console.log('[AutoPost] Browser started, alarms checked.');
});

async function setupAlarms() {
    const alarms = await chrome.alarms.getAll();
    if (!alarms.find(a => a.name === HEARTBEAT_ALARM)) {
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
    }
    // Also send an initial heartbeat immediately on setup
    sendHeartbeat();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_AUTO_POST') {
        startAutoPost(request.intervalMinutes).then(() => {
            sendResponse({ success: true });
        }).catch(err => {
            console.error('[AutoPost] Start error:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true; // async
    } else if (request.action === 'STOP_AUTO_POST') {
        stopAutoPost().then(() => {
            sendResponse({ success: true });
        });
        return true;
    } else if (request.action === 'GET_AUTO_STATUS') {
        getAutoStatus().then(status => sendResponse(status));
        return true; // async
    } else if (request.action === 'GET_GROUPS') {
        chrome.storage.sync.get('facebookGroups', (data) => {
            sendResponse({ groups: data.facebookGroups || [] });
        });
        return true;
    } else if (request.action === 'UPDATE_INTERVAL') {
        updateInterval(request.minutes).then(() => sendResponse({ success: true }));
        return true;
    } else if (request.action === 'PING') {
        sendResponse({ success: true, timestamp: Date.now() });
        return true;
    } else if (request.action === 'SCRAPE_PRODUCT') {
        scrapeProductData(request.url).then(result => {
            sendResponse(result);
        }).catch(err => {
            console.error('[Scraper] Error:', err);
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
});

async function scrapeProductData(url) {
    let tabId = null;
    try {
        console.log(`[Scraper] Starting scrape for: ${url}`);

        // 1. Create tab
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        // 2. Wait for loading to complete
        await new Promise((resolve) => {
            const listener = (id, info) => {
                if (id === tabId && info.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(listener);

            // Safety timeout
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }, 15000);
        });

        // 2.5 Additional delay for stability (Shopee redirects and dynamic content)
        await new Promise(r => setTimeout(r, 3000));

        // 3. Inject script to extract image URL
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                const getMeta = (name) => {
                    const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
                    return el ? el.getAttribute('content') : null;
                };

                const title = getMeta('og:title') || document.title;
                const ogImage = getMeta('og:image');

                // FALLBACKS for Shopee if og:image is missing or dynamic
                let mainImage = ogImage;
                if (!mainImage) {
                    // Try the hero image selector found in debug
                    const heroImg = document.querySelector('img[elementtiming="shopee:heroComponentPaint"]');
                    if (heroImg && heroImg.src) {
                        mainImage = heroImg.src.replace('_tn', ''); // Remove thumbnail suffix if present
                    }
                }

                if (!mainImage) {
                    // Other common Shopee/E-commerce selectors
                    const selectors = [
                        '.product-briefing img',
                        'div.flex-shrink-0 img',
                        '._2GChvG img',
                        '.product-gallery__main-image img'
                    ];
                    for (const s of selectors) {
                        const img = document.querySelector(s);
                        if (img && img.src && img.src.startsWith('http')) {
                            mainImage = img.src;
                            break;
                        }
                    }
                }

                return { title, imageUrl: mainImage };
            }
        });

        const data = results[0].result;
        if (!data || !data.imageUrl) {
            throw new Error('Could not find product image');
        }

        console.log(`[Scraper] Found image URL: ${data.imageUrl}`);

        // 4. Convert to Base64
        const base64 = await imageUrlToBase64(data.imageUrl);

        return {
            success: true,
            title: data.title,
            imageUrl: data.imageUrl,
            base64: base64
        };

    } finally {
        if (tabId) {
            chrome.tabs.remove(tabId).catch(() => { });
        }
    }
}

async function imageUrlToBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('[Scraper] Base64 conversion failed:', e);
        return null;
    }
}

async function startAutoPost(intervalMinutes) {
    try {
        const state = {
            isRunning: true,
            intervalMinutes: intervalMinutes,
            groupIndex: 0,
            postCount: 0,
            lastPostTime: null,
            startedAt: Date.now(),
            log: [`▶️ ${new Date().toLocaleTimeString('th-TH')} | เริ่มออโต้โพสต์ (ทุก ${intervalMinutes} นาที)`]
        };

        // Save immediately so UI updates
        await chrome.storage.local.set({ autoPostState: state });

        console.log(`[AutoPost] Starting with interval: ${intervalMinutes} minutes`);

        // Schedule FIRST post immediately via alarm (best for MV3 persistence)
        await chrome.alarms.create(ALARM_NAME, { when: Date.now() + 1000 });

    } catch (err) {
        console.error('[AutoPost] Initialization error:', err);
        throw err;
    }
}

async function stopAutoPost() {
    console.log('[AutoPost] Stopping auto-post...');
    await chrome.alarms.clear(ALARM_NAME);

    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.isRunning = false;
        autoPostState.log = [`⏸️ ${new Date().toLocaleTimeString('th-TH')} | หยุดออโต้โพสต์`, ...(autoPostState.log || [])].slice(0, 20);
        await chrome.storage.local.set({ autoPostState });
    }
}

async function updateInterval(minutes) {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.intervalMinutes = parseInt(minutes);
        autoPostState.log = [`⚙️ ${new Date().toLocaleTimeString('th-TH')} | เปลี่ยนความถี่เป็น ${minutes} นาที`, ...(autoPostState.log || [])].slice(0, 20);
        await chrome.storage.local.set({ autoPostState });

        // If running, restart alarm with new interval
        if (autoPostState.isRunning) {
            chrome.alarms.create(ALARM_NAME, {
                periodInMinutes: parseInt(minutes)
            });
        }
    }
}

async function getAutoStatus() {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    const alarm = await chrome.alarms.get(ALARM_NAME);

    const state = autoPostState || { isRunning: false, postCount: 0, log: [] };

    // Inject real-time info for widget display
    state.lastPingMs = typeof lastPing !== 'undefined' ? lastPing : 0;
    state.nextRunTime = alarm ? alarm.scheduledTime : null;

    return {
        state: state,
        nextAlarm: alarm ? alarm.scheduledTime : null
    };
}

async function executeAutoPost() {
    try {
        // 1. Get state
        const { autoPostState } = await chrome.storage.local.get('autoPostState');
        if (!autoPostState || !autoPostState.isRunning) {
            console.log('[AutoPost] Not running, aborting.');
            return;
        }

        // Set isPosting flag
        autoPostState.isPosting = true;
        await chrome.storage.local.set({ autoPostState });
        sendHeartbeat(); // Immediate sync starting

        // 2. Get groups
        const { fbGroups } = await chrome.storage.sync.get('fbGroups');
        if (!fbGroups || fbGroups.length === 0) {
            addLog('❌ ไม่มีกลุ่ม Facebook ที่บันทึกไว้');
            autoPostState.isPosting = false;
            await chrome.storage.local.set({ autoPostState });
            await scheduleNextAlarm(autoPostState);
            return;
        }

        // 3. Get settings and products
        const { apiEndpoint, captionTemplate } = await chrome.storage.sync.get(['apiEndpoint', 'captionTemplate']);
        const endpoint = apiEndpoint || 'https://chob.shop';
        const template = captionTemplate || '✨ {{title}} ✨\n\n{{desc}}\n\n🏷️ งบประมาณ: {{price}}.-\n📍 พิกัดของอยู่ตรงนี้:\n{{link}}';

        let products;
        try {
            const res = await fetch(`${endpoint}/api/products`);
            const data = await res.json();
            products = Array.isArray(data) ? data : (data.products || []);
        } catch (e) {
            addLog('❌ ดึงสินค้าไม่สำเร็จ: ' + e.message, 'ERROR', 'FETCH_PRODUCTS');
            await scheduleNextAlarm(autoPostState);
            return;
        }

        if (products.length === 0) {
            addLog('❌ ไม่มีสินค้าในคลัง');
            await scheduleNextAlarm(autoPostState);
            return;
        }

        // 4. Pick random product
        const product = products[Math.floor(Math.random() * products.length)];

        // 5. Pick current group (round-robin)
        const groupIndex = autoPostState.groupIndex % fbGroups.length;
        const group = fbGroups[groupIndex];

        // 6. Generate caption
        const link = (product.affiliateUrl && product.affiliateUrl.length > 5)
            ? product.affiliateUrl
            : `https://chob.shop/?productId=${product.id}`;

        // Apply bold to title (Latin characters)
        const displayTitle = toUnicodeBold(product.title || '');

        let caption = template
            .replace(/{{title}}/g, displayTitle)
            .replace(/{{price}}/g, parseFloat(product.price || 0).toLocaleString())
            .replace(/{{link}}/g, link + ' ') // Add space to prevent FB masking
            .replace(/{{desc}}/g, product.description || '')
            .replace(/{{tags}}/g, '');

        caption = caption.replace(/\n\s*\n/g, '\n\n').trim();

        // 7. Navigate or find Facebook group tab
        // Use lastFocusedWindow to find where the user is actually working
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        let tabId;
        if (tabs.length > 0 && tabs[0].url && tabs[0].url.includes('facebook.com')) {
            tabId = tabs[0].id;
            await chrome.tabs.update(tabId, { url: group.url });
        } else {
            // No active FB tab? Find any FB tab or create new
            const allFB = await chrome.tabs.query({ url: "*://*.facebook.com/*" });
            if (allFB.length > 0) {
                tabId = allFB[0].id;
                await chrome.tabs.update(tabId, { url: group.url, active: true });
            } else {
                const newTab = await chrome.tabs.create({ url: group.url });
                tabId = newTab.id;
            }
        }

        // 8. Wait for page to load (8 seconds)
        await delay(8000);

        // 8.5 Convert image to Base64 (Essential for manual upload bypass)
        let b64Image = null;
        if (product.image) {
            console.log('[AutoPost] Converting image to Base64:', product.image);
            b64Image = await imageUrlToBase64(product.image);
        }

        // 9. Send fill command
        let postLink = null;
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'FILL_POST',
                data: {
                    caption,
                    imageUrl: b64Image || product.image
                }
            });
            postLink = response ? response.postLink : null;
        } catch (msgErr) {
            // Content script might not be loaded yet, retry once after 5s
            console.warn('[AutoPost] First message failed, retrying...', msgErr);
            await delay(5000);
            try {
                const response = await chrome.tabs.sendMessage(tabId, {
                    action: 'FILL_POST',
                    data: { caption, imageUrl: product.image }
                });
                postLink = response ? response.postLink : null;
            } catch (retryErr) {
                addLog(`❌ กลุ่ม "${group.name}" - ส่งคำสั่งไม่ได้ (รีเฟรชหน้าใหม่)`);
                await scheduleNextAlarm(autoPostState);
                return;
            }
        }

        // 10. Update state
        autoPostState.groupIndex = groupIndex + 1;
        autoPostState.postCount += 1;
        autoPostState.lastPostTime = Date.now();

        const logEntry = `✅ ${new Date().toLocaleTimeString('th-TH')} | "${group.name}" | ${product.title.substring(0, 30)}... ${postLink || ''}`;
        autoPostState.log = [logEntry, ...(autoPostState.log || [])].slice(0, 20); // Keep last 20

        // Final state update
        autoPostState.isPosting = false;
        await chrome.storage.local.set({ autoPostState });
        console.log(`[AutoPost] Posted to "${group.name}" successfully`);

        addLog(`✅ โพสต์สำเร็จ: ${group.name}`, 'SUCCESS', 'POST_FINISHED', {
            group: group.name,
            product: product.title,
            link: postLink
        });

        // 11. Schedule next alarm
        await scheduleNextAlarm(autoPostState);

    } catch (err) {
        console.error('[AutoPost] Error:', err);
        addLog('❌ เกิดข้อผิดพลาด: ' + err.message);

        // Still schedule next alarm even on error
        const { autoPostState } = await chrome.storage.local.get('autoPostState');
        if (autoPostState) {
            autoPostState.isPosting = false; // Reset flag on error
            if (autoPostState.isRunning) {
                await scheduleNextAlarm(autoPostState);
            } else {
                await chrome.storage.local.set({ autoPostState });
            }
        }
    }
}

async function scheduleNextAlarm(state) {
    const minutes = state.intervalMinutes || 10;
    console.log(`[AutoPost] Scheduling next alarm in ${minutes} minutes`);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: minutes });
}

async function addLog(msg, type = 'INFO', action = 'LOG', details = {}) {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.log = [msg, ...(autoPostState.log || [])].slice(0, 20);
        await chrome.storage.local.set({ autoPostState });
    }

    // Add to sync queue for server
    logQueue.push({
        status: type,
        message: msg,
        action: action,
        details: details,
        timestamp: new Date().toISOString()
    });

    // If it's an important log (Post finished/Error), trigger heartbeat immediately
    if (action === 'POST_FINISHED' || type === 'ERROR') {
        sendHeartbeat();
    }
}

function toUnicodeBold(text) {
    const boldMap = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(char => boldMap[char] || char).join('');
}


// ===================== HEARTBEAT SYSTEM =====================
// Register/Check Heartbeat Alarm
setupAlarms();

function normalizeBotName(name) {
    if (!name) return "";
    // Remove invisible characters (like Thai vowel dots or zero-width spaces)
    return name.trim().replace(/[\u0E00-\u0E7F\u200B-\u200D\uFEFF]/g, c => {
        // Keep actual Thai characters, but maybe some are problematic?
        // Actually, let's just trim and allow Thai for now, but be careful.
        return c;
    }).trim();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
        await sendHeartbeat();
    }
});

// Watch for manual heartbeat requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SEND_HEARTBEAT') {
        sendHeartbeat();
        sendResponse({ success: true });
    }
});

async function sendHeartbeat() {
    try {
        const settings = await chrome.storage.sync.get(['botName', 'apiEndpoint']);
        const botName = normalizeBotName(settings.botName);
        const endpoint = (settings.apiEndpoint || 'https://chob.shop').replace(/\/$/, '');

        if (!botName) {
            console.log('[Heartbeat] Skipping: No botName set');
            return;
        }

        // 1. Get current auto-post state for stats
        const { autoPostState, lastCommandTs } = await chrome.storage.local.get(['autoPostState', 'lastCommandTs']);
        const alarm = await chrome.alarms.get(ALARM_NAME);
        const manifest = chrome.runtime.getManifest();

        const status = (autoPostState && autoPostState.isRunning) ? 'active' : 'idle';
        const stats = {
            postCount: autoPostState ? autoPostState.postCount : 0,
            lastPostTime: autoPostState ? autoPostState.lastPostTime : null,
            interval: autoPostState ? autoPostState.intervalMinutes : null,
            isPosting: autoPostState ? !!autoPostState.isPosting : false,
            next_run: alarm ? alarm.scheduledTime : null,
            ping: lastPing // Include last measured ping
        };

        const body = {
            bot_name: botName,
            browser_type: 'Chrome',
            status,
            stats,
            version: manifest.version,
            ack_command_ts: lastCommandTs || null,
            new_logs: [...logQueue] // Send current queue
        };

        console.log(`[Heartbeat] Sending to ${endpoint}/api/bots/heartbeat... (${logQueue.length} logs)`);

        const startTime = Date.now();
        const res = await fetch(`${endpoint}/api/bots/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        lastPing = Date.now() - startTime;
        console.log(`[Heartbeat] Latency: ${lastPing}ms`);

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Server responded with ${res.status}: ${errorText}`);
        }

        const data = await res.json();
        if (data.success) {
            console.log(`[Heartbeat] Success: Reported as "${botName}"`);
            logQueue = []; // Clear queue on success

            // Handle Remote Commands
            if (data.command && data.command.action) {
                const cmd = data.command;
                const cmdTs = cmd ? cmd.timestamp : null;

                if (cmd && cmdTs && cmdTs !== lastCommandTs) {
                    console.log(`🎮 [Remote Command] Received: ${cmd.action} (TS: ${cmdTs})`);

                    try {
                        if (cmd.action === 'START') {
                            await startAutoPost(cmd.interval || 15);
                        } else if (cmd.action === 'STOP') {
                            await stopAutoPost();
                        } else if (cmd.action === 'SET_INTERVAL') {
                            await updateInterval(cmd.interval);
                        }

                        // Save this timestamp as processed ONLY after success
                        await chrome.storage.local.set({ lastCommandTs: cmdTs });
                        console.log(`✅ [Remote Command] ${cmd.action} processed successfully.`);

                        // Trigger an immediate heartbeat to acknowledge
                        sendHeartbeat();
                    } catch (cmdErr) {
                        console.error(`❌ [Remote Command] Failed to execute ${cmd.action}:`, cmdErr);
                    }
                } else if (cmd && cmdTs) {
                    console.log(`⏳ [Remote Command] Already handled "${cmd.action}" (TS: ${cmdTs}), waiting server cleanup.`);
                }
            }
        } else {
            console.warn(`[Heartbeat] Server reported failure:`, data.error);
        }
    } catch (err) {
        console.error('[Heartbeat] Critical Error:', err.message);
    }
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
