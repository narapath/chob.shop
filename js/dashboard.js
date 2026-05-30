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
            bots = data.bots;
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

    // Cache user selections to not lose them on re-render (every 2s)
    if (!window.userSelectionCache) window.userSelectionCache = {};

    office.innerHTML = ''; // Clear

    bots.forEach(bot => {
        const isOffline = (Date.now() - new Date(bot.last_heartbeat).getTime()) > 120000; // > 2 mins
        const cardClass = isOffline ? 'offline' : (bot.status === 'active' ? 'active' : 'idle');
        const statusText = isOffline ? 'OFFLINE' : (bot.status === 'active' ? 'WORKING' : 'ZzZ_IDLE');

        // Restore interval from cache if exists, otherwise from bot stats
        const currentInterval = window.userSelectionCache[bot.bot_name] !== undefined
            ? window.userSelectionCache[bot.bot_name]
            : (bot.stats.interval || 15);

        // Pick an avatar based on bot name or random
        const avatar = getBotAvatar(bot.bot_name);

        const card = document.createElement('div');
        card.className = `bot-card ${cardClass}`;

        const nextRunTime = bot.stats.next_run;
        const nextRunDisplay = bot.stats.isPosting ? 'POSTING...' : formatNextRun(nextRunTime);

        card.innerHTML = `
            <button class="delete-bot-btn" onclick="deleteBot('${bot.bot_name}')" title="Delete Bot">🗑️</button>
            <div class="bot-avatar">${avatar}</div>
            <div class="bot-name">${bot.bot_name}</div>
            <div class="bot-status-tag">${statusText}</div>
            <div class="bot-stats-list">
                <div class="stat-row">
                    <span class="label">POSTS:</span>
                    <span class="val">${bot.stats.postCount || 0}</span>
                </div>
                <div class="stat-row">
                    <span class="label">NEXT RUN:</span>
                    <span class="val countdown" data-time="${nextRunTime || ''}">${nextRunDisplay}</span>
                </div>
                <div class="stat-row">
                    <span class="label">LAST:</span>
                    <span class="val">${formatTime(bot.last_heartbeat)}</span>
                </div>
                <div class="stat-row">
                    <span class="label">VER:</span>
                    <span class="val">${bot.version || '1.0'}</span>
                </div>
            </div>
            <div class="bot-controls">
                <div class="control-group">
                    <select class="interval-select" id="interval-${bot.bot_name}" onchange="window.userSelectionCache['${bot.bot_name}'] = this.value">
                        <option value="5" ${currentInterval == 5 ? 'selected' : ''}>5 min</option>
                        <option value="10" ${currentInterval == 10 ? 'selected' : ''}>10 min</option>
                        <option value="15" ${currentInterval == 15 ? 'selected' : ''}>15 min</option>
                        <option value="30" ${currentInterval == 30 ? 'selected' : ''}>30 min</option>
                        <option value="60" ${currentInterval == 60 ? 'selected' : ''}>60 min</option>
                        <option value="120" ${currentInterval == 120 ? 'selected' : ''}>120 min</option>
                    </select>
                    <button class="ctrl-btn apply" onclick="handleCommand('${bot.bot_name}', 'SET_INTERVAL')">⚙️</button>
                </div>
                <div class="control-actions">
                    ${bot.status === 'active'
                ? `<button class="ctrl-btn stop" onclick="handleCommand('${bot.bot_name}', 'STOP')">STOP</button>`
                : `<button class="ctrl-btn start" onclick="handleCommand('${bot.bot_name}', 'START')">START</button>`
            }
                </div>
            </div>
        `;

        office.appendChild(card);
    });

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
        }
    } catch (err) {
        console.error('Fetch logs error:', err);
    }
}

function renderLogs(logs) {
    const list = document.getElementById('workHistory');
    if (!logs || logs.length === 0) {
        list.innerHTML = '<div class="loading-pixel">NO RECENT HISTORY...</div>';
        return;
    }

    list.innerHTML = '';
    logs.forEach(log => {
        const row = document.createElement('div');
        row.className = `history-item ${log.status.toLowerCase()}`;

        const time = new Date(log.created_at).toLocaleTimeString('th-TH');

        row.innerHTML = `
            <span class="history-time">[${time}]</span>
            <span class="history-bot">${log.bot_name}</span>
            <span class="history-action">${log.action}</span>
            <span class="history-msg">${log.message}</span>
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

    addConsoleLog(`🕹️ Sending ${action} to ${botName}...`);

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
            // Refresh quickly
            setTimeout(fetchBots, 1000);
        } else {
            const errorMsg = (res.status === 401) ? 'Unauthorized (Please login at /admin.html)' : (data.error || 'Unknown error');
            addConsoleLog(`❌ Command failed: ${errorMsg}`);
            if (res.status === 401) {
                alert('⚠️ เซสชั่นหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาไปหน้า /admin.html เพื่อ Login ก่อนใช้งานปุ่มควบคุม');
            }
        }
    } catch (err) {
        addConsoleLog(`❌ Network error: ${err.message}`);
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
    // Second-by-second feel (2 seconds polling)
    setInterval(fetchBots, 2000);
    setInterval(fetchLogs, 2000);
}
