// Check chrome.storage.local content
chrome.storage.local.get(null, (res) => {
    console.log('--- ALL STORAGE ---');
    console.log(JSON.stringify(res, null, 2));
});
