window.addEventListener('message', (event) => {
    // Only accept messages from the same window
    if (event.source !== window) return;

    if (event.data && event.data.type === 'CHOB_DASHBOARD_COMMAND') {
        console.log('📡 [Bridge] Forwarding command to background:', event.data.action);
        chrome.runtime.sendMessage({
            action: 'FORCE_HEARTBEAT',
            bot_name: event.data.botName,
            isLite: true
        });
    }
});

console.log('🚀 [ChobShop Bridge] Dashboard link active.');
