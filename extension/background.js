// ChobShop Auto-Post Background Service Worker
// Uses Chrome Alarms API to schedule posts and cycle through Facebook groups

const ALARM_NAME = 'CHOBSHOP_AUTO_POST';

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('[AutoPost] Alarm fired, starting auto-post cycle...');
        await executeAutoPost();
    }
});

// Clear alarms on install/update to prevent stale timers
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.clearAll();
    console.log('[AutoPost] Extension installed/updated, alarms cleared.');
});

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
    } else if (request.action === 'PING') {
        sendResponse({ success: true, timestamp: Date.now() });
        return true;
    }
});

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

async function getAutoStatus() {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    const alarm = await chrome.alarms.get(ALARM_NAME);

    return {
        state: autoPostState || { isRunning: false, postCount: 0, log: [] },
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
        const template = captionTemplate || '✨ {{title}} ✨\n\n{{desc}}\n\n✅ สินค้าคุณภาพดี คัดสรรมาเพื่อคุณ\n🌟 ดีไซน์สวย ทันสมัย ใช้งานง่าย\n💎 แข็งแรง ทนทาน คุ้มค่าที่สุด\n🚀 พร้อมส่งด่วน สั่งซื้อได้เลยวันนี้!\n\n💰 ราคาพิเศษเพียง: {{price}} บาท\n📍 สนใจสั่งซื้อได้ที่นี่: {{link}}\n\n#ช้อปปิ้งออนไลน์ #สินค้าดีบอกต่อ #คุ้มค่า #รับประกันคุณภาพ';

        let products;
        try {
            const res = await fetch(`${endpoint}/api/products`);
            const data = await res.json();
            products = Array.isArray(data) ? data : (data.products || []);
        } catch (e) {
            addLog('❌ ดึงสินค้าไม่สำเร็จ: ' + e.message);
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

        // 9. Send fill command
        let postLink = null;
        try {
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'FILL_POST',
                data: { caption, imageUrl: product.image }
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

async function addLog(msg) {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.log = [msg, ...(autoPostState.log || [])].slice(0, 20);
        await chrome.storage.local.set({ autoPostState });
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
const HEARTBEAT_ALARM = 'CHOBSHOP_HEARTBEAT';

// Register Heartbeat Alarm
chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });

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
        const { botName, apiEndpoint } = await chrome.storage.sync.get(['botName', 'apiEndpoint']);
        if (!botName) return; // Don't report if unnamed

        const endpoint = apiEndpoint || 'https://chob.shop';
        const { autoPostState } = await chrome.storage.local.get('autoPostState');
        const manifest = chrome.runtime.getManifest();

        const status = (autoPostState && autoPostState.isRunning) ? 'active' : 'idle';
        const stats = {
            postCount: autoPostState ? autoPostState.postCount : 0,
            lastPostTime: autoPostState ? autoPostState.lastPostTime : null,
            interval: autoPostState ? autoPostState.intervalMinutes : null,
            isPosting: autoPostState ? !!autoPostState.isPosting : false
        };

        const body = {
            bot_name: botName,
            browser_type: 'Chrome', // Could be refined
            status,
            stats,
            version: manifest.version
        };

        const res = await fetch(`${endpoint}/api/bots/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (data.success) {
            console.log(`[Heartbeat] Reported as "${botName}" - ${status}`);
        }
    } catch (err) {
        console.error('[Heartbeat] Failed:', err);
    }
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}
