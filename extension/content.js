console.log('ChobShop Extension loaded on Facebook');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FILL_POST') {
        fillFacebookPost(request.data.caption, request.data.imageUrl)
            .then(() => sendResponse({ success: true }))
            .catch(err => {
                console.error('Fill post error:', err);
                sendResponse({ success: false, error: err.message });
            });
        return true; // Keep channel open for async response
    }
});

async function fillFacebookPost(caption, imageUrl) {
    // 1. Find the "What's on your mind?" button
    const recognizedTexts = [
        "เขียนอะไรสักหน่อย", // User specified
        "คุณคิดอะไรอยู่",
        "What's on your mind",
        "เขียนอะไรบางอย่าง",
        "Create a public post"
    ];

    let opener = null;

    // Priority 1: User provided classes for the opener
    const userOpenerClasses = '.x1lliihq.x6ikm8r.x10wlt62.x1n2onr6';
    const possibleOpeners = document.querySelectorAll(userOpenerClasses);
    for (const el of possibleOpeners) {
        if (el.innerText.includes('เขียนอะไร') && el.offsetWidth > 0) {
            opener = el.closest('div[role="button"]') || el;
            break;
        }
    }

    // Priority 2: Generic text search
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

    if (!opener) {
        throw new Error('ไม่พบปุ่มเริ่มโพสต์ กรุณาตรวจสอบว่าหน้านี้เป็นกลุ่ม Facebook และล็อคอินแล้ว');
    }

    opener.click();

    // 2. Wait for the composer modal to appear (more robustly)
    let textbox = null;

    // Retry finding the dialog for up to 6 seconds
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 400));
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) {
            // Priority 1: Specific class mentioned by user for the paragraph inside textbox
            const p = dialog.querySelector('p.xdj266r.x14z9mp.xat24cr.x1lziwak.x16tdsg8');
            if (p) {
                textbox = p.closest('div[contenteditable="true"]');
            }

            // Priority 2: Standard textbox roles inside dialog
            if (!textbox) {
                textbox = dialog.querySelector('div[role="textbox"][contenteditable="true"]') ||
                    dialog.querySelector('div[contenteditable="true"]');
            }

            if (textbox) break;
        }
    }

    if (!textbox) {
        // Fallback: look anywhere if dialog search failed, but prioritize role="dialog"
        textbox = document.querySelector('div[role="dialog"] div[contenteditable="true"]') ||
            document.querySelector('div[role="textbox"][contenteditable="true"]');
    }

    if (!textbox) {
        throw new Error('ไม่พบช่องใส่ข้อความในหน้าต่างโหลดโพสต์');
    }

    // 4. Fill text
    textbox.focus();

    // Ensure the cursor is inside (some FB versions need this)
    try {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textbox);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    } catch (e) { console.error('Selection error:', e); }

    // Clear and Insert
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);

    // Split into lines and insert with paragraph breaks
    const lines = caption.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() !== '' || i < lines.length - 1) {
            document.execCommand('insertText', false, lines[i]);
        }
        if (i < lines.length - 1) {
            document.execCommand('insertParagraph', false, null);
        }
    }

    // Trigger input event
    textbox.dispatchEvent(new Event('input', { bubbles: true }));

    console.log('Post filled successfully');

    // Visual cue
    textbox.style.outline = '4px solid #10b981';
    setTimeout(() => textbox.style.outline = '', 3000);
}
