// Dashboard logic for CHOB.SHOP BOT OFFICE
// Real-time polling with per-bot post history

let bots = [];
let lastFetchedCount = 0;
let currentFilter = 'all';
let historyCache = [];

// Isometric Office Layout Coordinates (%)
const OFFICE_ZONES = {
    'MBAI_BUSINESS': { top: 12, left: 50 },
    'GENIXPLUS_GLOBAL': { top: 13, left: 78 },
    'DGA': { top: 15, left: 22 },
    'CEO_STRATEGY': { top: 35, left: 50 },
    'MARKETING_OF_AI': { top: 25, left: 20 },
    'MEEORDER': { top: 28, left: 80 },
    'PRODUCT_SAAS': { top: 48, left: 16 },
    'COURSE_FACTORY': { top: 50, left: 34 },
    'STUDENT_SUPPORT': { top: 52, left: 63 },
    'KRUFERN_DIGITAL': { top: 48, left: 85 },
    'FINANCE_ACCOUNTING': { top: 68, left: 14 },
    'DATA_COST_CONTROL': { top: 68, left: 28 },
    'BUSINESS_SERVICE': { top: 63, left: 47 },
    'AC_CONTENT_FACTORY': { top: 65, left: 74 }
};

// Track current positions for smooth wandering
const botPositions = {};
const pendingCommands = {}; // Track optimistic UI states

document.addEventListener('DOMContentLoaded', () => {
    startPolling();
    addConsoleLog('🚀 Chob.Shop Bot Dashboard started');
    addConsoleLog('📡 Connecting to system office...');

    // Initial fetch
    fetchBots();
    fetchHistory();

    // Tab click handler (event delegation)
    document.getElementById('historyTabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (!btn) return;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderHistory(historyCache);
    });
});

async function fetchBots() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch('/api/bots', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();

        if (data.success) {
            const oldBots = [...bots];
            bots = data.bots.sort((a, b) => a.bot_name.localeCompare(b.bot_name, undefined, { numeric: true, sensitivity: 'base' }));

            // Only log Found bots if count changed or first time
            if (bots.length !== oldBots.length || oldBots.length === 0) {
                const onlineCount = bots.filter(b => (Date.now() - new Date(b.last_heartbeat).getTime()) < 120000).length;
                const offlineCount = bots.length - onlineCount;
                console.log('Fetched bots:', bots);
                addConsoleLog(`📡 Sync: Found ${bots.length} bot(s) — ${onlineCount} online, ${offlineCount} offline`);
            }

            renderOffice();
            updateGlobalStats();
            updateBotTabs();
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.warn('Fetch bots timed out');
        } else {
            console.error('Fetch bots error:', err);
            addConsoleLog('❌ Error connecting to API: ' + err.message);
        }
    }
}

function updateBotTabs() {
    const tabBar = document.getElementById('historyTabs');
    const existingNames = Array.from(tabBar.querySelectorAll('.tab-btn[data-filter]:not([data-filter="all"])')).map(b => b.dataset.filter);
    const botNames = bots.map(b => b.bot_name);

    // Add missing tabs
    botNames.forEach(name => {
        if (!existingNames.includes(name)) {
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.dataset.filter = name;
            btn.textContent = `${getBotAvatar(name)} ${name}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = name;
                renderHistory(historyCache);
            });
            tabBar.appendChild(btn);
        }
    });

    // Remove tabs for bots that no longer exist
    tabBar.querySelectorAll('.tab-btn[data-filter]:not([data-filter="all"])').forEach(btn => {
        if (!botNames.includes(btn.dataset.filter)) {
            btn.remove();
        }
    });
}

function renderOffice() {
    const office = document.getElementById('botOffice');
    const commandGrid = document.getElementById('commandCards');

    if (bots.length === 0) {
        commandGrid.innerHTML = '<div class="loading-state"><span>NO BOTS ONLINE...</span></div>';
        office.innerHTML = '<div class="loading-pixel">NO BOTS ONLINE...</div>';
        return;
    }

    const loadingState = commandGrid.querySelector('.loading-state');
    if (loadingState) commandGrid.innerHTML = ''; // Clear only once

    bots.forEach(bot => {
        const safeId = bot.bot_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        const lastHeartbeat = new Date(bot.last_heartbeat).getTime();
        const isOffline = (Date.now() - lastHeartbeat) > 120000;
        const isPosting = bot.stats.isPosting || bot.status === 'POSTING';
        const avatar = getBotAvatar(bot.bot_name);

        let statusText = isOffline ? 'OFFLINE' : (isPosting ? 'POSTING' : (bot.status || 'IDLE'));
        const currentActivity = isOffline ? 'Disconnected' : (bot.stats.activity || 'Waiting for next task...');
        const nextRunDisplay = isOffline ? 'OFFLINE' : (isPosting ? 'BUSY' : formatNextRun(bot.stats.next_run));

        // --- 1. Render/Update Command Card ---
        let card = document.getElementById(`cmd-card-${safeId}`);
        if (!card) {
            card = document.createElement('div');
            card.id = `cmd-card-${safeId}`;
            commandGrid.appendChild(card);
        }

        card.className = `bot-command-card animate-fade-in ${isOffline ? 'offline' : ''}`;

        const cardHtml = `
            <div class="card-header">
                <div class="card-title-group">
                    <div class="bot-avatar-circle">${avatar}</div>
                    <div class="bot-info">
                        <span class="name">${bot.bot_name}</span>
                        <span class="status-pill ${isOffline ? 'offline' : (isPosting ? 'posting' : (pendingCommands[safeId] ? 'pending' : 'active'))}">
                            ${pendingCommands[safeId] ? '⏳ ' + pendingCommands[safeId] : statusText}
                        </span>
                    </div>
                </div>
                <button class="btn-icon" onclick="deleteBot('${bot.bot_name}')" title="Remove Bot">🗑️</button>
            </div>
            
            <div class="card-activity-line" title="${currentActivity}">
                ${isOffline ? '💤 ' : (isPosting ? '⚡ ' : '')}${currentActivity}
            </div>
            
            <div class="card-stats-mini">
                <div class="stat">
                    <span class="label">INTERVAL</span>
                    <select id="interval-${safeId}" class="stat-select" onchange="handleCommand('${bot.bot_name}', 'SET_INTERVAL')">
                        <option value="15" ${bot.stats.interval === 15 ? 'selected' : ''}>15m</option>
                        <option value="30" ${bot.stats.interval === 30 ? 'selected' : ''}>30m</option>
                        <option value="60" ${bot.stats.interval === 60 ? 'selected' : ''}>1h</option>
                        <option value="120" ${bot.stats.interval === 120 ? 'selected' : ''}>2h</option>
                    </select>
                </div>
                <div class="stat">
                    <span class="label">NEXT RUN</span>
                    <span class="val countdown" data-time="${bot.stats.next_run || 0}">${nextRunDisplay}</span>
                </div>
            </div>
            
            <div class="card-controls">
                ${!isOffline && (bot.status === 'ACTIVE' || isPosting)
                ? `<button class="btn-card stop" onclick="handleCommand('${bot.bot_name}', 'STOP')">⏸️ STOP</button>`
                : `<button class="btn-card start" onclick="handleCommand('${bot.bot_name}', 'START')">▶️ START</button>`
            }
                <button class="btn-card" onclick="handleCommand('${bot.bot_name}', 'START', true)" style="background:rgba(255,255,255,0.05); color:#fff;">🔄 RESET</button>
            </div>
        `;

        // Update only if content changed to prevent flicker but allow countdowns to keep refs
        if (card.innerHTML !== cardHtml) {
            // Note: If we use innerHTML, we lose focus on select. 
            // However, handleCommand SET_INTERVAL triggers fetchBots so it's usually fine.
            card.innerHTML = cardHtml;
        }

        // --- 2. Render Isometric Sprite ---
        // --- 2. Intelligent Room Distribution ---
        let goalZone = 'BUSINESS_SERVICE';
        if (isPosting) goalZone = 'AC_CONTENT_FACTORY';
        else if (bot.status === 'ACTIVE' || !isOffline) {
            // Distribute active bots across key functional areas
            if (safeId.includes('bot-1')) goalZone = 'MARKETING_OF_AI';
            else if (safeId.includes('bot-2')) goalZone = 'PRODUCT_SAAS';
            else if (safeId.includes('bot-3')) goalZone = 'COURSE_FACTORY';
            else if (safeId.includes('bot-4')) goalZone = 'MeeOrder';
            else if (safeId.includes('bot-5')) goalZone = 'GENIXPLUS_GLOBAL';
            else goalZone = 'BUSINESS_SERVICE';
        }

        if (bot.bot_name.toLowerCase().includes('master') || bot.bot_name.toLowerCase().includes('ceo')) {
            goalZone = 'CEO_STRATEGY';
        }

        const zone = OFFICE_ZONES[goalZone] || OFFICE_ZONES.BUSINESS_SERVICE;

        // Ensure bots have persistent distinct positions within zones
        if (!botPositions[safeId]) {
            botPositions[safeId] = {
                top: zone.top + (Math.random() * 8 - 4),
                left: zone.left + (Math.random() * 8 - 4),
                wanderX: 0,
                wanderY: 0
            };
        }

        const pos = botPositions[safeId];

        // --- High-Mobility Wandering ---
        // Active bots wander more energetically
        const activityScale = (bot.status === 'ACTIVE' || isPosting) ? 5 : 2;
        pos.wanderX = Math.sin(Date.now() / 2000 + parseInt(safeId.split('-')[1] || 0)) * activityScale;
        pos.wanderY = Math.cos(Date.now() / 2500 + parseInt(safeId.split('-')[1] || 0)) * (activityScale / 2);

        // Targeted movement towards the zone center + wandering
        const currentTop = zone.top + pos.wanderY;
        const currentLeft = zone.left + pos.wanderX;

        let charDiv = document.getElementById(`char-container-${safeId}`);
        if (!charDiv) {
            charDiv = document.createElement('div');
            charDiv.id = `char-container-${safeId}`;
            const isIdle = !isOffline && bot.status !== 'ACTIVE' && !isPosting;
            charDiv.className = `bot-character bot-character-container ${isOffline ? 'offline' : ''} ${isPosting ? 'posting working' : ''} ${isIdle ? 'idle' : ''}`;

            // Create Droid Structure
            const shadow = document.createElement('div');
            shadow.className = 'bot-character-shadow';
            charDiv.appendChild(shadow);

            const tag = document.createElement('div');
            tag.className = 'bot-status-tag';
            charDiv.appendChild(tag);

            const stack = document.createElement('div');
            stack.className = 'voxel-stack';

            const body = document.createElement('div');
            body.className = 'bot-character-body';
            stack.appendChild(body);

            const visor = document.createElement('div');
            visor.className = 'bot-character-visor';
            stack.appendChild(visor);

            charDiv.appendChild(stack);
            office.appendChild(charDiv);
        }

        // Update Position & Z-Index (Painter's Algorithm for Isometric)
        charDiv.style.top = `${currentTop}%`;
        charDiv.style.left = `${currentLeft}%`;
        charDiv.style.transform = 'translate(-50%, -100%)';
        charDiv.style.zIndex = Math.floor(currentTop * 10) + 100;

        // Update status class for animations
        const isWorking = isPosting || (bot.status === 'ACTIVE');
        charDiv.className = `bot-character bot-character-container ${isOffline ? 'offline' : ''} ${isPosting ? 'posting' : ''} ${isWorking ? 'working' : ''}`;

        // Update status tag
        const tag = charDiv.querySelector('.bot-status-tag');
        if (tag) {
            tag.innerHTML = `${isOffline ? '💤' : (isPosting ? '⚡' : '✨')} ${bot.bot_name}`;
            tag.style.borderColor = isOffline ? '#64748b' : (isPosting ? 'var(--pixel-pink)' : 'var(--pixel-green)');
            tag.style.color = tag.style.borderColor;
        }

        // Cleanup orphaned sprites
        const currentSafeIds = bots.map(b => b.bot_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, ''));
        Array.from(office.querySelectorAll('.bot-character')).forEach(char => {
            const cid = char.id.replace('char-container-', '');
            if (!currentSafeIds.includes(cid)) office.removeChild(char);
        });

        // Cleanup orphaned cards
        const currentCardIds = bots.map(b => `cmd-card-${b.bot_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`);
        Array.from(commandGrid.querySelectorAll('.bot-command-card')).forEach(card => {
            if (!currentCardIds.includes(card.id)) commandGrid.removeChild(card);
        });

        if (bots.length !== lastFetchedCount) {
            const diff = bots.length - lastFetchedCount;
            // Only log "new bots" if it's not the initial load (where we already show "Sync: Found X")
            if (diff > 0 && lastFetchedCount !== 0) {
                addConsoleLog(`✨ ${diff} new bot(s) appeared in the command center!`);
            } else if (diff < 0) {
                addConsoleLog(`🗑️ ${Math.abs(diff)} bot(s) removed from the command center.`);
            }
            lastFetchedCount = bots.length;
        }
    });
}

function updateGlobalStats() {
    const activeCount = bots.filter(b => (Date.now() - new Date(b.last_heartbeat).getTime()) < 120000).length;
    const totalPosts = bots.reduce((acc, bot) => acc + (bot.stats.postCount || 0), 0);

    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('totalPosts').textContent = totalPosts;
}

async function fetchHistory() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch('/api/bots/history?limit=30', { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await response.json();

        if (data.success) {
            historyCache = data.history;
            renderHistory(data.history);
        } else {
            console.error('History API Error:', data.error);
            const list = document.getElementById('workHistory');
            list.innerHTML = `<div class="history-empty"><span class="empty-icon">⚠️</span><span>${data.error || 'Unknown Error'}</span></div>`;
        }
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name !== 'AbortError') {
            console.error('Fetch history error:', err);
        }
    }
}

function renderHistory(history) {
    const list = document.getElementById('workHistory');

    // Apply filter
    let filtered = history;
    if (currentFilter !== 'all') {
        filtered = history.filter(h => h.bot_name === currentFilter);
    }

    if (!filtered || filtered.length === 0) {
        list.innerHTML = `<div class="history-empty"><span class="empty-icon">${currentFilter === 'all' ? '📡' : '🔍'}</span><span>${currentFilter === 'all' ? 'ยังไม่มีประวัติการโพสต์...' : `ไม่พบประวัติสำหรับ ${currentFilter}`}</span></div>`;
        return;
    }

    list.innerHTML = '';
    filtered.forEach(entry => {
        const row = document.createElement('div');
        const statusClass = entry.status === 'FAILED' ? 'failed' : (entry.status === 'PENDING' ? 'pending' : 'success');
        row.className = `history-card ${statusClass}`;

        const time = new Date(entry.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(entry.timestamp).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
        const avatar = getBotAvatar(entry.bot_name || '');

        // Status badge
        let statusBadge = '';
        if (entry.status === 'FAILED') statusBadge = '<span class="status-badge failed">❌ ล้มเหลว</span>';
        else if (entry.status === 'PENDING') statusBadge = '<span class="status-badge pending">⏳ รออนุมัติ</span>';
        else statusBadge = '<span class="status-badge success">✅ สำเร็จ</span>';

        // Thumbnail
        const thumbHtml = entry.image ? `<div class="history-thumb"><img src="${entry.image}" alt="" loading="lazy" onerror="this.parentElement.style.display='none'"></div>` : '';

        // Link button
        const linkHtml = entry.link ? `<a href="${entry.link}" target="_blank" class="view-post-btn" title="ดูโพสต์บน Facebook">🔗 ดูโพสต์</a>` : '<span class="no-link">—</span>';

        row.innerHTML = `
            ${thumbHtml}
            <div class="history-card-body">
                <div class="history-card-top">
                    <span class="history-bot-tag">${avatar} ${entry.bot_name || 'Unknown'}</span>
                    ${statusBadge}
                    <span class="history-datetime">${date} ${time}</span>
                </div>
                <div class="history-card-content">
                    <div class="history-product-title">${entry.productTitle || 'ไม่ระบุสินค้า'}</div>
                    <div class="history-group-name">📌 ${entry.groupName || 'ไม่ระบุกลุ่ม'}</div>
                </div>
            </div>
            <div class="history-card-action">
                ${linkHtml}
            </div>
        `;
        list.appendChild(row);
    });
}

// Voxel Stacking Renderer
// Creates a 3D effect by layering slices vertically
function renderVoxelStack(container, imageUrl) {
    container.innerHTML = '';
    const layers = 14; // Number of slices for thickness

    for (let i = 0; i < layers; i++) {
        const layer = document.createElement('div');
        layer.className = 'voxel-layer';
        layer.style.backgroundImage = `url(${imageUrl})`;

        // Offset each layer upwards
        layer.style.transform = `translateZ(${i}px) translateY(-${i}px)`;

        // Lighting: Darken lower layers to simulate depth/ambient occlusion
        if (i < layers - 1) {
            const brightness = 60 + (i / layers) * 40;
            layer.style.filter = `brightness(${brightness}%)`;
        } else {
            // Top layer is full brightness + a slight glow
            layer.style.filter = 'brightness(110%) saturate(1.2)';
        }

        container.appendChild(layer);
    }
}

function getBotSprite(name) {
    // We now use the modern sphere bot for all bots in the Corporate redesign
    return '/assets/pixel_art/sphere_bot_walk.png';
}

function getBotAvatar(name) {
    const avatars = ['🤖', '🐱', '🐶', '🦊', '🦁', '🦖', '🐼', '🐨', '👾', '👻'];
    // Simple hash to keep same avatar for same name
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatars[Math.abs(hash) % avatars.length];
}

function formatTime(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatNextRun(timestamp) {
    if (!timestamp) return 'IDLE';
    const diff = timestamp - Date.now();
    if (diff <= 0) return 'DUE NOW';

    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}m ${secs}s`;
}

// Update countdowns every second
setInterval(() => {
    document.querySelectorAll('.countdown').forEach(el => {
        const time = el.getAttribute('data-time');
        if (time) {
            el.textContent = formatNextRun(parseInt(time));
        }
    });
}, 1000);

async function handleCommand(botName, action, isReset = false) {
    if (isReset) action = 'RESET';

    const safeId = botName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const intervalSelect = document.getElementById(`interval-${safeId}`);
    const interval = intervalSelect ? parseInt(intervalSelect.value) : 15;

    // Get admin token for authentication
    let token = localStorage.getItem('vibe_admin_token');
    if (!token) token = 'vibe_secret_token_12345';

    const card = document.getElementById(`cmd-card-${safeId}`);
    const btn = card ? card.querySelector(`.btn-card.${action.toLowerCase()}`) : null;

    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.dataset.oldText = btn.innerText;
        btn.innerHTML = '⌛...';
    }

    try {
        const res = await fetch('/api/bots/command', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ bot_name: botName, action, interval })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            addConsoleLog(`✅ Command ${action} queued for ${botName}`);

            // Trigger zero-delay sync via extension bridge (if installed)
            window.postMessage({ type: 'CHOB_DASHBOARD_COMMAND', action, botName }, '*');

            // Set optimistic state
            pendingCommands[safeId] = action === 'START' ? 'STARTING...' : (action === 'STOP' ? 'STOPPING...' : 'SYNCING...');
            renderOffice(); // Re-render immediately to show optimistic state

            // Clear optimistic state after 45 seconds (enough time for heartbeat)
            setTimeout(() => {
                delete pendingCommands[safeId];
                renderOffice();
            }, 45000);

            // Rapid polling for 10 seconds to catch the change
            let count = 0;
            const fastPoll = setInterval(() => {
                fetchBots();
                if (++count > 10) clearInterval(fastPoll);
            }, 1000);
        } else {
            const errorMsg = (res.status === 401) ? 'Unauthorized (Please login at /admin.html)' : (data.error || 'Unknown error');
            addConsoleLog(`❌ Command failed: ${errorMsg}`);
            if (res.status === 401) {
                alert('⚠️ เซสชั่นหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาไปหน้า /admin.html เพื่อ Login ก่อนใช้งานปุ่มควบคุม');
            }
        }
    } catch (err) {
        addConsoleLog(`❌ Network error: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.innerText = btn.dataset.oldText || action;
        }
    }
}

async function deleteBot(botName) {
    if (!confirm(`Are you sure you want to delete "${botName}"? This cannot be undone.`)) return;

    try {
        let token = localStorage.getItem('vibe_admin_token');
        if (!token) token = 'vibe_secret_token_12345'; // Fallback

        const res = await fetch('/api/bots', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ bot_name: botName })
        });

        const data = await res.json();
        if (data.success) {
            addConsoleLog(`🗑️ Bot "${botName}" removed from office!`);
            fetchBots();
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        alert('Delete failed: ' + err.message);
    }
}

function addConsoleLog(msg) {
    const consoleLog = document.getElementById('consoleLog');
    const time = new Date().toLocaleTimeString('th-TH', { hour12: false });
    const line = document.createElement('div');
    line.textContent = `[${time}] ${msg}`;
    consoleLog.appendChild(line);
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

function startPolling() {
    setInterval(fetchBots, 5000);    // Was 2000ms - reduced DB pressure
    setInterval(fetchHistory, 10000); // Was 3000ms - history changes slowly
}

async function handleAllBots(action) {
    if (!confirm(`Are you sure you want to ${action} ALL bots?`)) return;
    addConsoleLog(`🌐 Global: Triggering ${action} for all bots...`);

    for (const bot of bots) {
        await handleCommand(bot.bot_name, action);
    }
}

function getPingClass(ping) {
    if (!ping || ping === 0) return 'gray';
    if (ping < 300) return 'green';
    if (ping < 1000) return 'yellow';
    return 'red';
}
