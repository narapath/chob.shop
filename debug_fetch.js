const fetch = require('node-fetch');

async function debug() {
    console.log('--- API Debug ---');
    try {
        const res = await fetch('http://localhost:3000/api/bots/logs?limit=5');
        const data = await res.json();
        console.log('Status Code:', res.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch Error:', err.message);
    }
}

debug();
