// Global Guard: Ensure only one listener and one execution loop ever exists
if (!window.ChobShopInitialized) {
    window.ChobShopInitialized = true;
    console.log('ChobShop Extension initialized on Facebook');

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
                .then(() => {
                    updateStatus('✅ โพสต์สำเร็จ!', false, 3000);
                    sendResponse({ success: true });
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

    // 3. Clear & Insert via Clipboard Paste (most reliable for line breaks)
    textbox.focus();

    // Clear existing content
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await new Promise(r => setTimeout(r, 200));

    // Use clipboard paste to insert text — this preserves line breaks perfectly
    try {
        // Save current clipboard content
        const originalClipboard = await navigator.clipboard.readText().catch(() => '');

        // Write our caption to clipboard
        await navigator.clipboard.writeText(caption);

        // Focus and paste
        textbox.focus();
        document.execCommand('paste');

        // Restore original clipboard after a delay
        setTimeout(async () => {
            try { await navigator.clipboard.writeText(originalClipboard); } catch (e) { }
        }, 1000);
    } catch (clipErr) {
        console.warn('Clipboard paste failed, using DataTransfer fallback:', clipErr);
        // Fallback: Use DataTransfer paste event
        textbox.focus();
        const dt = new DataTransfer();
        dt.setData('text/plain', caption);
        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt
        });
        textbox.dispatchEvent(pasteEvent);
    }

    await new Promise(r => setTimeout(r, 300));
    textbox.dispatchEvent(new Event('input', { bubbles: true }));
    textbox.style.outline = '4px solid #10b981';

    // 4. Auto-Submit with Sanity Check
    updateStatus('🔘 กำลังกดโพสต์...');
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
    } else {
        console.warn('Post button not found');
    }
}
