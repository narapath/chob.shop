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
            return false;
        }

        if (request.action === 'GET_MEMBERSHIP_STATUS') {
            const status = checkMembership();
            sendResponse({ status });
            return false;
        }

        if (request.action === 'EXECUTE_JOIN_GROUP') {
            executeJoinGroup().then(res => sendResponse(res));
            return true;
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
                .then((result) => {
                    if (result === undefined) return;
                    if (result && result.status === 'PENDING') {
                        updateStatus('⏳ ส่งแล้ว (รออนุมัติ)', false, 4000);
                    } else {
                        updateStatus('✅ โพสต์สำเร็จ!', false, 3000);
                    }
                    sendResponse({ success: true, postLink: result });
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

    function checkMembership() {
        const text = document.body.innerText;
        const joinedMarkers = ["เข้าร่วมแล้ว", "Joined", "Member", "สมาชิกแล้ว"];
        const joinMarkers = ["เข้าร่วมกลุ่ม", "Join Group", "Join group"];
        const pendingMarkers = ["รอดำเนินการ", "Requested", "Pending Approval", "ส่งคำขอแล้ว"];

        // Strategy 1: Check buttons directly
        const buttons = Array.from(document.querySelectorAll('div[role="button"], span, a'));

        let hasJoin = false;
        let hasPending = false;
        let hasJoined = false;

        for (const btn of buttons) {
            const btnText = (btn.innerText || btn.getAttribute('aria-label') || "").trim();
            if (!btnText) continue;

            if (joinedMarkers.some(m => btnText === m)) hasJoined = true;
            if (joinMarkers.some(m => btnText === m)) hasJoin = true;
            if (pendingMarkers.some(m => btnText === m)) hasPending = true;
        }

        if (hasJoined) return 'JOINED';
        if (hasPending) return 'PENDING';
        if (hasJoin) return 'NOT_JOINED';

        // Fallback Strategy 2: Text matching if buttons aren't clear
        if (joinedMarkers.some(m => text.includes(m))) return 'JOINED';
        if (pendingMarkers.some(m => text.includes(m))) return 'PENDING';
        if (joinMarkers.some(m => text.includes(m))) return 'NOT_JOINED';

        return 'UNKNOWN';
    }

    async function executeJoinGroup() {
        const joinMarkers = ["เข้าร่วมกลุ่ม", "Join Group", "Join group"];
        const buttons = Array.from(document.querySelectorAll('div[role="button"], span, a'));

        for (const btn of buttons) {
            const btnText = (btn.innerText || btn.getAttribute('aria-label') || "").trim();
            if (joinMarkers.some(m => btnText === m)) {
                console.log('[ChobShop] Found Join button, clicking...');
                updateStatus('➕ กำลังกดเข้าร่วมกลุ่ม...');
                btn.click();
                await new Promise(r => setTimeout(r, 2000));
                return { success: true, status: checkMembership() };
            }
        }
        return { success: false, error: 'Join button not found' };
    }


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

    // Also append to the widget log if it exists
    const logContainer = document.getElementById('widget-log-container');
    if (logContainer) {
        const time = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const logEntry = document.createElement('div');
        logEntry.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        logEntry.style.padding = '2px 0';
        logEntry.innerHTML = `<span style="color: #64748b;">${time}</span> ${msg}`;
        logContainer.prepend(logEntry);
        // Keep only last 20 local logs
        if (logContainer.children.length > 20) logContainer.lastChild.remove();
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
        updateStatus('📝 กำลังเตรียมข้อมูลโพสต์...');

        // --- HELPERS (Define first to avoid hoisting issues) ---
        const isVisible = (el) => {
            if (!el) return false;
            const style = window.getComputedStyle(el);
            return el.offsetWidth > 0 && el.offsetHeight > 0 && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        };

        const getVisibleDialog = () => {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]'));
            return dialogs.find(isVisible);
        };

        const findExistingTextbox = () => {
            const selectors = [
                'div[role="dialog"] [role="textbox"]',
                'div[role="dialog"] [contenteditable="true"]',
                '[role="main"] [role="textbox"]:not([aria-label*="ความคิดเห็น"]):not([aria-label*="comment"])',
                '[role="main"] [contenteditable="true"]:not([aria-label*="ความคิดเห็น"]):not([aria-label*="comment"])'
            ];
            for (const sel of selectors) {
                const elements = document.querySelectorAll(sel);
                for (const tb of elements) {
                    if (isVisible(tb) && tb.offsetHeight > 40) {
                        if (tb.closest('[id*="comment"], [class*="comment"]')) continue;
                        return tb;
                    }
                }
            }
            return null;
        };

        // --- Click Strategies for Facebook's React Event System ---
        const clickStrategyA = async (el) => {
            // Strategy A: Clean mousedown → mouseup → click (Facebook React standard)
            const rect = el.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const evtParams = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };

            el.dispatchEvent(new MouseEvent('mousedown', evtParams));
            await new Promise(r => setTimeout(r, 80));
            el.dispatchEvent(new MouseEvent('mouseup', evtParams));
            await new Promise(r => setTimeout(r, 30));
            el.dispatchEvent(new MouseEvent('click', evtParams));
            console.log('[ChobShop] Strategy A: mousedown→mouseup→click dispatched');
        };

        const clickStrategyB = async (el) => {
            // Strategy B: Pointer + Mouse events (for newer Chrome/React)
            const btn = el.closest('div[role="button"][tabindex="0"]') || el;
            const rect = btn.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const evtParams = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };

            btn.dispatchEvent(new PointerEvent('pointerdown', evtParams));
            btn.dispatchEvent(new MouseEvent('mousedown', evtParams));
            await new Promise(r => setTimeout(r, 120));
            btn.dispatchEvent(new PointerEvent('pointerup', evtParams));
            btn.dispatchEvent(new MouseEvent('mouseup', evtParams));
            btn.dispatchEvent(new MouseEvent('click', evtParams));
            console.log('[ChobShop] Strategy B: Pointer+Mouse events dispatched');
        };

        const clickStrategyC = async (el) => {
            // Strategy C: Direct .click() + focus (simplest, works in some FB versions)
            const btn = el.closest('div[role="button"]') || el;
            btn.focus();
            await new Promise(r => setTimeout(r, 50));
            btn.click();
            console.log('[ChobShop] Strategy C: Direct .click()');
        };

        const visualHighlight = (el, color = '#6366f1') => {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { }
            el.style.transition = 'all 0.3s ease';
            el.style.boxShadow = `0 0 0 4px ${color}, 0 0 25px ${color}`;
            el.style.borderRadius = '8px';
            setTimeout(() => { try { el.style.boxShadow = ''; } catch (e) { } }, 2000);
        };

        const recognizedTexts = [
            "เขียนอะไรสักหน่อย", "คุณคิดอะไรอยู่", "What's on your mind", "เขียนอะไรบางอย่าง",
            "Create a public post", "Write something", "Write a post", "Something about this",
            "Create post", "สร้างโพสต์", "ลงมือเลย", "แชร์สิ่งที่คุณคิด",
            "เขียนอะไรสักหน่อย....", "เขียนอะไรหน่อย", "Post a status update"
        ];

        let opener = null;

        // Strategy 1: PRECISE — Find div[role="button"][tabindex="0"] containing recognized text
        const roleButtons = document.querySelectorAll('div[role="button"][tabindex="0"]');
        for (const btn of roleButtons) {
            const text = (btn.innerText || "").trim();
            if (recognizedTexts.some(t => text.includes(t)) && isVisible(btn)) {
                opener = btn;
                console.log('[ChobShop] Opener found via Strategy 1 (role=button+tabindex):', text.substring(0, 40));
                break;
            }
        }

        // Strategy 2: Find span with recognized text, walk up to div[role="button"]
        if (!opener) {
            const allSpans = document.querySelectorAll('span');
            for (const span of allSpans) {
                const text = (span.innerText || "").trim();
                if (recognizedTexts.some(t => text.includes(t)) && isVisible(span)) {
                    const parentBtn = span.closest('div[role="button"]');
                    if (parentBtn && isVisible(parentBtn)) {
                        opener = parentBtn;
                        console.log('[ChobShop] Opener found via Strategy 2 (span→parent button):', text.substring(0, 40));
                        break;
                    }
                }
            }
        }

        // Strategy 3: aria-label / placeholder search
        if (!opener) {
            for (const label of recognizedTexts) {
                const el = document.querySelector(`[aria-label*="${label}"], [placeholder*="${label}"], [aria-placeholder*="${label}"]`);
                if (el && el.offsetWidth > 0) {
                    opener = el.closest('div[role="button"]') || el.closest('[role="link"]') || el;
                    console.log('[ChobShop] Opener found via Strategy 3 (aria-label)');
                    break;
                }
            }
        }

        // Strategy 4: Facebook class patterns
        if (!opener) {
            const patternSelectors = [
                'span.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6',
                'div.x1i10hfl[role="button"][tabindex="0"]'
            ];
            for (const sel of patternSelectors) {
                const elements = Array.from(document.querySelectorAll(sel));
                const match = elements.find(el => {
                    const text = (el.innerText || "").trim();
                    return recognizedTexts.some(t => text.includes(t)) && isVisible(el);
                });
                if (match) {
                    opener = match.closest('div[role="button"]') || match;
                    console.log('[ChobShop] Opener found via Strategy 4 (class pattern)');
                    break;
                }
            }
        }

        const existingTextbox = findExistingTextbox();
        const dialogVisible = getVisibleDialog();

        if (existingTextbox && dialogVisible) {
            console.log('[ChobShop] 🔍 Active composer dialog already detected.');
            updateStatus('📝 พบช่องสร้างโพสต์แล้ว...');
            existingTextbox.focus();
        } else {
            if (!opener || !isVisible(opener)) throw new Error('ไม่พบปุ่มเริ่มโพสต์ (Opener) หรือปุ่มถูกซ่อนอยู่');

            visualHighlight(opener, '#6366f1');
            await new Promise(r => setTimeout(r, 500));

            // Multi-strategy click with retry — try each method until dialog opens
            let opened = false;
            const strategies = [
                { name: 'A (mousedown→mouseup→click)', fn: clickStrategyA },
                { name: 'B (Pointer+Mouse)', fn: clickStrategyB },
                { name: 'C (Direct click)', fn: clickStrategyC },
            ];

            for (const strategy of strategies) {
                if (opened) break;
                console.log(`[ChobShop] 🖱️ Trying click strategy ${strategy.name}...`);
                updateStatus(`🖱️ กำลังคลิก (${strategy.name})...`);
                await strategy.fn(opener);

                // Wait and check if dialog opened
                for (let j = 0; j < 6; j++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (getVisibleDialog()) {
                        opened = true;
                        console.log(`[ChobShop] ✅ Dialog opened with strategy ${strategy.name}`);
                        updateStatus('✅ หน้าต่างสร้างโพสต์เปิดแล้ว!');
                        break;
                    }
                }
            }

            if (!opened) throw new Error('คลิกปุ่มเริ่มโพสต์แล้ว แต่หน้าต่างสร้างโพสต์ไม่ยอมเปิดขึ้นมา (ลองกดเองดูสักครั้งครับ)');
        }

        // --- Wait for composer ---
        let textbox = null;
        let dialog = null;
        let anchor = null; // Declare anchor at outer scope for submit button search
        const textboxAriaLabels = [
            "สร้างโพสต์สาธารณะ", "สร้างโพสต์", "คุณคิดอะไรอยู่", "แชร์สิ่งที่คุณกำลังคิด",
            "What's on your mind", "Create a public post", "Write something",
            "Tell us about what you are sharing", "แชร์อะไรบางอย่าง", "เขียนอะไรบางอย่าง",
            "คุณกำลังขายอะไร", "What are you selling", "รายละเอียดสินค้า", "Product description",
            "ชื่อบทความ", "Article title", "หัวข้อ", "Title", "รายละเอียด", "Description",
            "เขียนบางอย่าง", "Say something", "เขียนอะไรหน่อย...", "เขียนอะไรหน่อย",
            "เขียนบางอย่างที่นี่", "Write something here..."
        ];

        // (Helper visualLockAndClick and drawDebug moved to top)

        for (let i = 0; i < 45; i++) {
            await new Promise(r => setTimeout(r, 400));
            dialog = getVisibleDialog();

            if (!dialog) continue; // STRIKT: Must have a visible dialog now

            anchor = dialog; // Update outer-scope anchor

            // Try precise labels first
            for (const label of textboxAriaLabels) {
                textbox = anchor.querySelector(`[role="textbox"][aria-label*="${label}"]`)
                    || anchor.querySelector(`[aria-placeholder*="${label}"]`)
                    || anchor.querySelector(`[placeholder*="${label}"]`)
                    || anchor.querySelector(`[aria-label*="${label}"]`)
                    || anchor.querySelector(`[aria-label="${label}"]`);

                if (textbox && isVisible(textbox)) break;
            }

            // Fallback: Any visible contenteditable in the dialog that isn't a small helper
            if (!textbox && anchor !== document.body) {
                const editables = Array.from(anchor.querySelectorAll('[role="textbox"], [contenteditable="true"], textarea'));
                textbox = editables.find(el => {
                    const rect = el.getBoundingClientRect();
                    return isVisible(el) && rect.width > 200 && rect.height > 60;
                });
            }

            if (textbox) {
                console.log('[ChobShop] ✅ Found textbox:', textbox.getAttribute('aria-placeholder') || textbox.getAttribute('aria-label') || textbox.tagName);
                textbox.focus();
                try { textbox.click(); } catch (e) { }
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
                        // Try to click the "Photo/Video" icon to trigger input
                        const photoLabels = ["รูปภาพ", "วิดีโอ", "Photo", "Video", "รูปภาพ/วิดีโอ"];
                        const icons = Array.from(searchRoot.querySelectorAll('div[role="button"], i, img'));
                        for (const icon of icons) {
                            const label = (icon.getAttribute('aria-label') || "").toLowerCase();
                            const text = (icon.innerText || "").toLowerCase();
                            if (photoLabels.some(l => label.includes(l.toLowerCase()) || text.includes(l.toLowerCase()))) {
                                console.log('[ChobShop] Clicking Photo/Video icon to trigger input');
                                icon.click();
                                break;
                            }
                        }

                        for (let j = 0; j < 8; j++) {
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
                updateStatus('⚠️ อัปโหลดรูปไม่สำเร็จ: ' + uploadErr.message, true);
            }
        }

        // --- Text Injection (Hardened Level 5 - Absolute Final) ---
        await new Promise(r => setTimeout(r, 2000));
        updateStatus('✍️ กำลังพิมพ์ข้อความ...', true);

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

        // Wait for Lexical to render before checking (prevents false-empty detection)
        await new Promise(r => setTimeout(r, 500));

        // Only use InputEvent fallback if paste was NOT attempted at all
        if (!inserted) {
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
            const searchAnchor = anchor || dialog || document.body;
            const btns = Array.from(searchAnchor.querySelectorAll('div[role="button"], span[role="button"], button'));
            let bestBtn = null;
            let maxScore = -1;

            btns.forEach(b => {
                const rect = b.getBoundingClientRect();
                if (rect.width < 30 || rect.top < 0) return;
                const text = (b.innerText || "").trim().toLowerCase();
                const label = (b.getAttribute('aria-label') || "").toLowerCase();
                const title = (b.getAttribute('title') || "").toLowerCase();
                const style = window.getComputedStyle(b);
                const isBlue = style.backgroundColor.includes('rgb(8, 102, 255)')
                    || style.backgroundColor.includes('rgb(0, 100, 209)')
                    || style.backgroundColor.includes('rgb(24, 119, 242)'); // New FB Blue
                const hasSubmitText = submitLabels.some(l => text.includes(l) || label.includes(l) || title.includes(l));

                if (!hasSubmitText && !isBlue) return;

                // Visual + Accessibility Scoring (Hybrid)
                let score = hasSubmitText ? 100 : 0;

                // Extra weight for explicit semantic labels (Unlocks Dark Mode compatibility)
                if (label === 'โพสต์' || label === 'post' || label === 'แชร์') score += 1000;

                if (isBlue) score += 500;
                if (b.closest('[role="dialog"]')) score += 1000;

                // Proximity to bottom-right of dialog/viewport
                const distToBottomRight = Math.abs(window.innerWidth - rect.right) + Math.abs(window.innerHeight - rect.bottom);
                score += (2000 - distToBottomRight);

                if (score > maxScore) { maxScore = score; bestBtn = b; }
            });

            if (bestBtn) {
                updateStatus('🎯 ล็อกเป้าหมายปุ่มโพสต์...');
                visualHighlight(bestBtn, '#10b981');

                // Multi-strategy click for Submit Button
                let submitted = false;
                const submitStrategies = [
                    { name: 'A', fn: clickStrategyA },
                    { name: 'B', fn: clickStrategyB },
                    { name: 'C', fn: clickStrategyC }
                ];

                for (const strategy of submitStrategies) {
                    if (submitted) break;
                    console.log(`[ChobShop] 🖱️ Attempting submit with strategy ${strategy.name}...`);
                    await strategy.fn(bestBtn);

                    // Wait for dialog to disappear (sign of success)
                    for (let j = 0; j < 5; j++) {
                        await new Promise(r => setTimeout(r, 600));
                        if (!dialog || !document.body.contains(dialog)) {
                            submitted = true;
                            console.log(`[ChobShop] ✅ Submit success with strategy ${strategy.name}`);
                            break;
                        }
                    }
                }

                if (submitted) break;
            } else {
                console.warn('[ChobShop] Post button not found in attempt', attempt);
            }
        }

        return await findJustNowPostLink(caption);
    } catch (err) {
        console.error('[ChobShop] fillFacebookPost failed:', err);
        updateStatus('❌ เกิดข้อผิดพลาด: ' + err.message);
        throw err; // RE-THROW so caller knows it failed!
    } finally {
        window._chobShopPostLocked = false;
    }
}

function injectBotController() {
    if (document.getElementById('chobshop-bot-controller')) return;

    // Inject responsive styles
    const styleId = 'chobshop-widget-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            #chobshop-bot-controller {
                position: fixed;
                bottom: 10px;
                right: 10px;
                width: 280px;
                min-width: 180px;
                max-width: calc(100vw - 20px);
                background: rgba(15, 23, 42, 0.98);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 14px;
                color: white;
                z-index: 999999;
                font-family: -apple-system, system-ui, sans-serif;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, width 0.3s;
            }
            #chobshop-bot-controller.minimized {
                width: auto;
                min-width: 150px;
                height: 44px;
            }
            .widget-header {
                padding: 10px 14px;
                font-weight: 800;
                font-size: 11px;
                letter-spacing: 0.05em;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                background: rgba(255,255,255,0.03);
            }
            .widget-content {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transition: all 0.3s;
            }
            #chobshop-bot-controller.minimized .widget-content {
                display: none;
            }
            .widget-toggle {
                width: 22px;
                height: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 5px;
                background: rgba(255,255,255,0.1);
                font-size: 14px;
                font-weight: bold;
            }
            .stat-box {
                display: flex;
                flex-direction: column;
                gap: 4px;
                background: rgba(255,255,255,0.05);
                padding: 8px;
                border-radius: 10px;
            }
            .stat-line {
                display: flex;
                justify-content: space-between;
                font-size: 11px;
                white-space: nowrap;
            }
            .widget-log {
                height: 80px;
                overflow-y: auto;
                background: rgba(0,0,0,0.4);
                border-radius: 8px;
                padding: 6px;
                font-size: 9px;
                color: #34d399;
                font-family: 'Cascadia Code', 'Consolas', monospace;
                border: 1px solid rgba(255,255,255,0.05);
            }
            #widget-action-btn {
                padding: 10px;
                background: linear-gradient(135deg, #6366f1, #4f46e5);
                border: none;
                border-radius: 10px;
                color: white;
                font-weight: 700;
                font-size: 12px;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
            }
            #widget-action-btn.active {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }
            
            @media (max-width: 320px) {
                #chobshop-bot-controller {
                    width: calc(100vw - 16px);
                    right: 8px;
                    bottom: 8px;
                }
                .widget-header { font-size: 10px; padding: 8px 10px; }
                .stat-line { font-size: 10px; }
            }
        `;
        document.head.appendChild(style);
    }

    const widget = document.createElement('div');
    widget.id = 'chobshop-bot-controller';
    widget.innerHTML = `
        <div class="widget-header" id="widget-header">
            <span>BOT CONSOLE</span>
            <div class="widget-toggle" id="widget-toggle">−</div>
        </div>
        <div class="widget-content">
            <div class="stat-box">
                <div class="stat-line">
                    <span style="color: #94a3b8;">STATUS:</span> 
                    <span id="widget-status" style="color: #94a3b8;">OFFLINE</span>
                </div>
                <div class="stat-line">
                    <span style="color: #94a3b8;">POSTS:</span> 
                    <span id="widget-count" style="font-weight: 800;">0</span>
                </div>
            </div>
            <div id="widget-log-container" class="widget-log"></div>
            <button id="widget-action-btn">START AUTO</button>
        </div>`;
    document.body.appendChild(widget);

    // Toggle functionality
    const toggleBtn = widget.querySelector('#widget-header');
    toggleBtn.onclick = () => {
        widget.classList.toggle('minimized');
        const icon = widget.querySelector('#widget-toggle');
        icon.textContent = widget.classList.contains('minimized') ? '+' : '−';
    };

    const refreshData = () => {
        chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (res) => {
            if (res && res.state) updateBotController(res.state);
        });
    };
    setInterval(refreshData, 2000);

    const actionBtn = widget.querySelector('#widget-action-btn');
    actionBtn.onclick = (e) => {
        e.stopPropagation(); // Don't trigger minimize
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
    if (s) {
        s.innerText = state.isRunning ? 'ACTIVE' : 'OFFLINE';
        s.style.color = state.isRunning ? '#10b981' : '#94a3b8';
    }
    if (c) c.innerText = state.postCount || 0;
    if (b) {
        b.innerText = state.isRunning ? 'STOP AUTO' : 'START AUTO';
        if (state.isRunning) b.classList.add('active');
        else b.classList.remove('active');
    }
    if (l && state.log) l.innerHTML = state.log.join('<br>');
}

async function findJustNowPostLink(targetText) {
    const nowMarkers = [
        "Just now", "जब अभी", "เมื่อสักครู่", "ตอนนี้", "1m", "1 นาที", "1 min", "1 min.", "0m", "0 นาที", "1น.", "1 น.",
        "Just Now", "JUST NOW", "a few seconds ago", "ไม่กี่วินาทีที่ผ่านมา", "เพิ่งลง", "เมื่อครู่นี้"
    ];
    const pendingMarkers = [
        "รอการอนุมัติ", "Submitted for review", "pending approval", "waiting for admin",
        "รอผู้ดูแลอนุมัติ", "ส่งแล้วและกำลังรอการตรวจสอบ", "รอการตรวจสอบ", "admin must approve",
        "post has been submitted", "approved before they're visible", "your post will be published after",
        "กำลังรอการอนุมัติ", "รออนุมัติ"
    ];

    // Clean and prepare title chunks for fuzzy matching
    // We take a longer snippet but sanitize it more carefully
    const cleanTitle = targetText ? targetText.substring(0, 60).replace(/[^\w\s\u0E00-\u0E7F]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase() : "";
    const titleChunks = cleanTitle.split(' ').filter(word => word.length > 2); // Keep shorter words for better matching

    console.log('[ChobShop] 🔍 Searching for verification. Chunks:', titleChunks);

    for (let i = 0; i < 25; i++) { // Increase to 25s for slower network environments
        await new Promise(r => setTimeout(r, 1000));

        // 1. Toast / Notification Detection (Fastest)
        // FB often shows a toast: "Your post was successful. View Post"
        const allLinks = Array.from(document.querySelectorAll('a'));
        for (const a of allLinks) {
            const text = (a.innerText || "").toLowerCase();
            const href = a.href || "";
            if ((text.includes('ดูโพสต์') || text.includes('view post') || text.includes('view your post')) &&
                (href.includes('/posts/') || href.includes('permalink') || href.includes('/groups/'))) {
                console.log('[ChobShop] 🎯 Found post link via SUCCESS TOAST/LINK:', href);
                return { status: 'PUBLISHED', url: href };
            }
        }

        // 2. Pending keywords in page body
        const pageText = document.body.innerText.toLowerCase();
        if (pendingMarkers.some(m => pageText.includes(m.toLowerCase()))) {
            console.log('[ChobShop] ⏳ Post verified as: PENDING_APPROVAL');
            return { status: 'PENDING', url: null };
        }

        // 3. Container-based Search
        // Expand selectors to include more generic FB container classes
        const postContainers = Array.from(document.querySelectorAll('[role="article"], .x1y1aw1k, [data-testid="post_container"], .x1n2onr6.x1ja2u2z'));

        for (const container of postContainers) {
            const cText = (container.innerText || "").toLowerCase();

            // Fuzzy Match: Check if at least 2 relevant words OR 50% of chunks exist in this container
            const matchCount = titleChunks.filter(word => cText.includes(word)).length;
            const threshold = Math.min(titleChunks.length, 2);

            // If we have very few title chunks, we need at least one good match
            const isMatch = titleChunks.length > 0 ? (matchCount >= threshold) : true;
            if (!isMatch) continue;

            // Search for "now" marker links in this specific container
            const links = Array.from(container.querySelectorAll('a'));
            for (const a of links) {
                const hr = a.href || "";
                const isPostLink = hr.includes('/posts/') || hr.includes('permalink.php') ||
                    (hr.includes('/groups/') && (hr.includes('/multi_') || hr.includes('/permalink/'))) ||
                    hr.includes('?id=');
                if (!isPostLink) continue;

                const label = (a.getAttribute('aria-label') || "").toLowerCase();
                const text = (a.innerText || "").toLowerCase();
                const title = (a.getAttribute('title') || "").toLowerCase();
                const combined = text + "|" + label + "|" + title;

                if (nowMarkers.some(m => combined.includes(m.toLowerCase()))) {
                    console.log('[ChobShop] ✅ Post verified: PUBLISHED (Container) -', hr);
                    // Standardize the URL (remove query params unless it's a legacy permalink)
                    let cleanUrl = hr;
                    try {
                        const urlObj = new URL(hr);
                        if (hr.includes('/posts/')) {
                            cleanUrl = urlObj.origin + urlObj.pathname;
                        }
                    } catch (e) { }
                    return { status: 'PUBLISHED', url: cleanUrl };
                }
            }
        }

        // Strategy B: Current URL if it's our post (Redirect case)
        const currentUrl = window.location.href;
        const reflectsPost = currentUrl.includes('/posts/') || currentUrl.includes('/permalink') || currentUrl.includes('/groups/');
        if (reflectsPost && titleChunks.length > 0 && titleChunks.every(w => pageText.includes(w))) {
            console.log('[ChobShop] ✅ Post verified: PUBLISHED (URL Match) -', currentUrl);
            return { status: 'PUBLISHED', url: currentUrl };
        }
    }

    // FINAL FALLBACK: If we've waited 25 seconds and we're sure something was posted, 
    // try to grab the very first "just now" link we find anywhere in the feed, 
    // assuming it's ours (since we just posted it).
    console.log('[ChobShop] ⚠️ Exact match failed, trying broad fallback...');
    const nowLinks = Array.from(document.querySelectorAll('a')).filter(a => {
        const hr = a.href || "";
        const label = (a.getAttribute('aria-label') || "").toLowerCase();
        const text = (a.innerText || "").toLowerCase();
        return (hr.includes('/posts/') || hr.includes('permalink')) && nowMarkers.some(m => (text + label).includes(m.toLowerCase()));
    });

    if (nowLinks.length > 0) {
        const fallbackUrl = nowLinks[0].href;
        console.log('[ChobShop] 🎯 Fallback success: Found latest post link -', fallbackUrl);
        return { status: 'PUBLISHED', url: fallbackUrl };
    }

    console.warn('[ChobShop] ❌ Verification timed out');
    return { status: 'FAILED', url: null };
}
