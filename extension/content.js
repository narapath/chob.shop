if (!window.ChobShopInitialized) {
    window.ChobShopInitialized = true;
    console.log('ChobShop Extension initialized on Facebook');

    // Helper to convert Base64 to File object
    function base64ToFile(base64String, filename) {
        try {
            let arr = base64String.split(','),
                mime = arr[0].match(/:(.*?);/)[1],
                bstr = atob(arr[1]),
                n = bstr.length,
                u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: mime });
        } catch (e) {
            console.error('[ChobShop] Base64 to File failed:', e);
            return null;
        }
    }

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
    const textboxAriaLabels = [
        "สร้างโพสต์สาธารณะ...",
        "สร้างโพสต์...",
        "คุณคิดอะไรอยู่",
        "What's on your mind?",
        "Create a public post...",
        "Write something..."
    ];

    for (let i = 0; i < 20; i++) { // Increased retries
        await new Promise(r => setTimeout(r, 400));
        dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
            // Priority 1: Search by common aria-labels
            for (const label of textboxAriaLabels) {
                textbox = dialog.querySelector(`div[role="textbox"][aria-label*="${label}"]`);
                if (textbox) break;
            }

            if (!textbox) {
                // Priority 2: Precise class-based selector (fallback)
                const p = dialog.querySelector('p.xdj266r.x14z9mp.xat24cr.x1lziwak.x16tdsg8');
                textbox = p ? p.closest('div[contenteditable="true"]') : null;
            }

            if (!textbox) {
                // Priority 3: General role-based search
                textbox = dialog.querySelector('div[role="textbox"][contenteditable="true"]') ||
                    dialog.querySelector('div[contenteditable="true"]');
            }

            if (textbox) break;
        }
    }

    if (!textbox) throw new Error('ไม่พบช่องใส่ข้อความ');

    // 3. Insert Text
    textbox.focus();
    await new Promise(r => setTimeout(r, 300));

    // Click inside textbox to ensure it's truly focused
    textbox.click();
    await new Promise(r => setTimeout(r, 200));

    // --- NEW: Manual Photo Upload Logic ---
    if (imageUrl) {
        updateStatus('🖼️ กำลังอัปโหลดรูปภาพ...');
        try {
            const file = imageUrl.startsWith('data:')
                ? base64ToFile(imageUrl, 'product.jpg')
                : null;

            if (file) {
                // Find hidden file input in the dialog
                const fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
                if (fileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log('[ChobShop] Image uploaded successfully via file input');
                    await new Promise(r => setTimeout(r, 2000)); // Wait for upload to register
                } else {
                    console.warn('[ChobShop] Photo upload input not found');
                }
            }
        } catch (uploadErr) {
            console.error('[ChobShop] Photo upload failed:', uploadErr);
        }
    }

    // Ensure textbox is focused after image upload
    textbox.focus();
    await new Promise(r => setTimeout(r, 200));

    // Clear existing content
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 200));

    if ((textbox.innerText || "").trim().length > 0) {
        textbox.innerHTML = '';
        await new Promise(r => setTimeout(r, 100));
        textbox.focus();
    }

    updateStatus('📝 กำลังใส่ข้อความ...');

    // === METHOD 1: InputEvent insertText (works on modern Lexical) ===
    let inserted = false;
    try {
        const inputEvent = new InputEvent('beforeinput', {
            inputType: 'insertText',
            data: caption,
            bubbles: true,
            cancelable: true,
            composed: true
        });
        textbox.dispatchEvent(inputEvent);
        await new Promise(r => setTimeout(r, 500));
        if ((textbox.innerText || "").trim().length > 5) {
            console.log('[ChobShop] ✅ Method 1 (InputEvent insertText) succeeded');
            inserted = true;
        }
    } catch (e) {
        console.warn('[ChobShop] Method 1 failed:', e);
    }

    // === METHOD 2: Paste simulation ===
    if (!inserted) {
        try {
            textbox.focus();
            const dt = new DataTransfer();
            dt.setData('text/plain', caption);
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            textbox.dispatchEvent(pasteEvent);
            await new Promise(r => setTimeout(r, 500));
            if ((textbox.innerText || "").trim().length > 5) {
                console.log('[ChobShop] ✅ Method 2 (Paste simulation) succeeded');
                inserted = true;
            }
        } catch (e) {
            console.warn('[ChobShop] Method 2 failed:', e);
        }
    }

    // === METHOD 3: execCommand insertText ===
    if (!inserted) {
        try {
            textbox.focus();
            document.execCommand('insertText', false, caption);
            await new Promise(r => setTimeout(r, 500));
            if ((textbox.innerText || "").trim().length > 5) {
                console.log('[ChobShop] ✅ Method 3 (execCommand) succeeded');
                inserted = true;
            }
        } catch (e) {
            console.warn('[ChobShop] Method 3 failed:', e);
        }
    }

    // === METHOD 4: Keyboard simulation character by character ===
    if (!inserted) {
        console.log('[ChobShop] Trying Method 4: keyboard simulation...');
        textbox.focus();
        for (const char of caption) {
            textbox.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
            textbox.dispatchEvent(new InputEvent('beforeinput', {
                inputType: 'insertText',
                data: char,
                bubbles: true,
                cancelable: true,
                composed: true
            }));
            // Also try direct text node insertion
            const textNode = document.createTextNode(char);
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            }
            textbox.dispatchEvent(new InputEvent('input', {
                inputType: 'insertText',
                data: char,
                bubbles: true
            }));
            textbox.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

            // Small delay every 50 chars to avoid overwhelming
            if (caption.indexOf(char) % 50 === 0) {
                await new Promise(r => setTimeout(r, 10));
            }
        }
        await new Promise(r => setTimeout(r, 500));
        if ((textbox.innerText || "").trim().length > 5) {
            console.log('[ChobShop] ✅ Method 4 (keyboard sim) succeeded');
            inserted = true;
        }
    }

    // === LAST RESORT: Direct DOM manipulation ===
    if (!inserted) {
        console.warn('[ChobShop] All methods failed, using direct DOM insertion');
        // Clear and set text directly via paragraph
        const p = textbox.querySelector('p') || textbox;
        p.textContent = caption;
        textbox.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
    }

    await new Promise(r => setTimeout(r, 500));
    textbox.dispatchEvent(new Event('input', { bubbles: true }));
    textbox.style.outline = '4px solid #10b981';

    // 4. Auto-Submit with Sanity Check
    updateStatus('🔘 ตรวจสอบความถูกต้อง (2 วินาที)...');
    await new Promise(r => setTimeout(r, 2000));

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
        width: 280px;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        color: white;
        z-index: 99999;
        font-family: 'Segoe UI', Roboto, Helvetica, sans-serif;
        box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s ease;
        border-bottom: 5px solid #475569;
    `;

    widget.innerHTML = `
        <!-- Header -->
        <div style="background: rgba(255,255,255,0.05); padding: 12px 15px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08);">
            <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 20px;">🤖</span>
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: 800; font-size: 11px; letter-spacing: 1px; color: #94a3b8;">CHOB.SHOP</span>
                    <span style="font-size: 13px; font-weight: 700; color: #f8fafc;">Bot Console</span>
                </div>
            </div>
            <div id="widget-toggle" style="cursor: pointer; padding: 5px; opacity: 0.7; transition: 0.2s;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </div>
        </div>

        <!-- Body -->
        <div id="widget-body" style="display: flex; flex-direction: column;">
            <!-- Tabs Nav -->
            <div style="display: flex; background: rgba(0,0,0,0.2); padding: 4px; margin: 10px 15px 0; border-radius: 8px;">
                <button class="w-tab-btn active" data-tab="status" style="flex:1; border:none; background: transparent; color: white; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer; border-radius: 6px;">Status</button>
                <button class="w-tab-btn" data-tab="config" style="flex:1; border:none; background: transparent; color: #64748b; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer; border-radius: 6px;">Config</button>
                <button class="w-tab-btn" data-tab="logs" style="flex:1; border:none; background: transparent; color: #64748b; font-size: 11px; font-weight: 600; padding: 6px; cursor: pointer; border-radius: 6px;">Logs</button>
            </div>

            <!-- Tab Content: Status -->
            <div id="tab-status" class="w-tab-content" style="padding: 15px; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; color: #94a3b8; font-weight: 700;">STATUS</span>
                    <span id="widget-status" style="font-size: 9px; background: #334155; padding: 2px 10px; border-radius: 20px; font-weight: 900; color: #f8fafc;">OFFLINE</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; color: #94a3b8; font-weight: 700;">PING</span>
                    <span id="widget-ping" style="font-size: 11px; font-weight: 700; color: #10b981;">- ms</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <span style="font-size: 11px; color: #94a3b8; font-weight: 700;">ACTIVE IN</span>
                    <span id="widget-group" style="font-size: 11px; font-weight: 600; text-align: right; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; max-width: 140px; color: #cbd5e1;">-</span>
                </div>
                <div style="background: rgba(0,0,0,0.3); padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
                   <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 9px; color: #64748b; font-weight: 700;">POSTS</span>
                        <span id="widget-count" style="font-size: 22px; font-weight: 900; color: #fbbf24; line-height: 1.2;">0</span>
                   </div>
                   <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 9px; color: #64748b; font-weight: 700;">NEXT RUN</span>
                        <span id="widget-next-run" style="font-size: 13px; font-weight: 700; color: #38bdf8; line-height: 1.2; margin-top: 4px;">-</span>
                   </div>
                   <div style="display: flex; flex-direction: column; align-items: center;">
                        <span style="font-size: 9px; color: #64748b; font-weight: 700;">TARGET</span>
                        <span id="widget-target-count" style="font-size: 18px; font-weight: 700; color: #94a3b8; line-height: 1.2; margin-top: 2px;">-</span>
                   </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
                    <span>⏱ INTERVAL</span>
                    <span id="widget-interval-display" style="color: #cbd5e1; font-weight: 600;">- min</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #64748b;">
                    <span>📅 LAST POST</span>
                    <span id="widget-last-post" style="color: #cbd5e1; font-weight: 600;">-</span>
                </div>
                <button id="widget-action-btn" style="width: 100%; padding: 12px; border: none; border-radius: 10px; background: #6366f1; color: white; font-weight: 800; cursor: pointer; transition: 0.3s; font-size: 13px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">START AUTO</button>
            </div>

            <!-- Tab Content: Config -->
            <div id="tab-config" class="w-tab-content" style="padding: 15px; display: none; flex-direction: column; gap: 15px;">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 11px; color: #94a3b8; font-weight: 700;">INTERVAL (MINUTES)</label>
                    <div style="display: flex; gap: 8px;">
                        <input type="number" id="widget-interval-input" min="1" value="10" style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 8px; color: white; font-size: 13px; font-weight: 600;">
                        <button id="widget-save-interval" style="padding: 0 12px; background: #475569; border: none; border-radius: 6px; color: white; font-size: 11px; font-weight: 700; cursor: pointer;">SET</button>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    <label style="font-size: 11px; color: #94a3b8; font-weight: 700;">GROUPS TO POST</label>
                    <div id="widget-groups-list" style="max-height: 100px; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 10px; font-size: 11px; color: #cbd5e1; display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(255,255,255,0.05);">
                        Loading groups...
                    </div>
                </div>
            </div>

            <!-- Tab Content: Logs -->
            <div id="tab-logs" class="w-tab-content" style="padding: 15px; display: none; flex-direction: column;">
                <label style="font-size: 11px; color: #94a3b8; font-weight: 700; margin-bottom: 8px;">RECENT ACTIVITY</label>
                <div id="widget-log-container" style="height: 140px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 10px; padding: 10px; font-family: 'Consolas', monospace; font-size: 10px; color: #10b981; line-height: 1.4; border: 1px solid rgba(255,255,255,0.05);">
                    No logs yet.
                </div>
            </div>
        </div>

        <style>
            #chobshop-bot-controller .w-tab-btn.active {
                background: #6366f1 !important;
                color: white !important;
                box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
            }
            #chobshop-bot-controller .w-tab-content::-webkit-scrollbar {
                width: 4px;
            }
            #chobshop-bot-controller .w-tab-content::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.1);
                border-radius: 10px;
            }
        </style>
    `;

    document.body.appendChild(widget);

    // --- State & Updates ---
    const refreshData = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
            if (response && response.state) {
                updateBotController(response.state);
            }
        });
        chrome.runtime.sendMessage({ action: 'GET_GROUPS' }, (response) => {
            if (response && response.groups) {
                const listEl = widget.querySelector('#widget-groups-list');
                listEl.innerHTML = '';
                response.groups.forEach((g, idx) => {
                    listEl.innerHTML += `<div style="padding: 5px 8px; background: rgba(255,255,255,0.03); border-radius: 4px; border-left: 2px solid #6366f1;">${idx + 1}. ${g.name}</div>`;
                });
                widget.querySelector('#widget-target-count').innerText = response.groups.length;
                if (response.groups.length === 0) listEl.innerText = 'No groups added yet.';
            }
        });
    };
    refreshData();
    // Auto-refresh data from background every 2 seconds for fresh status
    setInterval(refreshData, 2000);

    // High-frequency 1s interval for countdown only
    setInterval(() => {
        const nextRunEl = widget.querySelector('#widget-next-run');
        if (nextRunEl && nextRunEl.dataset.nextRun) {
            const nextTime = parseInt(nextRunEl.dataset.nextRun);
            if (!isNaN(nextTime)) {
                const diff = nextTime - Date.now();
                if (diff > 0) {
                    const mins = Math.floor(diff / 60000);
                    const secs = Math.floor((diff % 60000) / 1000);
                    nextRunEl.innerText = `${mins}:${String(secs).padStart(2, '0')}`;
                    nextRunEl.style.color = '#38bdf8';
                } else if (diff > -5000) { // Keep "NOW!" for a few seconds
                    // status check will override this via updateBotController
                }
            }
        }
    }, 1000);

    // --- Event Listeners ---

    // Tab Switching
    widget.querySelectorAll('.w-tab-btn').forEach(btn => {
        btn.onclick = () => {
            widget.querySelectorAll('.w-tab-btn').forEach(b => {
                b.classList.remove('active');
                b.style.color = '#64748b';
            });
            btn.classList.add('active');
            btn.style.color = 'white';

            widget.querySelectorAll('.w-tab-content').forEach(c => c.style.display = 'none');
            widget.querySelector(`#tab-${btn.dataset.tab}`).style.display = 'flex';
        };
    });

    // Toggle Collapsed
    const toggleBtn = widget.querySelector('#widget-toggle');
    const body = widget.querySelector('#widget-body');
    let collapsed = false;
    toggleBtn.onclick = () => {
        collapsed = !collapsed;
        body.style.display = collapsed ? 'none' : 'flex';
        toggleBtn.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
        widget.style.width = collapsed ? '180px' : '280px';
    };

    // Action Button
    const actionBtn = widget.querySelector('#widget-action-btn');
    actionBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
            const isRunning = response && response.state && response.state.isRunning;
            if (isRunning) {
                chrome.runtime.sendMessage({ action: 'STOP_AUTO_POST' }, (res) => { if (res && res.success) refreshData(); });
            } else {
                const mins = widget.querySelector('#widget-interval-input').value || 10;
                chrome.runtime.sendMessage({ action: 'START_AUTO_POST', intervalMinutes: parseInt(mins) }, (res) => { if (res && res.success) refreshData(); });
            }
        });
    };

    // Save Interval
    widget.querySelector('#widget-save-interval').onclick = () => {
        const mins = widget.querySelector('#widget-interval-input').value;
        chrome.runtime.sendMessage({ action: 'UPDATE_INTERVAL', minutes: mins }, (res) => {
            if (res && res.success) {
                updateStatus('✅ อัปเดตความถี่เรียบร้อย!', false, 2000);
                refreshData();
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
    const logEl = widget.querySelector('#widget-log-container');
    const intervalInput = widget.querySelector('#widget-interval-input');
    const pingEl = widget.querySelector('#widget-ping');
    const nextRunEl = widget.querySelector('#widget-next-run');
    const intervalDisplay = widget.querySelector('#widget-interval-display');
    const lastPostEl = widget.querySelector('#widget-last-post');

    countEl.innerText = state.postCount || 0;
    if (state.intervalMinutes && intervalInput) intervalInput.value = state.intervalMinutes;

    // Update Ping
    if (pingEl) {
        const ping = state.lastPingMs || 0;
        pingEl.innerText = ping > 0 ? `${ping} ms` : '- ms';
        if (ping > 0 && ping < 300) { pingEl.style.color = '#10b981'; }
        else if (ping < 1000) { pingEl.style.color = '#fbbf24'; }
        else { pingEl.style.color = '#f43f5e'; }
    }

    // Update Interval Display
    if (intervalDisplay) {
        intervalDisplay.innerText = state.intervalMinutes ? `${state.intervalMinutes} min` : '- min';
    }

    // Update Last Post Time
    if (lastPostEl) {
        if (state.lastPostTime) {
            lastPostEl.innerText = new Date(state.lastPostTime).toLocaleTimeString('th-TH');
        } else {
            lastPostEl.innerText = '-';
        }
    }

    // Update Next Run
    if (nextRunEl) {
        if (state.isPosting) {
            nextRunEl.innerText = 'NOW!';
            nextRunEl.style.color = '#f43f5e';
            nextRunEl.removeAttribute('data-next-run');
        } else if (state.nextRunTime) {
            nextRunEl.setAttribute('data-next-run', state.nextRunTime);
            const diff = state.nextRunTime - Date.now();
            if (diff > 0) {
                const mins = Math.floor(diff / 60000);
                const secs = Math.floor((diff % 60000) / 1000);
                nextRunEl.innerText = `${mins}:${String(secs).padStart(2, '0')}`;
                nextRunEl.style.color = '#38bdf8';
            } else {
                nextRunEl.innerText = 'SOON';
                nextRunEl.style.color = '#fbbf24';
            }
        } else {
            nextRunEl.innerText = '-';
            nextRunEl.style.color = '#94a3b8';
            nextRunEl.removeAttribute('data-next-run');
        }
    }

    if (state.log && state.log.length > 0 && logEl) {
        logEl.innerHTML = state.log.map(line => `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.03);">${line}</div>`).join('');
    }

    if (state.isRunning) {
        statusEl.innerText = state.isPosting ? 'WORKING...' : 'ACTIVE';
        statusEl.style.background = state.isPosting ? '#e11d48' : '#10b981';
        statusEl.style.boxShadow = state.isPosting ? '0 0 10px rgba(225, 29, 72, 0.4)' : '0 0 10px rgba(16, 185, 129, 0.4)';
        actionBtn.innerText = 'STOP AUTO';
        actionBtn.style.background = '#f43f5e';
        actionBtn.style.boxShadow = '0 4px 12px rgba(244, 63, 94, 0.3)';
        widget.style.borderBottom = '5px solid #10b981';

        if (state.log && state.log.length > 0) {
            const lastLog = state.log.find(l => l.includes('|'));
            if (lastLog) {
                const parts = lastLog.split('|');
                if (parts.length > 1) groupEl.innerText = parts[1].trim();
            }
        }
    } else {
        statusEl.innerText = 'OFFLINE';
        statusEl.style.background = '#334155';
        statusEl.style.boxShadow = 'none';
        actionBtn.innerText = 'START AUTO';
        actionBtn.style.background = '#6366f1';
        actionBtn.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.3)';
        widget.style.borderBottom = '5px solid #475569';
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
