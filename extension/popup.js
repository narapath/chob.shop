let products = [];
let groups = [];
let settings = {
    apiEndpoint: 'https://chob.shop', // Default
    captionTemplate: '✨ {{title}}\n\n💰 ราคาเพียง: {{price}} บาท\n\n📍 สนใจสั่งซื้อได้ที่: {{link}}\n\n{{tags}}'
};
let currentTabIsFBGroup = false;
let displayLimit = 10;
const ITEMS_PER_PAGE = 10;

async function copyToClipboard(id) {
    const p = products.find(prod => prod.id == id);
    if (!p) return;

    const tags = generateSmartTags(p);
    const link = p.affiliateUrl || `https://chob.shop/?productId=${p.id}`;

    let caption = settings.captionTemplate
        .replace('{{title}}', p.title)
        .replace('{{price}}', parseFloat(p.price).toLocaleString())
        .replace('{{link}}', link)
        .replace('{{desc}}', p.description || '')
        .replace('{{tags}}', tags);

    try {
        await navigator.clipboard.writeText(caption);
        showToast('✅ คัดลอกแคปชั่นแล้ว!');
    } catch (err) {
        console.error('Clipboard error:', err);
    }
}

function generateSmartTags(p) {
    const keywords = [];
    const title = p.title || '';

    // Split title to find product nouns (e.g. ไฟสปอตไลท์, LED)
    // We filter out very short words and common Thai prepositions if possible
    const words = title.split(/[\s,/-]+/).filter(w => w.length > 2);

    // Take the first 3 meaningful words as product-specific tags
    words.slice(0, 3).forEach(w => {
        const cleaned = w.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, '');
        if (cleaned && !/^[0-9]+$/.test(cleaned)) {
            keywords.push(`#${cleaned}`);
        }
    });

    return [...new Set(keywords)].join(' ');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    await checkCurrentTab();
    await loadSettings();
    await loadGroups();
    await fetchProducts();
    initEventListeners();
});

async function checkCurrentTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                currentTabIsFBGroup = tabs[0].url.includes('facebook.com/groups/');
            }
            resolve();
        });
    });
}

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

async function loadGroups() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['fbGroups'], (result) => {
            groups = result.fbGroups || [];
            renderGroups();
            resolve();
        });
    });
}

function saveGroups() {
    chrome.storage.sync.set({ fbGroups: groups }, () => {
        renderGroups();
    });
}

function initEventListeners() {
    document.getElementById('searchInput').addEventListener('input', () => {
        displayLimit = ITEMS_PER_PAGE;
        renderProducts();
    });

    document.querySelectorAll('.cat-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            displayLimit = ITEMS_PER_PAGE;
            renderProducts();
        });
    });

    // Load More
    document.getElementById('loadMoreBtn').addEventListener('click', () => {
        displayLimit += ITEMS_PER_PAGE;
        renderProducts();
    });

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            if (tab === 'products') {
                document.getElementById('productsView').classList.remove('hidden');
                document.getElementById('groupsView').classList.add('hidden');
            } else {
                document.getElementById('productsView').classList.add('hidden');
                document.getElementById('groupsView').classList.remove('hidden');
                // Auto-sync from server when entering groups tab
                syncGroupsFromServer();
            }
        });
    });

    // Group Management
    document.getElementById('addGroupBtn').addEventListener('click', () => {
        const name = prompt('ชื่อกลุ่ม:');
        if (!name) return;
        const url = prompt('URL กลุ่ม (เช่น https://facebook.com/groups/xxx):');
        if (!url) return;

        groups.push({ id: Date.now(), name, url });
        saveGroups();
    });

    document.getElementById('syncGroupsBtn').addEventListener('click', syncGroupsFromServer);

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
        const rawProducts = Array.isArray(data) ? data : (data.products || []);

        // Randomize products
        products = rawProducts.sort(() => Math.random() - 0.5);

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

function renderGroups() {
    const list = document.getElementById('groupList');
    if (groups.length === 0) {
        list.innerHTML = '<div class="empty-groups">ยังไม่มีกลุ่มที่บันทึกไว้</div>';
        return;
    }

    list.innerHTML = groups.map(g => `
        <div class="group-item">
            <a href="${g.url}" target="_blank" class="group-name">👥 ${g.name}</a>
            <div class="group-actions">
                <span class="btn-del" data-id="${g.id}">🗑️</span>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.btn-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = isNaN(parseInt(btn.dataset.id)) ? btn.dataset.id : parseInt(btn.dataset.id);
            groups = groups.filter(g => g.id !== id);
            saveGroups();
        });
    });
}

async function syncGroupsFromServer() {
    const btn = document.getElementById('syncGroupsBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '🔄 กำลังซิงค์...';
    btn.disabled = true;

    try {
        const response = await fetch(`${settings.apiEndpoint}/api/fb-groups`);
        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();

        if (data.success && Array.isArray(data.groups)) {
            // merge groups by ID
            const newGroups = data.groups.map(g => ({
                id: g.id,
                name: g.name,
                url: g.url
            }));

            // Replace existing groups or Merge? 
            // The prompt said "ดึงข้อมูลไปยัง extension" (pull data to extension).
            // Let's replace for now to stay in sync with server, or just add missing?
            // Replaced is usually safer for "sync".
            groups = newGroups;
            saveGroups();
            showToast(`✅ ซิงค์สำเร็จ ${groups.length} กลุ่ม!`);
        } else {
            showToast('❌ รูปแบบข้อมูลไม่ถูกต้อง');
        }
    } catch (err) {
        console.error('Sync error:', err);
        showToast('❌ ซิงค์ไม่สำเร็จ: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- Rendering ---
function renderProducts() {
    const list = document.getElementById('productList');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const activeCat = document.querySelector('.cat-chip.active').dataset.cat;
    const loadMoreContainer = document.getElementById('loadMoreContainer');

    const filtered = products.filter(p => {
        const matchesSearch = p.title.toLowerCase().includes(searchTerm);
        const matchesCat = activeCat === 'all' || p.category === activeCat;
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-msg">🚫 ไม่พบสินค้าที่ค้นหา</div>';
        loadMoreContainer.classList.add('hidden');
        return;
    }

    // Apply pagination
    const paginated = filtered.slice(0, displayLimit);

    list.innerHTML = paginated.map(p => `
        <div class="product-card">
            <img src="${p.image || 'https://via.placeholder.com/60'}" class="prod-img" alt="img">
            <div class="prod-info">
                <div class="prod-title">${p.title}</div>
                <div class="prod-meta">
                    <div class="prod-price">฿${parseFloat(p.price).toLocaleString()}</div>
                    <div class="prod-actions">
                        ${currentTabIsFBGroup ? `
                            <button class="btn-sm btn-group-post" data-id="${p.id}" title="โพสต์ลงกลุ่มนี้">
                                <span>📍</span> ลงกลุ่มนี้
                            </button>
                        ` : ''}
                        <button class="btn-sm btn-copy" data-id="${p.id}" title="คัดลอกแคปชั่น">
                            <span>📋</span> ก๊อปโพสต์
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Show/Hide Load More
    if (filtered.length > displayLimit) {
        loadMoreContainer.classList.remove('hidden');
    } else {
        loadMoreContainer.classList.add('hidden');
    }

    // Attach button events
    list.querySelectorAll('.btn-copy').forEach(btn => {
        btn.addEventListener('click', () => copyToClipboard(btn.dataset.id));
    });

    list.querySelectorAll('.btn-group-post').forEach(btn => {
        btn.addEventListener('click', () => postToCurrentGroup(btn.dataset.id));
    });

    list.querySelectorAll('.btn-img').forEach(btn => {
        btn.addEventListener('click', () => {
            window.open(btn.dataset.img, '_blank');
        });
    });
}

async function postToCurrentGroup(id) {
    console.log('postToCurrentGroup called with id:', id);
    const p = products.find(prod => prod.id == id);
    if (!p) {
        console.error('Product not found:', id);
        return;
    }

    const tags = generateSmartTags(p);
    const link = p.affiliateUrl || `https://chob.shop/?productId=${p.id}`;

    let caption = settings.captionTemplate
        .replace('{{title}}', p.title)
        .replace('{{price}}', parseFloat(p.price).toLocaleString())
        .replace('{{link}}', link)
        .replace('{{desc}}', p.description || '')
        .replace('{{tags}}', tags);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'FILL_POST',
                data: {
                    caption: caption,
                    imageUrl: p.image
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast('⚠️ โปรด Refresh หน้า Facebook ก่อนใช้งานครั้งแรก');
                } else if (response && response.success) {
                    showToast('✅ กรอกข้อมูลลงหน้าเว็บแล้ว!');
                }
            });
        }
    });
}

// --- Helpers ---
function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2500);
}
