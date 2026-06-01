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

    // Helper to simulate a drop event for robust photo upload
    function simulateDrop(element, file) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);

        const dropEvent = new DragEvent('drop', {
            dataTransfer: dataTransfer,
            bubbles: true,
            cancelable: true
        });

        element.dispatchEvent(new DragEvent('dragenter', { bubbles: true }));
        element.dispatchEvent(new DragEvent('dragover', { bubbles: true }));
        element.dispatchEvent(dropEvent);
        console.log('[ChobShop] Drop event simulated on element');
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
            const now = Date.now();
            const lastTime = window.ChobShopLastPostTime || 0;
            if (window.ChobShopProcessing || (now - lastTime < 10000)) {
                console.warn('Already processing or in 10s cooldown, ignoring request.');
                sendResponse({ success: true, alreadyProcessing: true });
                return;
            }

            window.ChobShopProcessing = true;
            window.ChobShopLastPostTime = now;
            updateStatus('🚀 กำลังเตรียมการ...', true);

            let caption = request.data.caption;

            // --- String-level De-duplication Safety ---
            // If the string appears to be the same text repeated twice, we cut it in half.
            if (caption && caption.length > 50) {
                const halfway = Math.floor(caption.length / 2);
                const firstHalf = caption.substring(0, halfway).trim();
                const secondHalf = caption.substring(halfway).trim();
                if (firstHalf === secondHalf || (secondHalf.startsWith(firstHalf) && firstHalf.length > 10)) {
                    console.warn('[ChobShop] Duplicate string detected in payload! Auto-correcting...');
                    caption = firstHalf;
                }
            }

            fillFacebookPost(caption, request.data.imageUrl)
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
            return true;
        }
    });

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
    // --- Execution Lock ---
    if (window._chobShopPostLocked) {
        console.warn('[ChobShop] 🛑 Injection already in progress, skipping duplicate call.');
        return;
    }
    window._chobShopPostLocked = true;

    try {
        updateStatus('📝 กำลังกรอกข้อมูล...');

        const recognizedTexts = [
            "เขียนอะไรสักหน่อย", "คุณคิดอะไรอยู่", "What's on your mind", "เขียนอะไรบางอย่าง",
            "Create a public post", "Write something", "Write a post"
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

        // --- Wait for composer ---
        let textbox = null;
        let dialog = null;
        const textboxAriaLabels = [
            "สร้างโพสต์สาธารณะ", "สร้างโพสต์", "คุณคิดอะไรอยู่", "แชร์สิ่งที่คุณกำลังคิด",
            "What's on your mind", "Create a public post", "Write something",
            "Tell us about what you are sharing", "แชร์อะไรบางอย่าง", "เขียนอะไรบางอย่าง",
            "คุณกำลังขายอะไร", "What are you selling", "รายละเอียดสินค้า", "Product description",
            "ชื่อบทความ", "Article title", "หัวข้อ", "Title"
        ];

        const drawDebug = (el, color) => {
            if (!el) return;
            el.style.outline = `3px dashed ${color}`;
            el.style.outlineOffset = '-3px';
            setTimeout(() => { if (el) el.style.outline = ''; }, 5000);
        };

        for (let i = 0; i < 45; i++) {
            await new Promise(r => setTimeout(r, 400));
            dialog = document.querySelector('div[role="dialog"]')
                || document.querySelector('form[method="POST"]')
                || document.querySelector('div[aria-modal="true"]');

            const anchor = (dialog && dialog !== document.body) ? dialog : document.body;

            for (const label of textboxAriaLabels) {
                textbox = anchor.querySelector(`[role="textbox"][aria-label*="${label}"]`)
                    || anchor.querySelector(`[aria-placeholder*="${label}"]`)
                    || anchor.querySelector(`[placeholder*="${label}"]`);
                if (textbox) break;
            }

            if (textbox) {
                drawDebug(textbox, 'blue');
                textbox.focus();
                break;
            }
        }

        if (!textbox) throw new Error('ไม่พบช่องใส่ข้อความ');

        // --- Photo Upload Logic ---
        if (imageUrl) {
            updateStatus('🖼️ กำลังอัปโหลดรูปภาพ...');
            try {
                const searchRoot = dialog || document.body;
                const findFileInput = () => {
                    const inp = searchRoot.querySelector('input[type="file"][accept*="image"]') || searchRoot.querySelector('input[type="file"]');
                    if (inp) return inp;
                    return null;
                };

                let fileInput = findFileInput();
                const file = imageUrl.startsWith('data:') ? base64ToFile(imageUrl, 'product.jpg') : null;
                if (file) {
                    if (!fileInput || fileInput.offsetWidth === 0) {
                        for (let j = 0; j < 5; j++) {
                            fileInput = findFileInput();
                            if (fileInput && fileInput.offsetWidth > 0) break;
                            await new Promise(r => setTimeout(r, 800));
                        }
                    }

                    if (fileInput) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);
                        fileInput.files = dataTransfer.files;
                        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        simulateDrop(textbox, file);
                    }
                    await new Promise(r => setTimeout(r, 6000));
                }
            } catch (uploadErr) {
                console.error('[ChobShop] Photo upload failed:', uploadErr);
            }
        }

        // --- Text Injection (Hardened Level 5 - Absolute Final) ---
        await new Promise(r => setTimeout(r, 2000)); // Maximum settle time for SPA
        updateStatus('✍️ กำลังล้างและเตรียมเนื้อหา...', true);

        // LOCKOUT CHECK: Ensure no other process starts for 10s
        window.ChobShopLastPostTime = Date.now();

        // NUCLEAR FORCE CLEAR (Triple-Check + Verifier)
        try {
            for (let i = 0; i < 4; i++) {
                textbox.focus();
                document.execCommand('selectAll', false, null);
                document.execCommand('delete', false, null);
                await new Promise(r => setTimeout(r, 400));
                if (textbox.innerText.trim() === "" && !textbox.querySelector('span[data-lexical-text]')) break;
            }

            if (textbox.innerText.trim().length > 0) {
                console.warn('[ChobShop] Force-resetting innerHTML due to stubborn text');
                textbox.innerHTML = '<p dir="ltr"><span data-lexical-text="true"><br></span></p>';
                textbox.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 800));
            }
        } catch (e) { console.error('[ChobShop] Clear failed:', e); }

        updateStatus('✍️ กำลังพิมพ์ข้อความใหม่...', true);
        await new Promise(r => setTimeout(r, 800));

        // Use Clipboard + Paste for Atomic Stability (Lexical prefers this)
        let inserted = false;
        try {
            // This method is most resilient to React/Lexical race conditions
            const copyToClipboard = async (text) => {
                const el = document.createElement('textarea');
                el.value = text;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            };

            await copyToClipboard(caption);
            textbox.focus();
            document.execCommand('paste');
            inserted = true;
            console.log('[ChobShop] Injection completed via Paste');
        } catch (e) {
            console.error('[ChobShop] Paste failed, fallback to InputEvent:', e);
        }

        if (!inserted || textbox.innerText.trim() === "") {
            try {
                const inputEvent = new InputEvent('beforeinput', { data: caption, inputType: 'insertFromPaste', bubbles: true, cancelable: true });
                textbox.dispatchEvent(inputEvent);
                await new Promise(r => setTimeout(r, 150));
                const ev = new InputEvent('input', { data: caption, inputType: 'insertFromPaste', bubbles: true });
                textbox.dispatchEvent(ev);
                inserted = true;
            } catch (e) { }
        }

        // --- Link Preview Removal ---
        await new Promise(r => setTimeout(r, 1500));
        const removeLabels = ["เอาออก", "ลบออก", "Remove", "Close", "ลบพรีวิว"];
        Array.from(document.querySelectorAll('div[role="button"], span[role="button"]')).forEach(btn => {
            const label = (btn.getAttribute('aria-label') || "").toLowerCase();
            if (removeLabels.some(l => label.includes(l.toLowerCase())) && btn.offsetWidth < 50) btn.click();
        });

        // --- Auto Submit ---
        updateStatus('🔘 กำลังกดโพสต์...');
        for (let attempt = 0; attempt < 3; attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            const submitLabels = ["โพสต์", "post", "แชร์", "share", "ส่ง", "submit", "publish"];
            const btns = Array.from(document.querySelectorAll('div[role="button"], span[role="button"], button'));
            let bestBtn = null;
            let maxScore = -1;

            btns.forEach(b => {
                const rect = b.getBoundingClientRect();
                if (rect.width < 30 || rect.top < 0) return;
                const text = (b.innerText || "").trim().toLowerCase();
                const label = (b.getAttribute('aria-label') || "").toLowerCase();
                const title = (b.getAttribute('title') || "").toLowerCase();
                const style = window.getComputedStyle(b);
                const isBlue = style.backgroundColor.includes('rgb(8, 102, 255)') || style.backgroundColor.includes('rgb(0, 100, 209)');
                const hasSubmitText = submitLabels.some(l => text.includes(l) || label.includes(l) || title.includes(l));

                if (!hasSubmitText && !isBlue) return;

                // Visual + Accessibility Scoring (Hybrid)
                let score = hasSubmitText ? 100 : 0;

                // Extra weight for explicit semantic labels (Unlocks Dark Mode compatibility)
                if (label === 'โพสต์' || label === 'post' || label === 'แชร์') score += 1000;

                if (isBlue) score += 200;
                if (b.closest('[role="dialog"]')) score += 500;

                // Proximity to center-bottom of searching dialog/viewport
                const distToCenter = Math.abs(window.innerWidth / 2 - (rect.left + rect.width / 2));
                score += (1000 - distToCenter);

                if (score > maxScore) { maxScore = score; bestBtn = b; }
            });

            if (bestBtn) {
                bestBtn.click();
                console.log('[ChobShop] Clicked post button');
                break;
            }
        }

        return await findJustNowPostLink();
    } finally {
        window._chobShopPostLocked = false;
    }
}

function injectBotController() {
    if (document.getElementById('chobshop-bot-controller')) return;
    const widget = document.createElement('div');
    widget.id = 'chobshop-bot-controller';
    widget.style.cssText = `position: fixed; bottom: 20px; right: 20px; width: 280px; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; color: white; z-index: 99999; font-family: sans-serif; display: flex; flex-direction: column; overflow: hidden;`;
    widget.innerHTML = `<div style="padding: 12px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.1);">🤖 CHOB.SHOP Bot Console</div>
                <div id="widget-status-row" style="padding: 15px; display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;"><span>Status:</span> <span id="widget-status">OFFLINE</span></div>
                    <div style="display: flex; justify-content: space-between;"><span>Count:</span> <span id="widget-count">0</span></div>
                    <div id="widget-log-container" style="height: 100px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 5px; font-size: 10px; color: #10b981;"></div>
                    <button id="widget-action-btn" style="padding: 10px; background: #6366f1; border: none; border-radius: 8px; color: white; cursor: pointer;">START AUTO</button>
                </div>`;
    document.body.appendChild(widget);

    const refreshData = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (res) => { if (res && res.state) updateBotController(res.state); });
    };
    setInterval(refreshData, 2000);

    const actionBtn = widget.querySelector('#widget-action-btn');
    actionBtn.onclick = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (res) => {
            if (res && res.state && res.state.isRunning) {
                chrome.runtime.sendMessage({ action: 'STOP_AUTO_POST' }, () => refreshData());
            } else {
                chrome.runtime.sendMessage({ action: 'START_AUTO_POST', intervalMinutes: 10 }, () => refreshData());
            }
        });
    };
}

function updateBotController(state) {
    const s = document.getElementById('widget-status');
    const c = document.getElementById('widget-count');
    const b = document.getElementById('widget-action-btn');
    const l = document.getElementById('widget-log-container');
    if (s) { s.innerText = state.isRunning ? 'ACTIVE' : 'OFFLINE'; s.style.color = state.isRunning ? '#10b981' : '#94a3b8'; }
    if (c) c.innerText = state.postCount || 0;
    if (b) b.innerText = state.isRunning ? 'STOP AUTO' : 'START AUTO';
    if (l && state.log) l.innerHTML = state.log.join('<br>');
}

async function findJustNowPostLink() {
    const nowMarkers = ["Just now", "เมื่อสักครู่", "1m", "1 นาที", "1 min", "1 min.", "ตอนนี้"];
    for (let i = 0; i < 10; i++) {
        const links = Array.from(document.querySelectorAll('a')).filter(a => {
            const href = a.href || "";
            const text = (a.innerText || "").trim();
            const hasPostInUrl = href.includes('/posts/') || href.includes('permalink.php') || href.includes('/groups/') && href.includes('/multi_') || href.includes('/permalink/');
            const isJustNow = nowMarkers.some(m => text === m || text.startsWith(m));
            return hasPostInUrl && isJustNow;
        });
        if (links.length > 0) return links[0].href;
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
}
