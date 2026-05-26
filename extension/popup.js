let products = [];
let groups = [];
const settings = {
    botName: '',
    apiEndpoint: 'https://chob.shop', // Default
    captionTemplate: '✨ {{title}} ✨\n\n{{desc}}\n\n✅ สินค้าคุณภาพดี คัดสรรมาเพื่อคุณ\n🌟 ดีไซน์สวย ทันสมัย ใช้งานง่าย\n💎 แข็งแรง ทนทาน คุ้มค่าที่สุด\n🚀 พร้อมส่งด่วน สั่งซื้อได้เลยวันนี้!\n\n💰 ราคาพิเศษเพียง: {{price}} บาท\n📍 สนใจสั่งซื้อได้ที่นี่: {{link}}\n\n#ช้อปปิ้งออนไลน์ #สินค้าดีบอกต่อ #คุ้มค่า #รับประกันคุณภาพ'
};
let currentTabIsFBGroup = false;
let displayLimit = 10;
const ITEMS_PER_PAGE = 10;

async function copyToClipboard(id) {
    const p = products.find(prod => prod.id == id);
    if (!p) return;

    const link = (p.affiliateUrl && p.affiliateUrl.length > 5)
        ? p.affiliateUrl
        : `https://chob.shop/?productId=${p.id}`;

    // Apply bold to title (Latin characters)
    const displayTitle = toUnicodeBold(p.title || '');

    let caption = settings.captionTemplate
        .replace(/{{title}}/g, displayTitle)
        .replace(/{{price}}/g, parseFloat(p.price || 0).toLocaleString())
        .replace(/{{link}}/g, link + ' ') // Add space to prevent FB masking
        .replace(/{{desc}}/g, p.description || '')
        .replace(/{{tags}}/g, '');

    // Safety: Ensure double newlines
    caption = caption.replace(/\n\s*\n/g, '\n\n').trim();

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
    await checkCurrentTab();
    await loadSettings();
    await loadGroups();
    await fetchProducts();
    initEventListeners();
    initAutoTab();

    // Initial state: hide search container because 'auto' is default
    const searchContainer = document.querySelector('.search-container');
    if (searchContainer) {
        searchContainer.style.display = 'none';
    }
    // Start polling since 'auto' is active
    startAutoPolling();
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
        chrome.storage.sync.get(['apiEndpoint', 'captionTemplate', 'botName'], (result) => {
            if (result.apiEndpoint) settings.apiEndpoint = result.apiEndpoint;
            if (result.captionTemplate) settings.captionTemplate = result.captionTemplate;
            if (result.botName) settings.botName = result.botName;

            // Populate settings UI
            document.getElementById('apiEndpoint').value = settings.apiEndpoint;
            document.getElementById('captionTemplate').value = settings.captionTemplate;
            document.getElementById('botName').value = settings.botName || '';
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

    // Tab Switching (3 tabs: products / groups / auto)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const tab = btn.dataset.tab;
            const views = ['productsView', 'groupsView', 'autoView'];
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
            }
        });
    });

    // Auto Toggle Button
    document.getElementById('autoToggleBtn').addEventListener('click', toggleAutoPost);

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
        const botName = document.getElementById('botName').value.trim();

        chrome.storage.sync.set({ apiEndpoint: api, captionTemplate: template, botName: botName }, () => {
            settings.apiEndpoint = api;
            settings.captionTemplate = template;
            settings.botName = botName;
            document.getElementById('settingsView').classList.add('hidden');
            fetchProducts(); // Refetch with new endpoint

            // Trigger an immediate heartbeat update
            chrome.runtime.sendMessage({ action: 'SEND_HEARTBEAT' });
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
            <span class="group-link" data-url="${g.url}" title="ไปยังกลุ่ม">👥 ${g.name}</span>
            <div class="group-actions">
                <span class="btn-del" data-id="${g.id}">🗑️</span>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.group-link').forEach(link => {
        link.addEventListener('click', () => {
            const url = link.dataset.url;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: url }, async () => {
                        // After navigation, re-check tab status to refresh UI
                        await new Promise(r => setTimeout(r, 500)); // Small buffer for nav
                        await checkCurrentTab();
                        renderProducts(); // Refresh buttons
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

    const link = (p.affiliateUrl && p.affiliateUrl.length > 5)
        ? p.affiliateUrl
        : `https://chob.shop/?productId=${p.id}`;

    // Apply bold to title (Latin characters)
    const displayTitle = toUnicodeBold(p.title || '');

    let caption = settings.captionTemplate
        .replace(/{{title}}/g, displayTitle)
        .replace(/{{price}}/g, parseFloat(p.price || 0).toLocaleString())
        .replace(/{{link}}/g, link + ' ') // Add space to prevent FB masking
        .replace(/{{desc}}/g, p.description || '')
        .replace(/{{tags}}/g, '');

    // Safety: Ensure double newlines
    caption = caption.replace(/\n\s*\n/g, '\n\n').trim();

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
        chrome.runtime.sendMessage({ action: 'STOP_AUTO_POST' }, (res) => {
            if (chrome.runtime.lastError) {
                alert('Stop Error: ' + chrome.runtime.lastError.message);
                return;
            }
            showToast('⏸️ หยุดออโต้โพสต์แล้ว');
            setTimeout(refreshAutoStatus, 100);
        });
    } else {
        // Start
        const interval = parseInt(document.getElementById('autoInterval').value);
        chrome.runtime.sendMessage({ action: 'START_AUTO_POST', intervalMinutes: interval }, (res) => {
            if (chrome.runtime.lastError) {
                alert('Start Error: ' + chrome.runtime.lastError.message);
                return;
            }
            if (res && res.success) {
                showToast('▶️ เริ่มออโต้โพสต์แล้ว!');
            } else if (res && res.error) {
                alert('Error from Background: ' + res.error);
            }
            setTimeout(refreshAutoStatus, 500);
        });
    }
}

function refreshAutoStatus() {
    chrome.runtime.sendMessage({ action: 'GET_AUTO_STATUS' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Status check failed:', chrome.runtime.lastError);
            document.getElementById('autoStatusText').textContent = '⚠️ การเชื่อมต่อขัดข้อง';
            return;
        }

        if (!response) {
            console.warn('No response from status check');
            return;
        }

        const { state, nextAlarm } = response;
        const isRunning = state.isRunning;
        const isPosting = state.isPosting;

        // Status Badge
        const badge = document.getElementById('autoStatusBadge');
        const statusText = document.getElementById('autoStatusText');
        if (isPosting) {
            badge.classList.add('running');
            statusText.textContent = '🚀 กำลังเตรียมโพสต์...';
        } else if (isRunning) {
            badge.classList.add('running');
            statusText.textContent = '🟢 กำลังทำงาน';
        } else {
            badge.classList.remove('running');
            statusText.textContent = '🔴 หยุดอยู่';
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
            btn.innerHTML = '<span class="auto-btn-icon">▶️</span><span class="auto-btn-text">เริ่มออโต้</span>';
            intervalSelect.disabled = false;
        }

        // Set interval dropdown to match running interval
        if (state.intervalMinutes) {
            intervalSelect.value = state.intervalMinutes;
        }

        // Stats
        document.getElementById('statPostCount').textContent = state.postCount || 0;

        // Current group
        chrome.storage.sync.get(['fbGroups'], (result) => {
            const fbGroups = result.fbGroups || [];
            if (fbGroups.length > 0 && state.groupIndex !== undefined) {
                const idx = state.groupIndex % fbGroups.length;
                const groupName = fbGroups[idx]?.name || '-';
                document.getElementById('statCurrentGroup').textContent = groupName.length > 6 ? groupName.substring(0, 6) + '..' : groupName;
            } else {
                document.getElementById('statCurrentGroup').textContent = '-';
            }
        });

        // Countdown
        if (isPosting) {
            document.getElementById('statCountdown').textContent = 'Processing..';
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
    const list = document.getElementById('autoLogList');
    const countEl = document.getElementById('logCount');

    countEl.textContent = `${log.length} รายการ`;

    if (log.length === 0) {
        list.innerHTML = '<div class="auto-log-empty">ยังไม่มีประวัติการโพสต์</div>';
        return;
    }

    list.innerHTML = log.map(entry => {
        const isError = entry.includes('❌');

        // Convert URLs to clickable links
        // Regex to find http/https links
        const linkRegex = /(https?:\/\/[^\s]+)/g;
        let html = entry.replace(linkRegex, (url) => {
            return `<a href="${url}" target="_blank" class="log-link">ดูโพสต์</a>`;
        });

        return `<div class="auto-log-entry${isError ? ' error' : ''}">${html}</div>`;
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
