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
        "คุณคิดอะไรอยู่",
        "What's on your mind",
        "เขียนอะไรบางอย่าง",
        "เขียนอะไรสักหน่อย",
        "Create a public post"
    ];

    let opener = null;
    // Search in all div/span elements for recognized text
    const elements = document.querySelectorAll('div[role="button"], span, div');
    for (const el of elements) {
        const text = (el.innerText || "").trim();
        // Check if element contains any of the recognized phrases
        if (recognizedTexts.some(t => text.includes(t)) && el.offsetWidth > 0) {
            // Find the closest clickable button-like element if this isn't it
            opener = el.closest('div[role="button"]') || el;
            break;
        }
    }

    if (!opener) {
        throw new Error('ไม่พบปุ่มเริ่มโพสต์ กรุณาตรวจสอบว่าหน้านี้เป็นกลุ่ม Facebook และล็อคอินแล้ว');
    }

    opener.click();

    // 2. Wait for the composer modal to appear (increase timeout for safety)
    await new Promise(r => setTimeout(r, 2500));

    // 3. Find the textbox - Facebook uses contenteditable divs
    let textbox = document.querySelector('div[role="textbox"][contenteditable="true"]');

    // If not found, try a broader search
    if (!textbox) {
        const textboxes = document.querySelectorAll('div[contenteditable="true"]');
        if (textboxes.length > 0) textbox = textboxes[0];
    }

    if (!textbox) {
        throw new Error('ไม่พบช่องใส่ข้อความในหน้าต่างโหลดโพสต์');
    }

    // 4. Fill text
    textbox.focus();
    // Use clear formatting and insert
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, caption);

    // Trigger input event to let FB know the text changed
    textbox.dispatchEvent(new Event('input', { bubbles: true }));

    console.log('Post filled successfully');

    // Optional: Visual cue
    textbox.style.outline = '4px solid #10b981';
    setTimeout(() => textbox.style.outline = '', 3000);
}
