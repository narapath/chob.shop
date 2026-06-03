// Dashboard logic for CHOB.SHOP BOT OFFICE
// Periodic polling every 5 seconds

let bots = [];
let lastFetchedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    startPolling();
    addConsoleLog('🚀 Chob.Shop Bot Dashboard started');
    addConsoleLog('📡 Connecting to system office...');

    // Initial fetch
    fetchBots();
    fetchLogs();
});

async function fetchBots() {
    try {
        const response = await fetch('/api/bots');
        const data = await response.json();

        if (data.success) {
            // Sort bots by name (Bot 1, Bot 2, Bot 3...)
            bots = data.bots.sort((a, b) => a.bot_name.localeCompare(b.bot_name, undefined, { numeric: true, sensitivity: 'base' }));
            renderOffice();
            updateGlobalStats();
        }
    } catch (err) {
        console.error('Fetch bots error:', err);
        addConsoleLog('❌ Error connecting to API: ' + err.message);
    }
}

function renderOffice() {
    const office = document.getElementById('botOffice');

    if (bots.length === 0) {
        office.innerHTML = '<div class="loading-pixel">NO BOTS ONLINE...</div>';
        return;
    }

    // Cache user selections to not lose them
    if (!window.userSelectionCache) window.userSelectionCache = {};

    // Remove "NO BOTS ONLINE" if it exists
    if (office.querySelector('.loading-pixel')) office.innerHTML = '';

    bots.forEach(bot => {
        const safeId = bot.bot_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
        const isOffline = (Date.now() - new Date(bot.last_heartbeat).getTime()) > 120000;
        const isPosting = bot.stats.isPosting || bot.status === 'POSTING';
        const cardClass = isOffline ? 'offline' : (isPosting ? 'posting' : (bot.status === 'ACTIVE' ? 'active' : 'idle'));

        let statusText = isOffline ? 'OFFLINE' : (bot.status || 'IDLE');
        if (isPosting) statusText = '⚡ POSTING...';
        else if (bot.status === 'ACTIVE') statusText = '📡 ACTIVE';
        else if (bot.status === 'IDLE') statusText = '💤 IDLE';

        const currentActivity = bot.stats.activity || '';

        const avatar = getBotAvatar(bot.bot_name);
        const nextRunTime = bot.stats.next_run;
        const nextRunDisplay = isPosting ? 'BUSY' : formatNextRun(nextRunTime);

        let card = document.getElementById(`bot-card-${safeId}`);

        if (!card) {
            card = document.createElement('div');
            card.id = `bot-card-${safeId}`;
            office.appendChild(card);
        }
        card.className = `bot-card ${cardClass}`;

        const currentInterval = window.userSelectionCache[bot.bot_name] !== undefined
            ? window.userSelectionCache[bot.bot_name]
            : (bot.stats.interval || 15);

        // Surgical Update Logic
        card.innerHTML = `
                <button class="delete-bot-btn" onclick="deleteBot('${bot.bot_name}')" title="Delete Bot">🗑️</button>
                <div class="bot-avatar">${avatar}</div>
                <div class="bot-name">${bot.bot_name}</div>
                <div class="bot-status-tag">${statusText}</div>
                
                ${currentActivity ? `<div style="text-align:center; font-size: 10px; color: var(--accent-blue); margin-bottom: 10px; font-weight:bold;">${currentActivity}</div>` : ''}

                <div class="bot-ping-indicator">
                    <span class="ping-dot ${getPingClass(bot.stats.ping)}"></span>
                    <span class="ping-val">${bot.stats.ping || 0} ms</span>
                </div>
                <div class="bot-stats-list">
                    <div class="stat-row">
                        <span class="label">POSTS</span>
                        <span class="val" id="posts-${safeId}">${bot.stats.postCount || 0}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">NEXT RUN</span>
                        <span class="val countdown" id="next-${safeId}" data-time="${nextRunTime || ''}">${nextRunDisplay}</span>
                    </div>
                    <div class="stat-row">
                        <span class="label">LAST HB</span>
                        <span class="val">${formatTime(bot.last_heartbeat)}</span>
                    </div>
                </div>
                <div class="bot-controls">
                    <div class="control-group">
                        <select class="interval-select" id="interval-${safeId}" onchange="window.userSelectionCache['${bot.bot_name}'] = this.value">
                            <option value="5" ${currentInterval == 5 ? 'selected' : ''}>5 min</option>
                            <option value="10" ${currentInterval == 10 ? 'selected' : ''}>10 min</option>
                            <option value="15" ${currentInterval == 15 ? 'selected' : ''}>15 min</option>
                            <option value="30" ${currentInterval == 30 ? 'selected' : ''}>30 min</option>
                            <option value="60" ${currentInterval == 60 ? 'selected' : ''}>60 min</option>
                        </select>
                        <button class="ctrl-btn apply" onclick="handleCommand('${bot.bot_name}', 'SET_INTERVAL')" id="btn-apply-${safeId}">⚙️</button>
                    </div>
                    <div class="control-actions" style="display:flex; gap:8px;">
                        ${bot.status === 'ACTIVE' || isPosting
                ? `<button class="ctrl-btn stop" onclick="handleCommand('${bot.bot_name}', 'STOP')" id="btn-stop-${safeId}">STOP</button>`
                : `<button class="ctrl-btn start" onclick="handleCommand('${bot.bot_name}', 'START')" id="btn-start-${safeId}">START</button>`
            }
                    </div>
                </div>
            `;

        // Restore focus if we were interacting
        if (isInteracting && activeEl.id) {
            const newEl = document.getElementById(activeEl.id);
            if (newEl) newEl.focus();
        }
    });

    // Remove cards for bots that are no longer in the list
    const currentSafeIds = bots.map(b => b.bot_name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, ''));
    Array.from(office.querySelectorAll('.bot-card')).forEach(card => {
        const cardId = card.id.replace('bot-card-', '');
        if (!currentSafeIds.includes(cardId)) {
            office.removeChild(card);
        }
    });

    // Handle initial sorting on the DOM if needed (they are appended in order of the sorted 'bots' array)

    // Logging changes
    if (bots.length !== lastFetchedCount) {
        const diff = bots.length - lastFetchedCount;
        if (diff > 0) addConsoleLog(`✨ ${diff} new bot(s) appeared in the office!`);
        lastFetchedCount = bots.length;
    }
}

function updateGlobalStats() {
    const activeCount = bots.filter(b => (Date.now() - new Date(b.last_heartbeat).getTime()) < 120000).length;
    const totalPosts = bots.reduce((acc, bot) => acc + (bot.stats.postCount || 0), 0);

    document.getElementById('activeCount').textContent = activeCount;
    document.getElementById('totalPosts').textContent = totalPosts;
}

async function fetchLogs() {
    try {
        const response = await fetch('/api/bots/logs?limit=15');
        const data = await response.json();

        if (data.success) {
            renderLogs(data.logs);
        } else {
            console.error('API Error:', data.error);
            const list = document.getElementById('workHistory');
            list.innerHTML = `<div class="history-empty">⚠️ LOGS UNAVAILABLE: ${data.error || 'Unknown Error'}</div>`;
        }
    } catch (err) {
        console.error('Fetch logs error:', err);
        const list = document.getElementById('workHistory');
        list.innerHTML = '<div class="history-empty">⚠️ LOGS UNAVAILABLE</div>';
    }
}

function renderLogs(logs) {
    const list = document.getElementById('workHistory');
    if (!logs || logs.length === 0) {
        list.innerHTML = '<div class="history-empty">NO RECENT HISTORY...</div>';
        return;
    }

    list.innerHTML = '';
    logs.forEach(log => {
        const row = document.createElement('div');
        row.className = `history-item ${log.status.toLowerCase()}`;

        const time = new Date(log.created_at).toLocaleTimeString('th-TH');
        const details = typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {});

        let mediaHtml = '';
        if (details.image) {
            mediaHtml = `<div class="history-media"><img src="${details.image}" alt="Post Image" onclick="window.open('${details.image}', '_blank')"></div>`;
        }

        const linkHtml = details.link ? `
            <a href="${details.link}" target="_blank" class="history-link" title="Open Facebook Post">
                🔗 VIEW POST
            </a>
        ` : '';

        row.innerHTML = `
            ${mediaHtml}
            <div style="display:flex; flex-direction:column; gap:4px; flex:1;">
                <div style="display:flex; gap:10px; align-items:center;">
                    <span class="history-time">[${time}]</span>
                    <span class="history-bot">${log.bot_name}</span>
                    <span class="history-action">${log.action}</span>
                </div>
                <span class="history-msg">${log.message}</span>
            </div>
            ${linkHtml}
        `;
        list.appendChild(row);
    });
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

async function handleCommand(botName, action) {
    const intervalSelect = document.getElementById(`interval-${botName}`);
    const interval = intervalSelect ? parseInt(intervalSelect.value) : 15;

    // Get admin token for authentication
    let token = localStorage.getItem('vibe_admin_token');

    // Fallback to default community token if not found (helps if user bypassed admin login)
    if (!token) {
        console.warn('⚠️ No admin token found in localStorage, using default fallback.');
        token = 'vibe_secret_token_12345';
    }

    const safeId = botName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const btn = document.querySelector(`#bot-card-${safeId} .ctrl-btn.${action.toLowerCase()}`) || document.getElementById(`btn-apply-${safeId}`);
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
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
            // Rapid polling for 5 seconds to catch the change
            let count = 0;
            const fastPoll = setInterval(() => {
                fetchBots();
                if (++count > 5) clearInterval(fastPoll);
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
    // True real-time feel (1 second polling)
    setInterval(fetchBots, 1000);
    setInterval(fetchLogs, 1000);
}

function getPingClass(ping) {
    if (!ping || ping === 0) return 'gray';
    if (ping < 300) return 'green';
    if (ping < 1000) return 'yellow';
    return 'red';
}
