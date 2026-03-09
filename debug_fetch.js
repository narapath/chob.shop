const url = 'https://zcplipytalprkniwxurs.supabase.co/rest/v1/products?select=*';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2FzZSIsInJlZiI6InpjcGxpcHl0YWxwcmtuaXd4dXJzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODc2NjMsImV4cCI6MjA4ODU2MzY2M30.P2leswWIjMGkxpobp-9aUbYlvRxBcWIDJGPciDF6mF4';

fetch(url, {
    method: 'GET',
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
}).then(async res => {
    console.log('Status:', res.status);
    console.log('Status Text:', res.statusText);
    const text = await res.text();
    console.log('Response Body:', text);
}).catch(err => {
    console.error('Fetch Error:', err);
});
