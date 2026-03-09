const url = 'https://zcplipytalprkniwxurs.supabase.co/rest/v1/products?select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2FzZSIsInJlZiI6InpjcGxpcHl0YWxwcmtuaXd4dXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc2NjMsImV4cCI6MjA4ODU2MzY2M30.P2leswWIjMGkxpobp-9aUbYlvRxBcWIDJGPciDF6mF4';

console.log('Key length:', key.length);
for (let i = 0; i < key.length; i++) {
    const code = key.charCodeAt(i);
    if (code < 32 || code > 126) {
        console.log(`Hidden char at index ${i}: code ${code}`);
    }
}

fetch(url, {
    method: 'GET',
    headers: {
        'apikey': key
    }
}).then(async res => {
    console.log('Status (APIKEY ONLY):', res.status);
    const text = await res.text();
    console.log('Response:', text);
}).catch(console.error);
