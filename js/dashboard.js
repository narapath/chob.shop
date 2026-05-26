// Dashboard logic for CHOB.SHOP BOT OFFICE
// Periodic polling every 5 seconds

let bots = [];
let lastFetchedCount = 0;

document.addEventListener('DOMContentLoaded', () => {
    startPolling();
    addConsoleLog('🚀 Chob.Shop Bot Dashboard started');
    addConsoleLog('📡 Connecting to system office...');
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

    office.innerHTML = ''; // Clear

    bots.forEach(bot => {
        const isOffline = (Date.now() - new Date(bot.last_heartbeat).getTime()) > 120000; // > 2 mins
        const cardClass = isOffline ? 'offline' : (bot.status === 'active' ? 'active' : 'idle');
        const statusText = isOffline ? 'OFFLINE' : (bot.status === 'active' ? 'WORKING' : 'ZzZ_IDLE');

        // Pick an avatar based on bot name or random
        const avatar = getBotAvatar(bot.bot_name);

        const card = document.createElement('div');
        card.className = `bot-card ${cardClass}`;

        card.innerHTML = `
            <div class="bot-avatar">${avatar}</div>
            <div class="bot-name">${bot.bot_name}</div>
            <div class="bot-status-tag">${statusText}</div>
            <div class="bot-stats-list">
                <div class="stat-row">
                    <span class="label">POSTS:</span>
                    <span class="val">${bot.stats.postCount || 0}</span>
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
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
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
    fetchBots();
    setInterval(fetchBots, 5000);
}
