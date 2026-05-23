let products = [];
let settings = {
    apiEndpoint: 'https://chob.shop', // Default
    captionTemplate: '✨ {{title}}\n\n💰 ราคาเพียง: {{price}} บาท\n📍 สนใจสั่งซื้อได้ที่: {{link}}\n\n#ช้อปดีมีคืน #รีวิวสินค้า {{desc}}'
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await fetchProducts();
    initEventListeners();
});

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['apiEndpoint', 'captionTemplate'], (result) => {
            if (result.apiEndpoint) settings.apiEndpoint = result.apiEndpoint;
            if (result.captionTemplate) settings.captionTemplate = result.captionTemplate;

            // Populate settings UI
            document.getElementById('apiEndpoint').value = settings.apiEndpoint;
            document.getElementById('captionTemplate').value = settings.captionTemplate;
            resolve();
        });
    });
}

function initEventListeners() {
    document.getElementById('searchInput').addEventListener('input', renderProducts);

    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderProducts();
        });
    });

    // Settings Toggle
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsView').classList.remove('hidden');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsView').classList.add('hidden');
    });

    document.getElementById('saveSettings').addEventListener('click', () => {
        const api = document.getElementById('apiEndpoint').value.trim();
        const template = document.getElementById('captionTemplate').value;

        chrome.storage.sync.set({ apiEndpoint: api, captionTemplate: template }, () => {
            settings.apiEndpoint = api;
            settings.captionTemplate = template;
            document.getElementById('settingsView').classList.add('hidden');
            fetchProducts(); // Refetch with new endpoint
        });
    });
}

// --- Data Fetching ---
async function fetchProducts() {
    const list = document.getElementById('productList');
    // Keep skeleton while loading

    try {
        const response = await fetch(`${settings.apiEndpoint}/api/products`);
        const data = await response.json();
        products = Array.isArray(data) ? data : (data.products || []);
        renderProducts();
        document.querySelector('.status-dot').style.backgroundColor = '#10b981'; // Green
    } catch (err) {
        console.error('Fetch error:', err);
        list.innerHTML = `
            <div class="error-msg">
                <div class="error-icon">⚠️</div>
                <div class="error-title">เชื่อมต่อคลังสินค้าไม่ได้</div>
                <div class="error-detail">${err.message}</div>
                <button id="retryBtn" class="btn-secondary btn-sm" style="margin-top:10px">ลองใหม่</button>
                <p style="font-size:10px; color:var(--text-dim); margin-top:10px;">ตรวจสอบ URL ในหน้าตั้งค่า (ฟันเฟือง)</p>
            </div>`;
        document.querySelector('.status-dot').style.backgroundColor = '#ef4444'; // Red
        document.getElementById('retryBtn')?.addEventListener('click', fetchProducts);
    }
}

// --- Rendering ---
function renderProducts() {
    const list = document.getElementById('productList');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const activeCat = document.querySelector('.cat-chip.active').dataset.cat;

    const filtered = products.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchTerm);
        const matchesCat = activeCat === 'all' || p.category === activeCat;
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-msg">🚫 ไม่พบสินค้าที่ค้นหา</div>';
        return;
    }

    list.innerHTML = filtered.map(p => `
        <div class="product-card">
            <img src="${p.image || 'https://via.placeholder.com/60'}" class="prod-img" alt="img">
            <div class="prod-info">
                <div class="prod-title">${p.title}</div>
                <div class="prod-meta">
                    <div class="prod-price">฿${parseFloat(p.price).toLocaleString()}</div>
                    <div class="prod-actions">
                        <button class="btn-sm btn-copy" data-id="${p.id}" title="คัดลอกแคปชั่น">
                            <span>📋</span> ก๊อปโพสต์
                        </button>
                        <button class="btn-sm btn-img" data-img="${p.image}" title="เปิดรูปภาพ">
                            <span>🖼️</span> ดูรูป
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Attach button events
    list.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => copyToClipboard(btn.dataset.id));
    });

    list.querySelectorAll('.btn-img').forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(btn.dataset.img, '_blank');
        });
    });
}

// --- Helpers ---
async function copyToClipboard(id) {
    const p = products.find(prod => prod.id == id);
    if (!p) return;

    let caption = settings.captionTemplate
        .replace('{{title}}', p.title)
        .replace('{{price}}', parseFloat(p.price).toLocaleString())
        .replace('{{link}}', p.affiliateUrl)
        .replace('{{desc}}', p.description || '');

    try {
        await navigator.clipboard.writeText(caption);
        showToast('✅ คัดลอกแคปชั่นแล้ว!');
    } catch (err) {
        console.error('Clipboard error:', err);
    }
}

function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}
