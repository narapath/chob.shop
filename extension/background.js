// ChobShop Auto-Post Background Service Worker
// Uses Chrome Alarms API to schedule posts and cycle through Facebook groups

const ALARM_NAME = 'CHOBSHOP_AUTO_POST';
const HEARTBEAT_ALARM = 'CHOBSHOP_HEARTBEAT';
let logQueue = []; // Queue for syncing to server
let lastPing = 0;   // Store last heartbeat duration

console.log('[ChobShop] Background Service Worker Loaded');

// Top-level error catcher to storage
self.addEventListener('error', (event) => {
    const errorMsg = `[TopLevelError] ${event.message} at ${event.filename}:${event.lineno}`;
    chrome.storage.local.set({ backgroundError: errorMsg });
    console.error(errorMsg);
});

// Listen for errors
self.onerror = (message, source, lineno, colno, error) => {
    console.error('[Background Error]', message, error);
    addLog(`🚨 ระบบหลังบ้านพบข้อผิดพลาด: ${message}`, 'ERROR');
};

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('[AutoPost] Alarm fired, starting auto-post cycle...');
        await executeAutoPost();
    } else if (alarm.name === HEARTBEAT_ALARM) {
        await sendHeartbeat();
    }
});

// Clear alarms on install/update then recreate to ensure persistence
chrome.runtime.onInstalled.addListener(() => {
    setupAlarms();
    migrateTemplate();
    console.log('[AutoPost] Extension installed/updated, alarms initialized.');

    // Set side panel to open on action click (Chrome 116+)
    if (chrome.sidePanel && chrome.sidePanel.setPanelOptions) {
        chrome.sidePanel.setPanelOptions({
            path: 'popup.html',
            enabled: true
        }).catch(err => console.error(err));
    }
});

// Configure Side Panel (Global)
if (chrome.sidePanel && chrome.sidePanel.setPanelOptions) {
    chrome.sidePanel.setPanelOptions({
        path: 'popup.html',
        enabled: true
    }).catch(err => console.error('[SidePanel] Config Error:', err));
}

// Enable one-click side panel (Chrome 116+)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error(error));
}

// Open side panel on click (Fallback for older versions)
chrome.action.onClicked.addListener((tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch(err => {
            console.error('[SidePanel] Open Error:', err);
        });
    }
});

async function migrateTemplate() {
    chrome.storage.sync.get(['captionTemplate'], (result) => {
        if (!result.captionTemplate) {
            chrome.storage.sync.set({ captionTemplate: '{{title}} ✨\n{{desc}}\n\n💰 งบประมาณ: {{price}}.-\n📍 พิกัดช้อปตรงนี้เลยครับ 👇\n{{link}}' });
        }
    });
}

function setupAlarms() {
    chrome.alarms.clearAll(() => {
        chrome.storage.local.get('autoPostState', (res) => {
            if (res.autoPostState && res.autoPostState.isRunning) {
                const mins = res.autoPostState.intervalMinutes || 10;
                chrome.alarms.create(ALARM_NAME, { delayInMinutes: mins });
            }
        });
        // Heartbeat every minute
        chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
    });
}

// Receive messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[ChobShop] Incoming message:', request.action);

    if (request.action === 'START_AUTO_POST') {
        startAutoPost(request.intervalMinutes)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'STOP_AUTO_POST') {
        stopAutoPost()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'GET_AUTO_STATUS') {
        (async () => {
            try {
                const { autoPostState = {} } = await chrome.storage.local.get('autoPostState');
                const alarm = await chrome.alarms.get(ALARM_NAME);
                sendResponse({
                    state: autoPostState,
                    nextAlarm: alarm ? alarm.scheduledTime : null
                });
            } catch (err) {
                sendResponse({ error: err.message });
            }
        })();
        return true;
    }
    if (request.action === 'RESET_AUTO_STATE') {
        const initialState = {
            isRunning: false,
            isPosting: false,
            intervalMinutes: 10,
            postCount: 0,
            lastPostTime: 0,
            log: [],
            groupIndex: 0,
            currentActivity: '🆕 ระบบถูกรีเซ็ตแล้ว'
        };
        chrome.storage.local.set({ autoPostState: initialState }, () => {
            chrome.alarms.clearAll();
            sendResponse({ success: true });
        });
        return true;
    }
    if (request.action === 'FORCE_POST_NOW') {
        executeAutoPost()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    }
    if (request.action === 'PING_BACKGROUND') {
        sendResponse({ success: true, timestamp: Date.now() });
        return true;
    }
    if (request.action === 'SCRAPE_PRODUCT') {
        scrapeProduct(request.url).then(sendResponse);
        return true;
    }
    if (request.action === 'UPDATE_INTERVAL') {
        updateInterval(request.intervalMinutes).then(sendResponse);
        return true;
    }

    if (request.action === 'SEND_HEARTBEAT') {
        console.log('💓 [Manual] Heartbeat request received from popup');
        sendHeartbeat().then(() => sendResponse({ success: true }));
        return true;
    }

    if (request.type === 'RESTRICTION_DETECTED') {
        console.error('🚨 [Background] Restriction detected from content script!');
        stopAutoPost().then(() => {
            addLog(`❌ ${request.message}`, 'ERROR', 'RESTRICTION_DETECTED');
        });
        return true;
    }
});

async function startAutoPost(intervalMinutes) {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    const prevLastPostTime = autoPostState ? autoPostState.lastPostTime : 0;

    const newState = {
        isRunning: true,
        isPosting: false, // Default
        intervalMinutes: intervalMinutes || 10,
        postCount: autoPostState ? autoPostState.postCount : 0,
        lastPostTime: prevLastPostTime,
        log: autoPostState ? autoPostState.log : [],
        groupIndex: autoPostState ? autoPostState.groupIndex : 0,
        currentActivity: '🚀 กำลังเริ่มต้นระบบ...'
    };

    // Check if we should post immediately or just schedule
    const now = Date.now();
    const timeSinceLastPost = now - prevLastPostTime;
    const intervalMs = (newState.intervalMinutes) * 60 * 1000;

    if (prevLastPostTime === 0 || timeSinceLastPost >= intervalMs) {
        // First time ever OR enough time has passed → post immediately
        console.log('[AutoPost] First start or interval elapsed, posting immediately.');
        newState.isPosting = true;
        newState.currentActivity = '⚙️ กำลังเตรียมระบบโพสต์ด่วน...';
        await chrome.storage.local.set({ autoPostState: newState });
        await addLog('▶️ ได้รับคำสั่งเริ่มงาน (Manual Start)', 'INFO');

        executeAutoPost();
        await chrome.alarms.create(ALARM_NAME, { delayInMinutes: newState.intervalMinutes });
    } else {
        // Recently posted (stop→start) → just schedule, don't double-post
        const remainingMs = intervalMs - timeSinceLastPost;
        const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
        console.log(`[AutoPost] Recently posted ${Math.round(timeSinceLastPost / 1000)}s ago. Next post in ${remainingMin}min.`);

        newState.isPosting = false;
        newState.currentActivity = `⏳ รอรอบถัดไป (${remainingMin} นาที)`;
        await chrome.storage.local.set({ autoPostState: newState });

        addLog(`⏳ โพสต์ล่าสุดเมื่อ ${Math.round(timeSinceLastPost / 60000)} นาทีก่อน — รอครั้งถัดไปใน ${remainingMin} นาที`);
        await chrome.alarms.create(ALARM_NAME, { delayInMinutes: remainingMin });
    }

    console.log('[AutoPost] Service started');
    return { success: true };
}

async function stopAutoPost() {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.isRunning = false;
        autoPostState.isPosting = false;
        autoPostState.postCount = 0;   // Reset count on stop
        autoPostState.groupIndex = 0;  // Reset rotation on stop
        autoPostState.lastPostTime = 0; // Reset timer so next Start posts immediately
        autoPostState.currentActivity = '🛑 หยุดการทำงาน';
        await chrome.storage.local.set({ autoPostState });
    } else {
        // Initialize as stopped state if doesn't exist
        await chrome.storage.local.set({
            autoPostState: {
                isRunning: false,
                isPosting: false,
                lastPostTime: 0,
                postCount: 0,
                groupIndex: 0,
                currentActivity: '🛑 หยุดการทำงาน'
            }
        });
    }
    await chrome.alarms.clear(ALARM_NAME);
    console.log('[AutoPost] Service stopped');
    return { success: true };
}

async function updateInterval(minutes) {
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (autoPostState) {
        autoPostState.intervalMinutes = minutes;
        await chrome.storage.local.set({ autoPostState });
        if (autoPostState.isRunning) {
            // Re-schedule upcoming alarm
            await chrome.alarms.create(ALARM_NAME, { delayInMinutes: minutes });
        }
    }
    return { success: true };
}

async function executeAutoPost() {
    let { autoPostState } = await chrome.storage.local.get('autoPostState');
    if (!autoPostState || !autoPostState.isRunning) {
        console.warn('[AutoPost] Skip execution: state is null or isRunning is false');
        return;
    }

    addLog('🚀 ระบบกำลังเริ่มการโพสต์อัตโนมัติ...', 'INFO', 'POST_START');

    // --- Staleness / Hang Check ---
    const now = Date.now();
    const timeSinceLast = now - (autoPostState.lastPostTime || 0);
    const isStuck = autoPostState.isPosting && timeSinceLast > 3 * 60 * 1000; // Reduced to 3 minutes

    if (autoPostState.isPosting && !isStuck) {
        console.warn('[AutoPost] Already posting, skipping.');
        addLog('⚠️ ข้ามรอบ (ระบบกำลังทำงานค้างอยู่)', 'WARN');
        return;
    }

    if (isStuck) {
        console.warn('[AutoPost] Detected hung posting state. Force resetting.');
        addLog('⚠️ ตรวจพบระบบค้าง กำลังรีเซ็ต...', 'WARN');
        autoPostState.isPosting = false;
    }

    // --- Time Check to Prevent Doppelgangers ---
    const minGap = (autoPostState.intervalMinutes || 10) * 60 * 1000 * 0.5;
    if (autoPostState.lastPostTime > 0 && (now - autoPostState.lastPostTime < minGap)) {
        console.info('[AutoPost] Fired too soon, skipping.');
        addLog('⏳ เร็วเกินไป ข้ามรอบเพื่อรักษาจังหวะ', 'INFO');
        return;
    }

    autoPostState.isPosting = true;
    autoPostState.currentActivity = '⚙️ กำลังเตรียมข้อมูล...';
    await saveState(autoPostState);
    addLog('📦 กำลังเตรียมสินค้าและกลุ่ม...', 'INFO');

    try {
        // 1. Get configurations
        const { botName, apiEndpoint } = await chrome.storage.local.get(['botName', 'apiEndpoint']);
        const { fbGroups = [] } = await chrome.storage.local.get('fbGroups');
        const { products = [] } = await chrome.storage.local.get('products');
        const { captionTemplate: template } = await chrome.storage.sync.get('captionTemplate');

        if (!fbGroups || fbGroups.length === 0 || !products || products.length === 0) {
            throw new Error('ไม่พบข้อมูลกลุ่มหรือสินค้า (โปรดเปิด Popup เพื่อซิงค์ข้อมูล)');
        }

        // --- Execute Single Post ---
        const group = fbGroups[autoPostState.groupIndex % fbGroups.length];
        const product = products[Math.floor(Math.random() * products.length)];

        addLog(`🎯 เลือกโพสต์: "${product.title.substring(0, 30)}..." ลงกลุ่ม "${group.name}"`, 'INFO');

        // 4. Generate Caption
        const boldTitle = toUnicodeBold(product.title);
        const currentTemplate = template || '{{title}} ✨\n{{desc}}\n\n💰 งบประมาณ: {{price}}.-\n📍 พิกัดช้อปตรงนี้เลยครับ 👇\n{{link}}';
        const baseLink = (product.affiliateUrl && product.affiliateUrl.length > 5) ? product.affiliateUrl : `https://chob.shop/?productId=${product.id}`;

        let caption = currentTemplate
            .replace(/{{title}}/g, boldTitle)
            .replace(/{{price}}/g, parseFloat(product.price || 0).toLocaleString())
            .replace(/{{link}}/g, baseLink + '\n')
            .replace(/{{desc}}/g, product.description || '')
            .replace(/{{tags}}/g, '');
        caption = caption.replace(/\n{3,}/g, '\n\n').trim();

        // 5. Navigate
        const tabs = await chrome.tabs.query({ url: "*://*.facebook.com/*" });
        let tabId;
        if (tabs.length > 0) {
            tabId = tabs[0].id;
            autoPostState.currentActivity = `🌐 กำลังไปยังกลุ่ม: ${group.name}`;
            await saveState(autoPostState);
            await chrome.tabs.update(tabId, { url: group.url, active: true });
        } else {
            autoPostState.currentActivity = `🌐 กำลังเปิดกลุ่มใหม่: ${group.name}`;
            await saveState(autoPostState);
            const newTab = await chrome.tabs.create({ url: group.url });
            tabId = newTab.id;
        }

        addLog(`🌐 กำลังโหลดหน้ากลุ่ม: ${group.name} (รอสักครู่...)`, 'INFO', 'NAVIGATING');

        // Wait for page load with status updates
        for (let s = 12; s > 0; s--) {
            autoPostState.currentActivity = `⏳ รอตัวหน้าเว็บโหลด... (${s} วินาที)`;
            await saveState(autoPostState);
            await new Promise(r => setTimeout(r, 1000));
        }

        // 6.5 Prepare Image
        autoPostState.currentActivity = `🖼️ กำลังเตรียมรูปภาพ...`;
        await saveState(autoPostState);

        let finalImageUrl = product.image;
        if (product.image && !product.image.startsWith('data:')) {
            try {
                const imgUrl = product.image.startsWith('//') ? 'https:' + product.image : product.image;
                const base64Result = await fetchImageAsBase64(imgUrl);
                if (base64Result) finalImageUrl = base64Result;
            } catch (e) { console.error('Img error:', e); }
        }

        // 7. Send fill command
        let postLink = null;
        let postStatus = 'FAILED';
        try {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Content script timeout')), 60000)
            );

            autoPostState.currentActivity = `📤 กำลังส่งข้อมูลไปยังหน้า Facebook...`;
            await saveState(autoPostState);
            addLog('📤 กำลังส่งข้อมูลและรูปภาพเข้าหน้าเว็บ Facebook...', 'INFO');

            const response = await Promise.race([
                chrome.tabs.sendMessage(tabId, { action: 'FILL_POST', data: { caption, imageUrl: finalImageUrl } }),
                timeoutPromise
            ]);

            if (!response) throw new Error('ไม่ได้รับการตอบกลับจากหน้าเว็บ');

            autoPostState.currentActivity = `🔍 กำลังตรวจสอบผลการโพสต์...`;
            await saveState(autoPostState);

            const result = response ? response.postLink : { status: 'FAILED', url: null };

            // --- EMERGENCY BREAK: If restricted, stop everything immediately ---
            if (result && result.status === 'RESTRICTED') {
                console.error('[AutoPost] 🚨 Account is RESTRICTED. Stopping bot.');
                await stopAutoPost(); // This will set isRunning to false
                addLog('❌ บอทหยุดทำงานทันทีเนื่องจากบัญชีถูกระงับการโพสต์ (Spam Protection)', 'ERROR', 'RESTRICTION_STOP');
                return;
            }

            postLink = result ? result.url : null;
            postStatus = result ? (result.status || 'FAILED') : 'FAILED';
        } catch (msgErr) {
            console.error('[AutoPost] Messaging error:', msgErr.message);
            addLog('⚠️ การติดต่อหน้าเว็บล้มเหลว: ' + msgErr.message, 'WARN', 'MSG_FAIL');
        }

        // 8. Update stats
        autoPostState.postCount += 1;
        autoPostState.lastPostTime = Date.now();
        autoPostState.groupIndex = (autoPostState.groupIndex || 0) + 1;
        if (autoPostState.groupIndex >= fbGroups.length) autoPostState.groupIndex = 0;

        const timeStr = new Date().toLocaleTimeString('th-TH');
        let statusIcon = '✅', statusText = 'โพสต์สำเร็จ';
        if (postStatus === 'PENDING') { statusIcon = '⏳'; statusText = 'รออนุมัติ'; }
        else if (!postLink) { statusIcon = '❌'; statusText = 'ไม่พบลิงก์'; }

        addLog(`${statusIcon} ${timeStr} | ${statusText} | "${group.name}"`, postStatus === 'FAILED' ? 'ERROR' : 'SUCCESS', 'POST_FINISHED', {
            group: group.name, product: product.title, link: postLink, status: postStatus
        });

        // Save history
        const { postHistory = [] } = await chrome.storage.local.get('postHistory');
        const updatedHistory = [{
            id: Date.now(), timestamp: new Date().toISOString(), groupName: group.name,
            productTitle: product.title, link: postLink, status: postStatus,
            image: finalImageUrl
        }, ...postHistory].slice(0, 50);
        await chrome.storage.local.set({ postHistory: updatedHistory, autoPostState }); // Save intermediate state

        // --- End Single Post ---

    } catch (err) {
        console.error('[AutoPost] Global Error:', err);
        addLog('❌ ระบบขัดข้อง: ' + err.message);
    } finally {
        // ALWAYS reset isPosting and schedule next
        const { autoPostState: finalState } = await chrome.storage.local.get('autoPostState');
        if (finalState) {
            finalState.isPosting = false;
            await chrome.storage.local.set({ autoPostState: finalState });
            if (finalState.isRunning) await scheduleNextAlarm(finalState);
        }
    }
}

async function scheduleNextAlarm(state) {
    const minutes = state.intervalMinutes || 10;
    console.log(`[AutoPost] Scheduling next alarm in ${minutes} minutes`);
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: minutes });
}

async function addLog(msg, type = 'INFO', action = 'LOG', details = {}) {
    // CRITICAL FIX: Only modify the log array. Do NOT create default state 
    // with isRunning:false — that was overwriting startAutoPost's state!
    try {
        const result = await chrome.storage.local.get('autoPostState');
        const state = result.autoPostState;
        if (state) {
            state.log = [msg, ...(state.log || [])].slice(0, 30);
            await chrome.storage.local.set({ autoPostState: state });
        }
    } catch (err) {
        console.error('[addLog] Error:', err);
    }

    // Add to sync queue for server
    logQueue.push({
        status: type,
        message: msg,
        action: action,
        details: details,
        timestamp: new Date().toISOString()
    });

    if (action === 'POST_FINISHED' || type === 'ERROR' || type === 'WARN' || action === 'POST_START') {
        sendHeartbeat();
    }
}

async function sendHeartbeat() {
    const { botName, apiEndpoint } = await chrome.storage.local.get(['botName', 'apiEndpoint']);
    const { autoPostState } = await chrome.storage.local.get('autoPostState');
    const { lastCommandTs } = await chrome.storage.local.get('lastCommandTs');
    const { postHistory = [] } = await chrome.storage.local.get('postHistory');

    if (!apiEndpoint) return;

    // Determine Status
    let status = 'IDLE';
    if (autoPostState?.isRunning) {
        status = autoPostState.isPosting ? 'POSTING' : 'ACTIVE';
    }

    const stats = {
        postCount: autoPostState?.postCount || 0,
        lastActive: new Date().toISOString(),
        ping: lastPing,
        interval: autoPostState?.intervalMinutes || 15,
        isPosting: autoPostState?.isPosting || false,
        activity: autoPostState?.currentActivity || 'IDLE',
        next_run: (await chrome.alarms.get(ALARM_NAME))?.scheduledTime || null,
        history: postHistory.slice(0, 10) // Send last 10 entries to server
    };

    const payload = {
        bot_name: botName || 'Unnamed Bot',
        status: status,
        stats: stats,
        new_logs: logQueue,
        ack_command_ts: lastCommandTs,
        version: '1.3.0'
    };

    try {
        const start = Date.now();
        const response = await fetch(`${apiEndpoint}/api/bots/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        lastPing = Date.now() - start;

        if (response.ok) {
            const data = await response.json();
            // Save heartbeat status for popup UI
            await chrome.storage.local.set({
                lastHeartbeat: Date.now(),
                lastPing: lastPing
            });

            logQueue = []; // Clear queue on success

            // Process Commands from Remote
            if (data.command && data.command.action && data.command.timestamp !== lastCommandTs) {
                const cmd = data.command;
                console.log('🕹️ [Remote] Executing command:', cmd.action);

                if (cmd.action === 'START') {
                    await startAutoPost(cmd.interval || 15);
                } else if (cmd.action === 'STOP') {
                    await stopAutoPost();
                } else if (cmd.action === 'SET_INTERVAL') {
                    await updateInterval(cmd.interval || 15);
                }

                // Save ack
                await chrome.storage.local.set({ lastCommandTs: cmd.timestamp });
            }
        }
    } catch (err) {
        console.warn('[Heartbeat] Failed to sync:', err.message);
    }
}

// Alarm for heartbeat
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
        sendHeartbeat();
    }
});
// Fetch any image URL and convert to Base64 data URI
async function fetchImageAsBase64(imageUrl) {
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`[ImageFetch] Fetching image (attempt ${attempt + 1}):`, imageUrl);
            addLog(`🖼️ กำลังดึงรูปภาพ (ครั้งที่ ${attempt + 1})...`, 'INFO');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

            const response = await fetch(imageUrl, {
                headers: {
                    'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
                    'Referer': 'https://shopee.co.th/'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) {
                console.warn('[ImageFetch] Response is not an image:', blob.type);
                if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 1000)); continue; }
                return null;
            }

            const buffer = await blob.arrayBuffer();
            const binary = new Uint8Array(buffer);
            let binaryString = '';
            const chunkSize = 8192;
            for (let i = 0; i < binary.length; i += chunkSize) {
                const chunk = binary.subarray(i, i + chunkSize);
                binaryString += String.fromCharCode.apply(null, chunk);
            }
            const base64 = `data:${blob.type};base64,` + btoa(binaryString);
            console.log(`[ImageFetch] Success! Base64 size: ${(base64.length / 1024).toFixed(1)}KB`);
            addLog(`✅ ดึงรูปภาพสำเร็จ (${(base64.length / 1024).toFixed(1)}KB)`, 'INFO');
            return base64;
        } catch (err) {
            console.error(`[ImageFetch] Attempt ${attempt + 1} failed:`, err);
            addLog(`⚠️ ดึงรูปภาพล้มเหลว (ครั้งที่ ${attempt + 1}): ${err.message}`, 'WARN');
            if (attempt < MAX_RETRIES) { await new Promise(r => setTimeout(r, 1000)); continue; }
            return null;
        }
    }
    return null;
}

async function scrapeProduct(url) {
    if (!url) return { success: false, error: 'No URL' };
    try {
        console.log('[Background] Scraping:', url);
        const response = await fetch(url);
        const html = await response.text();

        // 1. Flexible Meta Detection
        const findTargetInMeta = (prop) => {
            const regexes = [
                new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`, 'i'),
                new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${prop}"`, 'i')
            ];
            for (const r of regexes) {
                const m = html.match(r);
                if (m) return m[1].replace(/&amp;/g, '&');
            }
            return null;
        };

        let imageUrl = findTargetInMeta('og:image') || findTargetInMeta('twitter:image');

        // 2. Itemprop Fallback
        if (!imageUrl) {
            const itemPropMatch = html.match(/itemprop="image"\s+content="([^"]+)"/i)
                || html.match(/content="([^"]+)"\s+itemprop="image"/i);
            if (itemPropMatch) imageUrl = itemPropMatch[1];
        }

        // 3. Script-based CDN Fallback (Common in Shopee - multiple CDN domains)
        if (!imageUrl) {
            const cdnPatterns = [
                /https:\/\/down-th\.img\.susercontent\.com\/file\/[a-z0-9_-]+/i,
                /https:\/\/cf\.shopee\.co\.th\/file\/[a-z0-9_-]+/i,
                /https:\/\/[a-z0-9-]+\.susercontent\.com\/file\/[a-z0-9_-]+/i
            ];
            for (const pattern of cdnPatterns) {
                const cdnMatch = html.match(pattern);
                if (cdnMatch) { imageUrl = cdnMatch[0]; break; }
            }
        }

        if (imageUrl) {
            console.log('[Scraper] Resolved image:', imageUrl);
            const base64 = await fetchImageAsBase64(imageUrl);
            if (base64) return { success: true, base64 };
        }

        return { success: false, error: 'Could not find product image (OG Image missing)' };
    } catch (err) {
        console.error('[Scraper] Error:', err);
        return { success: false, error: err.message };
    }
}

async function saveState(state) {
    if (!state) return;
    await chrome.storage.local.set({ autoPostState: state });
}

function toUnicodeBold(text) {
    const normal = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bold = "𝐀𝐁𝐂𝐃𝐄𝐅𝐆𝐇𝐈𝐉𝐊𝐋𝐌𝐍𝐎𝐏𝐐𝐑𝐒𝐓𝐔𝐕𝐖𝐗𝐘𝐙𝐚𝐛𝐜𝐝𝐞𝐟𝐠𝐡𝐢𝐣𝐤𝐥𝐦𝐧𝐨𝐩𝐪𝐫𝐬𝐭𝐮𝐯𝐰𝐱𝐲𝐳𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟗";
    return text.split('').map(char => {
        const index = normal.indexOf(char);
        return index > -1 ? bold.substr(index * 2, 2) : char;
    }).join('');
}
