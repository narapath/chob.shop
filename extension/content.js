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
    const recognizedTexts = ["เขียนอะไรสักหน่อย", "คุณคิดอะไรอยู่", "What's on your mind", "เขียนอะไรบางอย่าง", "Create a public post"];
    let opener = null;
    const possibleOpeners = document.querySelectorAll('.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6');
    for (const el of possibleOpeners) {
        if (el.innerText.includes('เขียนอะไร') && el.offsetWidth > 0) {
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

    // 3. Ultra-Stable Clear & Insert
    textbox.focus();

    // Force nuke 
    textbox.innerHTML = '';
    document.execCommand('insertHTML', false, '<p class="xdj266r x14z9mp xat24cr x1lziwak x16tdsg8"><br></p>');
    textbox.focus();
    await new Promise(r => setTimeout(r, 200));

    const lines = caption.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // CRITICAL: DO NOT dispatch beforeinput with data here. 
        // Lexical catches beforeinput and inserts the data, then execCommand inserts it again (DOUBLING).
        // We only dispatch the event for internal Lexical state if needed, but for text, let execCommand handle it.

        document.execCommand('insertText', false, line);

        if (i < lines.length - 1) {
            // Newline needs an event to tell Lexical to move down
            textbox.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertParagraph' }));
            document.execCommand('insertParagraph', false, null);
        }
    }

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
