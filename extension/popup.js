let products = [];
let groups = [];
const settings = {
    botName: '',
    apiEndpoint: 'https://chob.shop', // Default
    captionTemplate: '{{title}}\n{{desc}}\n\n{{link}}'
};
let currentTabIsFBGroup = false;
let displayLimit = 10;
const ITEMS_PER_PAGE = 10;
const scrapedImages = new Map(); // Store high-res Base64 images here
let isFetchingProducts = false;
let productsPage = 1;

function getFormattedCaption(p) {
    const link = (p.affiliateUrl && p.affiliateUrl.length > 5)
        ? p.affiliateUrl
        : `https://chob.shop/?productId=${p.id}`;

    const displayTitle = toUnicodeBold(p.title || 'สินค้าคุณภาพดี');
    const displayDesc = p.description || '';

    // 1. Core Replacement
    let caption = settings.captionTemplate
        .replace(/{{title}}/g, displayTitle)
        .replace(/{{price}}/g, parseFloat(p.price || 0).toLocaleString())
        .replace(/{{link}}/g, link + '\n')
        .replace(/{{desc}}/g, displayDesc)
        .replace(/{{tags}}/g, '');

    // 2. High-Resilience De-duplication (Pattern Matching)
    // We check if any significant block of text (20+ chars) is repeated.
    const sanitizeResult = (str) => {
        const lines = str.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const seen = new Set();
        const uniqueLines = [];
        for (const line of lines) {
            if (!seen.has(line)) {
                uniqueLines.push(line);
                seen.add(line);
            }
        }
        return uniqueLines.join('\n');
    };

    caption = sanitizeResult(caption);

    // Final check for 50/50 binary doubling (FB Lexical specific)
    if (caption.length > 40) {
        const halfway = Math.floor(caption.length / 2);
        const p1 = caption.substring(0, halfway).trim();
        const p2 = caption.substring(halfway).trim();
        if (p1 === p2 || p2.startsWith(p1)) caption = p1;
    }

    return caption.trim();
}

async function copyToClipboard(id) {
    const p = products.find(prod => prod.id == id);
    if (!p) return;

    const caption = getFormattedCaption(p);

    try {
        await navigator.clipboard.writeText(caption);
        showToast('✅ คัดลอกแคปชั่นแล้ว!');
    } catch (err) {
        console.error('Clipboard error:', err);
    }
}

// --- Initialization ---
let autoPollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await checkCurrentTab();
        await loadSettings();
        await loadGroups();
        await fetchProducts();
        initEventListeners();
        initAutoTab();

        // Ensure 'auto' tab is active and visible on startup
        const autoTabBtn = document.querySelector('.tab-btn[data-tab="auto"]');
        if (autoTabBtn) autoTabBtn.click();

    } catch (err) {
        console.error('[ChobShop] Initialization failed:', err);
    }
});

async function checkCurrentTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url) {
                currentTabIsFBGroup = tabs[0].url.includes('facebook.com/groups/');
            }
            resolve();
        });
    });
}

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['apiEndpoint', 'botName'], (localRes) => {
            chrome.storage.sync.get(['apiEndpoint', 'botName', 'captionTemplate'], (syncRes) => {
                // Migration: If local is missing but sync has it, use sync and save to local
                if (!localRes.apiEndpoint && syncRes.apiEndpoint) {
                    settings.apiEndpoint = syncRes.apiEndpoint;
                    chrome.storage.local.set({ apiEndpoint: syncRes.apiEndpoint });
                } else if (localRes.apiEndpoint) {
                    settings.apiEndpoint = localRes.apiEndpoint;
                }

                if (!localRes.botName && syncRes.botName) {
                    settings.botName = syncRes.botName;
                    chrome.storage.local.set({ botName: syncRes.botName });
                } else if (localRes.botName) {
                    settings.botName = localRes.botName;
                }

                if (syncRes.captionTemplate) settings.captionTemplate = syncRes.captionTemplate;

                // Populate UI
                document.getElementById('apiEndpoint').value = settings.apiEndpoint;
                document.getElementById('captionTemplate').value = settings.captionTemplate;
                document.getElementById('botName').value = settings.botName || '';
                resolve();
            });
        });
    });
}

async function loadGroups() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['fbGroups'], (result) => {
            if (result.fbGroups && result.fbGroups.length > 0) {
                groups = result.fbGroups;
                renderGroups();
                resolve();
            } else {
                // Migration: Check sync storage if local is empty
                chrome.storage.sync.get(['fbGroups'], (syncResult) => {
                    if (syncResult.fbGroups && syncResult.fbGroups.length > 0) {
                        groups = syncResult.fbGroups;
                        chrome.storage.local.set({ fbGroups: groups });
                        renderGroups();
                    } else {
                        groups = [];
                    }
                    resolve();
                });
            }
        });
    });
}

function saveGroups() {
    chrome.storage.local.set({ fbGroups: groups }, () => {
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
        const currentCount = document.querySelectorAll('.product-card').length;
        if (currentCount >= products.length && products.length % 100 === 0) {
            // Probably more products on server
            fetchProducts(true);
        } else {
            displayLimit += ITEMS_PER_PAGE;
            renderProducts();
        }
    });

    // Tab Switching (3 tabs: products / groups / auto)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            const views = ['productsView', 'groupsView', 'autoView', 'scraperView', 'historyView'];
            views.forEach(v => document.getElementById(v).classList.add('hidden'));

            // Show/hide search bar and filters (only for products tab)
            const searchContainer = document.querySelector('.search-container');
            if (searchContainer) {
                searchContainer.style.display = tab === 'products' ? '' : 'none';
            }

            if (tab === 'products') {
                document.getElementById('productsView').classList.remove('hidden');
                stopAutoPolling();
            } else if (tab === 'groups') {
                document.getElementById('groupsView').classList.remove('hidden');
                syncGroupsFromServer();
                stopAutoPolling();
            } else if (tab === 'auto') {
                document.getElementById('autoView').classList.remove('hidden');
                refreshAutoStatus();
                startAutoPolling();
            } else if (tab === 'scraper') {
                document.getElementById('scraperView').classList.remove('hidden');
                stopAutoPolling();
            } else if (tab === 'history') {
                document.getElementById('historyView').classList.remove('hidden');
                renderHistory();
                stopAutoPolling();
            }
        });
    });

    // History Listeners
    document.getElementById('historySearchInput')?.addEventListener('input', () => renderHistory());
    document.getElementById('clearHistoryBtn')?.addEventListener('click', async () => {
        if (confirm('คุณแน่ใจหรือไม่ว่าต้องการล้างประวัติการโพสต์ทั้งหมด?')) {
            await chrome.storage.local.set({ postHistory: [] });
            renderHistory();
            showToast('🗑️ ล้างประวัติแล้ว');
        }
    });

    // Scraper Initialization
    initScraper();

    // Auto Toggle Button
    document.getElementById('autoToggleBtn').addEventListener('click', toggleAutoPost);
    document.getElementById('resetAutoBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        resetAutoPost();
    });

    document.getElementById('autoInterval').addEventListener('change', updateAutoInterval);

    // Group Management
    document.getElementById('recheckGroupsBtn')?.addEventListener('click', recheckAllGroups);
    document.getElementById('syncGroupsBtn')?.addEventListener('click', syncGroupsFromServer);
    document.getElementById('addGroupBtn')?.addEventListener('click', () => {
        const name = prompt('ชื่อกลุ่ม:');
        if (!name) return;
        const url = prompt('URL กลุ่ม (เช่น https://facebook.com/groups/xxx):');
        if (!url) return;

        groups.push({ id: Date.now(), name, url, membershipStatus: 'NOT_JOINED' });
        saveGroups();
    });

    // Settings Toggle
    document.getElementById('settingsBtn').addEventListener('click', () => {
        document.getElementById('settingsView').classList.remove('hidden');
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
        document.getElementById('settingsView').classList.add('hidden');
    });

    // Auto-Connect API Button
    document.getElementById('btnAutoConnect').addEventListener('click', () => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab && activeTab.url && activeTab.url.startsWith('http')) {
                try {
                    const url = new URL(activeTab.url);
                    const discovered = `${url.protocol}//${url.host}`;
                    document.getElementById('apiEndpoint').value = discovered;
                    console.log('[ChobShop] API discovered:', discovered);
                } catch (e) {
                    console.error('Invalid URL for auto-connect');
                }
            } else {
                // Fallback to default if no active tab URL
                document.getElementById('apiEndpoint').value = 'https://chob.shop';
            }
        });
    });

    // Test API Button
    document.getElementById('testApi').addEventListener('click', async () => {
        const api = document.getElementById('apiEndpoint').value.trim();
        const bName = document.getElementById('botName').value.trim() || 'Test Bot';

        if (!api) {
            alert('กรุณาใส่ API Endpoint');
            return;
        }

        const btn = document.getElementById('testApi');
        const originalText = btn.innerText;
        btn.innerText = '⌛...';
        btn.disabled = true;

        try {
            console.log('[ChobShop] Testing connection to:', api);
            const res = await fetch(`${api}/api/bots/heartbeat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bot_name: bName,
                    status: 'test',
                    version: '1.0'
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    alert('✅ เชื่อมต่อสำเร็จ! ข้อมูลถูกส่งไปยังระบบแล้ว');
                } else {
                    alert('❌ เซิร์ฟเวอร์ตอบกลับแต่มีข้อผิดพลาด: ' + data.error);
                }
            } else {
                const text = await res.text();
                alert(`❌ เชื่อมต่อล้มเหลว (HTTP ${res.status}): ${text.substring(0, 50)}...`);
            }
        } catch (e) {
            console.error('[ChobShop] Test API Exception:', e);
            alert('❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้: ' + e.message +
                '\n\n💡 คำแนะนำ: ตรวจสอบว่าใส่ API Endpoint ในเมนูตั้งค่าได้ถูกต้อง (เช่น http://localhost:3000) และเซิร์ฟเวอร์เปิดใช้งานอยู่');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById('saveSettings').addEventListener('click', () => {
        const api = document.getElementById('apiEndpoint').value.trim();
        const template = document.getElementById('captionTemplate').value;
        const botName = document.getElementById('botName').value.trim();

        // Normalize API Endpoint: trim and remove trailing slashes
        let normalizedApi = api.replace(/\/+$/, '');

        // Ensure protocol exists
        if (normalizedApi && !normalizedApi.startsWith('http')) {
            normalizedApi = 'https://' + normalizedApi;
        }

        chrome.storage.local.set({ apiEndpoint: normalizedApi, botName: botName }, () => {
            chrome.storage.sync.set({ captionTemplate: template }, () => {
                settings.apiEndpoint = normalizedApi;
                settings.captionTemplate = template;
                settings.botName = botName;
                document.getElementById('apiEndpoint').value = normalizedApi; // Update UI
                document.getElementById('settingsView').classList.add('hidden');
                fetchProducts();

                chrome.runtime.sendMessage({ action: 'SEND_HEARTBEAT' });
            });
        });
    });
}

// --- Data Fetching ---
async function fetchProducts(isLoadMore = false) {
    if (isFetchingProducts) return;

    const list = document.getElementById('productList');
    if (isLoadMore) productsPage++;
    else productsPage = 1;

    // 1. Try to load from cache immediately (only on first load)
    if (!isLoadMore) {
        try {
            const cached = await chrome.storage.local.get('products');
            if (cached.products && cached.products.length > 0) {
                products = cached.products;
                renderProducts();
                document.querySelector('.status-dot').style.backgroundColor = '#10b981';
            }
        } catch (e) {
            console.warn('Cache load failed:', e);
        }
    }

    // 2. Try to update from server with timeout
    isFetchingProducts = true;
    const dot = document.querySelector('.status-dot');
    if (dot) dot.classList.add('syncing');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
        const response = await fetch(`${settings.apiEndpoint}/api/products?page=${productsPage}&limit=100&lite=true`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const rawProducts = Array.isArray(data) ? data : (data.products || []);

        if (rawProducts.length > 0) {
            if (isLoadMore) {
                // Append unique products
                const existingIds = new Set(products.map(p => p.id));
                const newItems = rawProducts.filter(p => !existingIds.has(p.id));
                products = [...products, ...newItems];
            } else {
                products = rawProducts;
            }

            // PERSIST
            await chrome.storage.local.set({ products: products });

            if (isLoadMore) {
                displayLimit += ITEMS_PER_PAGE * 2; // Show more after fetch
            }
            renderProducts();
            document.querySelector('.status-dot').style.backgroundColor = '#10b981';
        } else if (isLoadMore) {
            console.log('📦 No more products to load');
        }
    } catch (err) {
        console.error('Fetch error:', err);
        const isTimeout = err.name === 'AbortError';
        const errorMsg = isTimeout ? 'การเชื่อมต่อหมดเวลา (ช้าเกินไป)' : err.message;

        if (products.length === 0) {
            list.innerHTML = `
                <div class="error-msg">
                    <div class="error-icon">⚠️</div>
                    <div class="error-title">เชื่อมต่อคลังสินค้าไม่ได้</div>
                    <div class="error-detail">${errorMsg}</div>
                    <button id="retryBtn" class="btn-secondary btn-sm" style="margin-top:10px">ลองใหม่</button>
                </div>
            `;
            document.querySelector('.status-dot').style.backgroundColor = '#ef4444';
            document.getElementById('retryBtn')?.addEventListener('click', () => fetchProducts(false));
        } else {
            console.warn('Silent sync error:', errorMsg);
        }
    } finally {
        isFetchingProducts = false;
        const dot = document.querySelector('.status-dot');
        if (dot) dot.classList.remove('syncing');
        clearTimeout(timeoutId);
    }
}

function renderGroups() {
    const list = document.getElementById('groupList');
    if (groups.length === 0) {
        list.innerHTML = '<div class="empty-groups">ยังไม่มีกลุ่มที่บันทึกไว้</div>';
        return;
    }

    // Inject membership styles if not exists
    if (!document.getElementById('membership-styles')) {
        const style = document.createElement('style');
        style.id = 'membership-styles';
        style.textContent = `
            .group-status {
                font-size: 9px;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 700;
                margin-left: 8px;
                text-transform: uppercase;
            }
            .status-JOINED { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 0.5px solid #10b981; }
            .status-NOT_JOINED { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 0.5px solid #ef4444; }
            .status-PENDING { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border: 0.5px solid #f59e0b; }
            .status-UNKNOWN { background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 0.5px solid #94a3b8; }
            .btn-recheck {
                font-size: 10px;
                background: var(--glass);
                border: 1px solid var(--border);
                color: var(--text-dim);
                padding: 4px 8px;
                border-radius: 6px;
                cursor: pointer;
                transition: 0.2s;
            }
            .btn-recheck:hover { background: var(--accent); color: white; border-color: var(--accent); }
        `;
        document.head.appendChild(style);
    }

    list.innerHTML = groups.map(g => {
        const membershipStatus = g.membershipStatus || 'NOT_JOINED';
        const statusLabel = {
            'JOINED': '✅ เข้าแล้ว',
            'NOT_JOINED': '❌ ยังไม่เข้า',
            'PENDING': '⏳ รออนุมัติ'
        }[membershipStatus] || '❌ ยังไม่เข้า';

        return `
            <div class="group-item" style="flex-wrap: wrap;">
                <div style="display: flex; align-items: center; flex: 1; min-width: 200px;">
                    <span class="group-link" data-url="${g.url}" title="ไปยังกลุ่ม">👥 ${g.name}</span>
                    <span class="group-status status-${g.membershipStatus || 'UNKNOWN'}">${statusLabel}</span>
                </div>
                <div class="group-actions">
                    <span class="btn-del" data-id="${g.id}">🗑️</span>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.group-link').forEach(link => {
        link.addEventListener('click', () => {
            const url = link.dataset.url;
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: url }, async () => {
                        await new Promise(r => setTimeout(r, 1500)); // Wait for nav
                        checkMembershipInTab(tabs[0].id, url);
                    });
                }
            });
        });
    });

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
            const newGroups = data.groups.map(g => ({
                id: g.id,
                name: g.name,
                url: g.url,
                membershipStatus: 'NOT_JOINED'
            }));

            groups = newGroups;
            saveGroups();
            showToast(`✅ ซิงค์สำเร็จ ${groups.length} กลุ่ม!`);
        } else {
            showToast('❌ รูปแบบข้อมูลไม่ถูกต้อง');
        }
    } catch (err) {
        console.error('Sync error:', err);
        const isNetworkError = err.message.toLowerCase().includes('network') || err.message.toLowerCase().includes('failed to fetch');
        const errorMsg = isNetworkError
            ? 'เครือข่ายขัดข้อง (Network Error) | โปรดตรวจสอบความถูกต้องของ API Endpoint ในเมนูตั้งค่า'
            : err.message;
        showToast('❌ ซิงค์ไม่สำเร็จ: ' + errorMsg);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}


async function recheckAllGroups() {
    if (groups.length === 0) {
        showToast('⚠️ กรุณาซิงค์กลุ่มก่อน');
        return;
    }

    const btn = document.getElementById('recheckGroupsBtn');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '🔄 กำลังเช็ค...';
    btn.disabled = true;

    showToast('🚀 เริ่มตรวจสอบการเข้าร่วมกลุ่ม...');

    try {
        // Wrap query in Promise to await it properly
        const tab = await new Promise(resolve => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => resolve(tabs[0]));
        });

        if (!tab) {
            showToast('❌ ไม่พบแท็บที่เปิดอยู่');
            return;
        }

        for (let i = 0; i < groups.length; i++) {
            const g = groups[i];
            btn.innerHTML = `🔄 (${i + 1}/${groups.length})`;

            try {
                await new Promise((resolve) => {
                    chrome.tabs.update(tab.id, { url: g.url }, () => {
                        // Wait for page to start loading and then wait a bit
                        setTimeout(async () => {
                            // Secondary check to ensure content script is ready
                            let attempts = 0;
                            const checkStatus = () => {
                                chrome.tabs.sendMessage(tab.id, { action: 'GET_MEMBERSHIP_STATUS' }, async (res) => {
                                    if (chrome.runtime.lastError) {
                                        if (attempts < 5) {
                                            attempts++;
                                            setTimeout(checkStatus, 1000);
                                        } else {
                                            console.warn(`[Recheck] Timeout waiting for content script on ${g.name}`);
                                            resolve();
                                        }
                                    } else {
                                        await processStatusResponse(g, res);
                                        resolve();
                                    }
                                });
                            };
                            checkStatus();
                        }, 3000);
                    });
                });
            } catch (e) {
                console.error('Recheck error for group:', g.name, e);
            }

            // Save progress
            saveGroups();
            renderGroups();

            // Small delay between groups
            await new Promise(r => setTimeout(r, 800));
        }

        showToast('✅ ตรวจสอบกลุ่มเสร็จสิ้น!');
    } catch (globalErr) {
        console.error('Global Recheck Error:', globalErr);
        showToast('❌ เกิดข้อผิดพลาดในการตรวจสอบ');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function processStatusResponse(group, response) {
    if (response && response.status) {
        group.membershipStatus = response.status;

        // AUTO JOIN LOGIC
        if (response.status === 'NOT_JOINED') {
            console.log(`[ChobShop] Auto-joining group: ${group.name}`);
            return new Promise((resolve) => {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.sendMessage(tabs[0].id, { action: 'EXECUTE_JOIN_GROUP' }, (res) => {
                            if (res && res.success) {
                                group.membershipStatus = res.status || 'PENDING';
                                console.log(`[ChobShop] Join requested for: ${group.name}`);
                            }
                            resolve();
                        });
                    } else resolve();
                });
            });
        }
    }
}

async function checkMembershipInTab(tabId, url) {
    const group = groups.find(g => g.url === url);
    if (!group) return;

    chrome.tabs.sendMessage(tabId, { action: 'GET_MEMBERSHIP_STATUS' }, (res) => {
        if (res && res.status) {
            group.membershipStatus = res.status;
            saveGroups();
            renderGroups();
        }
    });
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
                        <button class="btn-sm btn-scrape" data-id="${p.id}" title="ดึงรูปต้นฉบับ">
                            <span>🔍</span> ดึงรูป
                        </button>
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


    list.querySelectorAll('.btn-scrape').forEach(btn => {
        btn.addEventListener('click', () => scrapeAndPreview(btn.dataset.id, btn));
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

    const caption = getFormattedCaption(p);

    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'FILL_POST',
                data: {
                    caption: caption,
                    imageUrl: scrapedImages.get(id) || p.image
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast('⚠️ โปรด Refresh หน้า Facebook ก่อนใช้งานครั้งแรก');
                } else if (response && response.success) {
                    const result = response.postLink || { status: 'FAILED' };
                    const imageUrl = scrapedImages.get(id) || p.image;

                    // Save to history
                    chrome.storage.local.get(['postHistory'], (data) => {
                        const history = data.postHistory || [];
                        const groupName = document.querySelector('.group-link.active')?.innerText?.replace('👥 ', '') || 'Current Group';

                        const newEntry = {
                            id: Date.now(),
                            timestamp: new Date().toISOString(),
                            groupName: groupName,
                            productTitle: p.title,
                            image: imageUrl,
                            link: result.url || null,
                            status: result.status || 'PUBLISHED'
                        };

                        chrome.storage.local.set({ postHistory: [newEntry, ...history].slice(0, 50) }, () => {
                            if (result.status === 'PENDING') {
                                showToast('⏳ ส่งแล้ว (รอผู้ดูแลอนุมัติ)');
                            } else {
                                showToast('✅ กรอกข้อมูลลงหน้าเว็บแล้ว!');
                            }
                            if (document.getElementById('historyView')) renderHistory();
                        });
                    });
                }
            });
        }
    });
}

function resetAutoPost() {
    if (confirm('คุณต้องการรีเซ็ตสถานะระบบออโต้ใช่หรือไม่? (ระบบจะหยุดทำงานและล้างสถานะที่ค้างอยู่)')) {
        chrome.runtime.sendMessage({ action: 'RESET_AUTO_STATE' }, (res) => {
            if (res && res.success) {
                showToast('🔄 รีเซ็ตสถานะสำเร็จ!');
                setTimeout(refreshAutoStatus, 200);
            }
        });
    }
}

// Convert text to Unicode Bold Sans-Serif (Works for Latin Characters)
function toUnicodeBold(text) {
    const boldMap = {
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
    };
    return text.split('').map(char => boldMap[char] || char).join('');
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

// ===================== AUTO-POST TAB =====================

function initAutoTab() {
    // Load initial status quietly (don't start polling until tab is opened)
    refreshAutoStatus();
}

function toggleAutoPost() {
    const btn = document.getElementById('autoToggleBtn');
    const isCurrentlyRunning = btn.classList.contains('auto-stop-btn');

    if (isCurrentlyRunning) {
        // Stop
        btn.disabled = true;
        btn.innerHTML = '<span class="auto-btn-icon">⌛</span><span class="auto-btn-text">กำลังหยุด...</span>';

        chrome.runtime.sendMessage({ action: 'STOP_AUTO_POST' }, (res) => {
            btn.disabled = false;
            if (chrome.runtime.lastError) {
                alert('Stop Error: ' + chrome.runtime.lastError.message);
                refreshAutoStatus();
                return;
            }
            showToast('⏸️ หยุดออโต้โพสต์แล้ว');
            setTimeout(refreshAutoStatus, 100);
        });
    } else {
        // Pre-flight check: Ensure groups exist
        if (!groups || groups.length === 0) {
            alert('⚠️ กรุณาเพิ่มกลุ่ม Facebook ก่อนเริ่มออโต้โพสต์ (ในแท็บ "กลุ่มของฉัน")');
            document.querySelector('.tab-btn[data-tab="groups"]').click();
            return;
        }

        // Start
        const interval = parseInt(document.getElementById('autoInterval').value);
        btn.disabled = true;
        btn.innerHTML = '<span class="auto-btn-icon">⌛</span><span class="auto-btn-text">กำลังเริ่ม...</span>';

        chrome.runtime.sendMessage({ action: 'START_AUTO_POST', intervalMinutes: interval }, (res) => {
            btn.disabled = false;
            if (chrome.runtime.lastError) {
                alert('Start Error: ' + chrome.runtime.lastError.message);
                refreshAutoStatus();
                return;
            }
            if (res && res.success) {
                showToast('▶️ เริ่มออโต้โพสต์แล้ว!');
            } else if (res && res.error) {
                alert('⚠️ ตรวจพบปัญหาจากระบบหลังบ้าน: ' + res.error);
            } else {
                console.warn('[AutoPost] Unknown response from background:', res);
                showToast('⚠️ ระบบกำลังเริ่ม... กรุณารอสักครู่');
            }
            setTimeout(refreshAutoStatus, 300);
        });
    }
}

function updateAutoInterval() {
    const interval = parseInt(document.getElementById('autoInterval').value);
    chrome.runtime.sendMessage({ action: 'UPDATE_INTERVAL', intervalMinutes: interval }, (res) => {
        if (res && res.success) {
            showToast(`⏱️ ปรับความถี่เป็น ${interval} นาทีแล้ว`);
            refreshAutoStatus();
        }
    });
}

const CUTE_PHRASES = {
    IDLE: ["สวัสดีครับ พร้อมช่วยแล้ว! 💤", "มีอะไรให้บอทช่วยไหมครับ? ✨", "รอคำสั่งอยู่นะครับผม! 🤖", "วันนี้อากาศดีจังเลยครับ 🌤️"],
    ACTIVE: ["กำลังเฝ้านาฬิกาให้ครับ ⏱️", "เตรียมตุนแรงไว้โพสต์ครับ! 📡", "ทุกอย่างเรียบร้อยดีครับ 🌟", "ใกล้ถึงเวลาโพสต์แล้วนา... ⏰"],
    POSTING: ["กำลังปรุงโพสต์รสเด็ด... 🍳", "ส่งของไปกระจายข่าวแล้ว! 📢", "รอสักครู่นะ กำลังทำหน้าที่! ⚡", "โพสต์นี้ต้องปังแน่นอน! 🎨"]
};

let lastSpeechTime = 0;
function updateBotPersonality(status) {
    const speechEl = document.getElementById('botSpeech');
    const iconEl = document.getElementById('botIcon');
    if (!speechEl || !iconEl) return;

    // Change phrase every 10 seconds or when status changes
    const now = Date.now();
    if (now - lastSpeechTime > 10000 || !speechEl.classList.contains('show')) {
        const phrases = CUTE_PHRASES[status] || CUTE_PHRASES.IDLE;
        const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
        speechEl.innerText = randomPhrase;
        speechEl.classList.add('show');
        lastSpeechTime = now;

        // Hide speech after 6 seconds to breathe
        setTimeout(() => {
            if (Date.now() - lastSpeechTime >= 6000) {
                speechEl.classList.remove('show');
            }
        }, 6000);
    }

    // Update Icon Based on Status
    if (status === 'POSTING') {
        iconEl.innerText = '⚡';
        iconEl.style.transform = 'scale(1.2)';
    } else if (status === 'ACTIVE') {
        iconEl.innerText = '🛰️';
        iconEl.style.transform = 'scale(1)';
    } else {
        iconEl.innerText = '😴';
        iconEl.style.transform = 'scale(1)';
    }
}

function refreshAutoStatus() {
    chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Status check failed:', chrome.runtime.lastError);
            if (document.getElementById('autoSubtext')) document.getElementById('autoSubtext').textContent = '⚠️ การเชื่อมต่อขัดข้อง';
            return;
        }

        if (!response || !response.state) {
            console.warn('No response from status check');
            return;
        }

        const { state, nextAlarm } = response;
        const isRunning = state.isRunning;
        const isPosting = state.isPosting;

        // Status Badge
        const hero = document.getElementById('autoHero');
        const statusTextLarge = document.getElementById('autoStatusTextLarge');
        const subtext = document.getElementById('autoSubtext');
        const botIcon = document.getElementById('botIcon');
        const liveBadge = document.getElementById('liveBadge');
        const progress = document.getElementById('botProgress');

        // Reset classes
        hero.classList.remove('running', 'posting');
        statusTextLarge.className = 'hero-status-text';
        liveBadge.style.display = 'none';
        progress.style.display = 'none';

        if (isPosting) {
            hero.classList.add('running', 'posting');
            statusTextLarge.textContent = 'กำลังโพสต์...';
            statusTextLarge.classList.add('status-posting');
            subtext.textContent = state.currentActivity || 'ระบบกำลังส่งข้อมูลไปยังกลุ่ม Facebook';
            updateBotPersonality('POSTING');
            liveBadge.style.display = 'inline-flex';
            progress.style.display = 'block';
        } else if (isRunning) {
            hero.classList.add('running');
            statusTextLarge.textContent = 'ระบบกำลังทำงาน';
            statusTextLarge.classList.add('status-active');
            subtext.textContent = 'เตรียมความพร้อมสำหรับโพสต์ถัดไป';
            updateBotPersonality('ACTIVE');
            liveBadge.style.display = 'inline-flex';
        } else {
            statusTextLarge.textContent = 'หยุดทำงาน';
            statusTextLarge.classList.add('status-idle');
            subtext.textContent = 'กดเริ่มเพื่อเริ่มระบบโพสต์ออโต้';
            updateBotPersonality('IDLE');
        }

        // Toggle Button
        const btn = document.getElementById('autoToggleBtn');
        const intervalSelect = document.getElementById('autoInterval');
        if (isRunning) {
            btn.className = 'auto-stop-btn';
            btn.innerHTML = '<span class="auto-btn-icon">⏸️</span><span class="auto-btn-text">หยุดออโต้</span>';
            intervalSelect.disabled = true;
        } else {
            btn.className = 'auto-start-btn';
            btn.innerHTML = '<span class="auto-btn-icon">▶️</span><span class="auto-btn-text">เริ่มระบบออโต้</span>';
            intervalSelect.disabled = false;
        }

        // Set interval dropdown to match running interval
        if (state.intervalMinutes) {
            intervalSelect.value = state.intervalMinutes;
        }

        // Stats
        document.getElementById('statPostCount').textContent = state.postCount || 0;

        // Current group
        chrome.storage.local.get(['fbGroups'], (result) => {
            const fbGroups = result.fbGroups || [];
            const el = document.getElementById('statCurrentGroup');
            if (fbGroups.length > 0 && state.groupIndex !== undefined) {
                const idx = state.groupIndex % fbGroups.length;
                const groupName = fbGroups[idx]?.name || '-';
                el.textContent = groupName;
                el.title = groupName; // Show full name on hover
            } else {
                el.textContent = '-';
            }
        });

        // Countdown
        if (isPosting) {
            document.getElementById('statCountdown').textContent = 'Live';
        } else if (nextAlarm && isRunning) {
            updateCountdown(nextAlarm);
        } else {
            document.getElementById('statCountdown').textContent = '--:--';
        }

        // Activity Log
        renderAutoLog(state.log || []);
    });
}

function updateCountdown(nextAlarmTime) {
    const now = Date.now();
    const diff = nextAlarmTime - now;

    if (diff <= 0) {
        document.getElementById('statCountdown').textContent = 'กำลังโพสต์...';
        return;
    }

    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    document.getElementById('statCountdown').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function renderAutoLog(log) {
    try {
        const list = document.getElementById('autoLogList');
        const countEl = document.getElementById('logCount');
        if (!list || !countEl) return;

        countEl.textContent = `${log.length} รายการ`;

        if (log.length === 0) {
            list.innerHTML = '<div class="auto-log-empty">ยังไม่มีบันทึกการทำงาน</div>';
            return;
        }

        list.innerHTML = log.map(entry => {
            if (typeof entry !== 'string') return '';
            const isError = entry.includes('❌') || entry.includes('🚨');
            const linkRegex = /(https?:\/\/[^\s]+)/g;
            let mainContent = entry;
            let actionHtml = '';

            try {
                const links = entry.match(linkRegex);
                if (links && links.length > 0) {
                    const lastLink = links[links.length - 1];
                    mainContent = entry.replace(lastLink, '').replace(/\s*\|\s*$/, '').trim();
                    actionHtml = `<a href="${lastLink}" target="_blank" class="log-action">ดูโพสต์</a>`;
                }
            } catch (e) { }

            return `
                <div class="log-entry ${isError ? 'error' : ''}">
                    <div class="log-content">${mainContent}</div>
                    ${actionHtml}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('renderAutoLog error:', err);
    }
}

async function renderHistory() {
    const list = document.getElementById('historyList');
    const search = document.getElementById('historySearchInput').value.toLowerCase();

    const { postHistory = [] } = await chrome.storage.local.get('postHistory');

    const filtered = postHistory.filter(h =>
        h.groupName.toLowerCase().includes(search) ||
        h.productTitle.toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-msg">🚫 ไม่พบประวัติการโพสต์</div>';
        return;
    }

    list.innerHTML = filtered.map(h => {
        const time = new Date(h.timestamp).toLocaleString('th-TH', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short'
        });

        return `
            <div class="product-card" style="padding: 10px;">
                <img src="${h.image || 'https://via.placeholder.com/60'}" class="prod-img" style="width: 50px; height: 50px;">
                <div class="prod-info">
                    <div class="prod-title" style="font-size: 12px; margin-bottom: 2px;">${h.productTitle}</div>
                    <div style="font-size: 11px; color: var(--text-dim); display: flex; justify-content: space-between; align-items: center;">
                        <span>👥 ${h.groupName}</span>
                        <span>⏰ ${time}</span>
                    </div>
                    <div style="margin-top: 6px; display: flex; gap: 8px;">
                        ${h.status === 'PENDING'
                ? `<span style="font-size: 10px; color: #f59e0b; font-weight: bold;">⏳ รออนุมัติ</span>`
                : h.link
                    ? `<a href="${h.link}" target="_blank" class="btn-sm btn-copy" style="text-decoration: none; padding: 4px 10px;">🔗 ดูโพสต์</a>`
                    : `<span style="font-size: 10px; color: var(--error);">❌ ไม่มีลิงก์</span>`
            }
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function startAutoPolling() {
    stopAutoPolling();
    autoPollingInterval = setInterval(refreshAutoStatus, 2000);
}

function stopAutoPolling() {
    if (autoPollingInterval) {
        clearInterval(autoPollingInterval);
        autoPollingInterval = null;
    }
}

// ===================== SCRAPER SYSTEM =====================
let lastScrapedData = null;

function initScraper() {
    const scrapeBtn = document.getElementById('scrapeBtn');
    const input = document.getElementById('scrapeUrlInput');
    const resultDiv = document.getElementById('scrapeResult');
    const loadingDiv = document.getElementById('scrapeLoading');
    const copyBtn = document.getElementById('copyBase64Btn');
    const useBtn = document.getElementById('useScrapedBtn');

    if (!scrapeBtn) return;

    scrapeBtn.addEventListener('click', async () => {
        const url = input.value.trim();
        if (!url) {
            showToast('⚠️ กรุณาใส่ลิงก์สินค้า');
            return;
        }

        scrapeBtn.disabled = true;
        resultDiv.classList.add('hidden');
        loadingDiv.classList.remove('hidden');

        try {
            console.log('[Popup] Sending SCRAPE_PRODUCT request for:', url);
            const result = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'SCRAPE_PRODUCT', url }, resolve);
            });

            if (result && result.success) {
                lastScrapedData = result;
                document.getElementById('scrapeTitle').textContent = result.title;
                document.getElementById('scrapePreview').src = result.base64 || result.imageUrl;
                document.getElementById('scrapeInfo').textContent = `ดึงข้อมูลสำเร็จ! (${result.base64 ? 'มีรูปภาพ Base64' : 'ไม่มี Base64'})`;

                resultDiv.classList.remove('hidden');
                showToast('✅ ดึงข้อมูลสำเร็จ!');
            } else {
                showToast('❌ ผิดพลาด: ' + (result?.error || 'ไม่สามารถดึงข้อมูลได้'));
            }
        } catch (err) {
            console.error('Scrape error:', err);
            showToast('❌ เกิดข้อผิดพลาดทางเทคนิค');
        } finally {
            scrapeBtn.disabled = false;
            loadingDiv.classList.add('hidden');
        }
    });

    copyBtn.addEventListener('click', () => {
        if (lastScrapedData && lastScrapedData.base64) {
            navigator.clipboard.writeText(lastScrapedData.base64);
            showToast('📋 คัดลอก Base64 แล้ว!');
        } else {
            showToast('⚠️ ไม่มีข้อมูล Base64');
        }
    });

    useBtn.addEventListener('click', () => {
        if (!lastScrapedData) return;

        // Find any active Facebook group tab to post to
        chrome.tabs.query({ url: "*://*.facebook.com/groups/*" }, (tabs) => {
            if (tabs.length === 0) {
                showToast('⚠️ กรุณาเปิดหน้ากลุ่ม Facebook ก่อน');
                return;
            }

            const tab = tabs[0];
            const caption = settings.captionTemplate
                .replace(/{{title}}/g, lastScrapedData.title)
                .replace(/{{link}}/g, input.value.trim() + ' ')
                .replace(/{{price}}/g, '...')
                .replace(/{{desc}}/g, '');

            chrome.tabs.sendMessage(tab.id, {
                action: 'FILL_POST',
                data: {
                    caption: caption,
                    imageUrl: lastScrapedData.base64 || lastScrapedData.imageUrl
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    showToast('❌ ไม่สามารถส่งข้อมูลไปยังแท็บ Facebook ได้');
                } else {
                    showToast('🚀 ส่งข้อมูลไปยัง Facebook แล้ว!');
                }
            });
        });
    });
}

// ===================== PRODUCT LIST SCRAPER =====================

async function scrapeAndPreview(id, btnEl) {
    const p = products.find(prod => prod.id == id);
    if (!p) return;

    const url = (p.affiliateUrl && p.affiliateUrl.length > 5) ? p.affiliateUrl : null;
    if (!url) {
        showToast('⚠️ ไม่พบบริบท Shopee ให้ดึงรูป');
        return;
    }

    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = '⌛..';
    btnEl.disabled = true;

    try {
        console.log(`[Scraper] Requesting high-res image for product: ${p.id}`);
        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'SCRAPE_PRODUCT', url }, resolve);
        });

        if (result && result.success && result.base64) {
            // Save to map
            scrapedImages.set(id, result.base64);

            // Update UI: Find the image element in the specific card
            const card = btnEl.closest('.product-card');
            if (card) {
                const img = card.querySelector('.prod-img');
                if (img) {
                    img.src = result.base64;
                    img.style.border = '2px solid #10b981';
                    img.style.borderRadius = '8px';
                }
            }

            showToast('✅ ดึงรูปต้นฉบับสำเร็จ!');
            btnEl.innerHTML = '<span>✨</span> สำเร็จ';
            btnEl.style.backgroundColor = '#10b981';
            btnEl.style.color = 'white';
        } else {
            showToast('❌ ไม่พบรูป (OG Image)');
            btnEl.innerHTML = originalText;
            btnEl.disabled = false;
        }
    } catch (err) {
        console.error('Manual scrape error:', err);
        showToast('❌ เกิดข้อผิดพลาด');
        btnEl.innerHTML = originalText;
        btnEl.disabled = false;
    }
}
