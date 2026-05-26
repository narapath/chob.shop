if (!window.ChobShopInitialized) {
    window.ChobShopInitialized = true;
    console.log('ChobShop Extension initialized on Facebook');

    // Inject Bot Controller Widget (Only on groups)
    if (window.location.href.includes('/groups/')) {
        injectBotController();
    }

    // Listen for state updates from background or popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'UPDATE_WIDGET_STATE') {
            updateBotController(request.state);
        }

        if (request.action === 'FILL_POST') {
            // Check global lock on window
            if (window.ChobShopProcessing) {
                console.warn('Already processing a fill request, ignoring duplicate.');
                sendResponse({ success: true, alreadyProcessing: true });
                return;
            }

            window.ChobShopProcessing = true;
            updateStatus('🚀 กำลังเตรียมการ...', true);

            fillFacebookPost(request.data.caption, request.data.imageUrl)
                .then((postLink) => {
                    updateStatus('✅ โพสต์สำเร็จ!', false, 3000);
                    sendResponse({ success: true, postLink: postLink });
                })
                .catch(err => {
                    console.error('Fill post error:', err);
                    updateStatus('❌ เกิดข้อผิดพลาด: ' + err.message, false, 5000);
                    sendResponse({ success: false, error: err.message });
                })
                .finally(() => {
                    window.ChobShopProcessing = false;
                });
            return true; // Keep channel open for async
        }
    });

    // Sync with storage changes for real-time widget updates
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.autoPostState) {
            updateBotController(changes.autoPostState.newValue);
        }
    });
}

function updateStatus(msg, persistent = false, timeout = 3000) {
    let overlay = document.getElementById('chobshop-status-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'chobshop-status-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: #1e293b;
            color: white;
            border-radius: 8px;
            z-index: 10000;
            font-family: sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            border-left: 4px solid #3b82f6;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(overlay);
    }
    overlay.innerText = msg;
    overlay.style.display = 'block';

    if (!persistent) {
        setTimeout(() => {
            overlay.style.display = 'none';
        }, timeout);
    }
}

async function fillFacebookPost(caption, imageUrl) {
    updateStatus('📝 กำลังกรอกข้อมูล...');

    // 1. Find the "What's on your mind?" button
    const recognizedTexts = [
        "เขียนอะไรสักหน่อย",
        "คุณคิดอะไรอยู่",
        "What's on your mind",
        "เขียนอะไรบางอย่าง",
        "Create a public post",
        "Write something",
        "Write a post"
    ];
    let opener = null;
    const possibleOpeners = document.querySelectorAll('.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6, .x1i10hfl.xjbqb8w.x1ejq31n.xd10rxx.x1sy0etr.x17r0tee');
    for (const el of possibleOpeners) {
        const text = el.innerText || "";
        if ((text.includes('เขียนอะไร') || text.includes('Write something') || text.includes('mind')) && el.offsetWidth > 0) {
            opener = el.closest('div[role="button"]') || el;
            break;
        }
    }

    if (!opener) {
        const elements = document.querySelectorAll('div[role="button"], span, div');
        for (const el of elements) {
            const text = (el.innerText || "").trim();
            if (recognizedTexts.some(t => text.includes(t)) && el.offsetWidth > 0) {
                opener = el.closest('div[role="button"]') || el;
                break;
            }
        }
    }

    if (!opener) throw new Error('ไม่พบปุ่มเริ่มโพสต์');
    opener.click();

    // 2. Wait for composer
    let textbox = null;
    let dialog = null;
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 400));
        dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
            const p = dialog.querySelector('p.xdj266r.x14z9mp.xat24cr.x1lziwak.x16tdsg8');
            textbox = p ? p.closest('div[contenteditable="true"]') :
                (dialog.querySelector('div[role="textbox"][contenteditable="true"]') || dialog.querySelector('div[contenteditable="true"]'));
            if (textbox) break;
        }
    }

    if (!textbox) throw new Error('ไม่พบช่องใส่ข้อความ');

    // 3. Insert Text
    textbox.focus();

    // Improved clearing: Select all and delete
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 200));

    // Double check if cleared, if not, try setting innerText directly
    if ((textbox.innerText || "").length > 5) {
        console.warn('[ChobShop] execCommand failed to clear, forcing empty innerText');
        textbox.innerText = '';
        await new Promise(r => setTimeout(r, 100));
    }

    // Use Paste Simulation as primary method (most reliable for multiline on Lexical)
    console.log('[ChobShop] Using paste simulation for formatting preservation');
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', caption);
    const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true
    });
    textbox.dispatchEvent(pasteEvent);

    await new Promise(r => setTimeout(r, 500));

    // Final verification & fallback
    if ((textbox.innerText || "").length < 5) {
        console.warn('[ChobShop] Paste failed, falling back to insertText');
        document.execCommand('insertText', false, caption);
    }

    await new Promise(r => setTimeout(r, 500));
    textbox.dispatchEvent(new Event('input', { bubbles: true }));
    textbox.style.outline = '4px solid #10b981';

    // 4. Auto-Submit with Sanity Check
    updateStatus('🔘 รอโหลดรูปภาพ (5 วินาที)...');
    await new Promise(r => setTimeout(r, 5000)); // Increased from 2s to 5s to allow media load

    let postButton = null;
    if (dialog) {
        const candidates = Array.from(dialog.querySelectorAll('div[role="button"]'));
        postButton = candidates.find(btn => {
            const text = (btn.innerText || "").trim().toLowerCase();
            const label = (btn.getAttribute('aria-label') || "").toLowerCase();
            const isVisible = btn.offsetWidth > 0 && btn.offsetHeight > 30;
            const hasPostText = text === 'โพสต์' || text === 'post' || label === 'post' || label === 'โพสต์';
            return isVisible && hasPostText && !text.includes('ปิด') && !text.includes('close');
        });
    }

    if (postButton) {
        console.log('Clicking post button automatically (Ultra-Stable)');

        // Try multiple click methods to bypass React event overrides
        postButton.click();

        // Secondary sanity click with real event dispatch
        setTimeout(() => {
            if (document.querySelector('div[role="dialog"]')) {
                console.log('Sanity check: Dialog still open, trying event dispatch...');
                postButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                postButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                postButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            }
        }, 1500);

        // --- NEW: Wait for post to finish and capture link ---
        updateStatus('⏳ กำลังบันทึกโพสต์...', true);

        // 1. Wait for dialog to disappear (up to 20s)
        let dialogGone = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (!document.querySelector('div[role="dialog"]')) {
                dialogGone = true;
                break;
            }
        }

        if (dialogGone) {
            // 2. Wait for page to settle and look for the new post link
            await new Promise(r => setTimeout(r, 3000));
            try {
                const postLink = await findJustNowPostLink();
                if (postLink) {
                    console.log('Captured post link:', postLink);
                    return postLink;
                }
            } catch (e) {
                console.warn('Failed to capture post link:', e);
            }
        }
    } else {
        console.warn('Post button not found');
    }
    return null;
}

function injectBotController() {
    if (document.getElementById('chobshop-bot-controller')) return;

    const widget = document.createElement('div');
    widget.id = 'chobshop-bot-controller';
    widget.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 240px;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        color: white;
        z-index: 9999;
        font-family: 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-bottom: 4px solid #475569;
    `;

    widget.innerHTML = `
        <div style="background: rgba(255,255,255,0.05); padding: 10px 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 18px;">🤖</span>
                <span style="font-weight: 700; font-size: 13px; letter-spacing: 0.5px;">CHOB.SHOP BOT</span>
            </div>
            <div id="widget-toggle" style="cursor: pointer; font-size: 12px; opacity: 0.6;">▼</div>
        </div>
        <div id="widget-body" style="padding: 15px; display: flex; flex-direction: column; gap: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">STATUS</span>
                <span id="widget-status" style="font-size: 10px; background: #334155; padding: 2px 8px; border-radius: 10px; font-weight: 800;">OFFLINE</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">ACTIVE IN</span>
                <span id="widget-group" style="font-size: 11px; font-weight: 500; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;">-</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
                <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">POSTS</span>
                <span id="widget-count" style="font-size: 18px; font-weight: 800; color: #fbbf24;">0</span>
            </div>
            <button id="widget-action-btn" style="width: 100%; padding: 10px; border: none; border-radius: 8px; background: #6366f1; color: white; font-weight: 700; cursor: pointer; transition: 0.2s; font-size: 13px;">START AUTO</button>
        </div>
    `;

    document.body.appendChild(widget);

    // Initial State Fetch
    chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
        if (response && response.state) {
            updateBotController(response.state);
        }
    });

    // Event Listeners
    const toggleBtn = widget.querySelector('#widget-toggle');
    const body = widget.querySelector('#widget-body');
    let collapsed = false;

    toggleBtn.onclick = () => {
        collapsed = !collapsed;
        body.style.display = collapsed ? 'none' : 'flex';
        toggleBtn.innerText = collapsed ? '▲' : '▼';
        widget.style.width = collapsed ? '180px' : '240px';
    };

    const actionBtn = widget.querySelector('#widget-action-btn');
    actionBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
            const isRunning = response && response.state && response.state.isRunning;
            if (isRunning) {
                chrome.runtime.sendMessage({ action: 'STOP_AUTO_POST' }, (res) => {
                    if (res && res.success) {
                        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (r) => updateBotController(r.state));
                    }
                });
            } else {
                // For simplicity, start with default 10 min interval if starting from widget
                chrome.runtime.sendMessage({ action: 'START_AUTO_POST', intervalMinutes: 10 }, (res) => {
                    if (res && res.success) {
                        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (r) => updateBotController(r.state));
                    }
                });
            }
        });
    };
}

function updateBotController(state) {
    const widget = document.getElementById('chobshop-bot-controller');
    if (!widget || !state) return;

    const statusEl = widget.querySelector('#widget-status');
    const actionBtn = widget.querySelector('#widget-action-btn');
    const countEl = widget.querySelector('#widget-count');
    const groupEl = widget.querySelector('#widget-group');

    countEl.innerText = state.postCount || 0;

    if (state.isRunning) {
        statusEl.innerText = state.isPosting ? 'WORKING...' : 'ACTIVE';
        statusEl.style.background = state.isPosting ? '#e11d48' : '#10b981';
        actionBtn.innerText = 'STOP AUTO';
        actionBtn.style.background = '#f43f5e';
        widget.style.borderBottom = '4px solid #10b981';

        // Extract group name from last log if available
        if (state.log && state.log.length > 0) {
            const lastLog = state.log[0];
            if (lastLog.includes('|')) {
                const parts = lastLog.split('|');
                if (parts.length > 1) groupEl.innerText = parts[1].trim();
            }
        }
    } else {
        statusEl.innerText = 'OFFLINE';
        statusEl.style.background = '#334155';
        actionBtn.innerText = 'START AUTO';
        actionBtn.style.background = '#6366f1';
        widget.style.borderBottom = '4px solid #475569';
        groupEl.innerText = '-';
    }
}

async function findJustNowPostLink() {
    // Look for links that contain "Just now" or "เมื่อสักครู่"
    const timeTexts = ["Just now", "เมื่อสักครู่", "1 min", "1 นาที"];
    const links = Array.from(document.querySelectorAll('a[role="link"], a'));

    // Sort by position (top first)
    const candidates = links.filter(a => {
        const text = (a.innerText || "").trim();
        const href = a.href || "";
        const isGroupPost = href.includes('/groups/') && href.includes('/posts/');
        const isRecent = timeTexts.some(t => text.includes(t));
        const isVisible = a.offsetWidth > 0 && a.getClientRects().length > 0;
        return isGroupPost && isRecent && isVisible;
    });

    if (candidates.length > 0) {
        // Return the one closest to the top of the viewport
        candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        let url = candidates[0].href;
        // Clean up URL (remove tracking params)
        if (url.includes('?')) url = url.split('?')[0];
        if (url.includes('&')) url = url.split('&')[0];
        return url;
    }
    return null;
}
