/**
 * Google Indexing API Service for Chob.Shop
 * 
 * ใช้สำหรับบอก Google ให้มา crawl URL ใหม่ทันที
 * เมื่อเพิ่มสินค้าใหม่เข้า database
 * 
 * Required Setup:
 * 1. เปิด Indexing API ใน Google Cloud Console
 * 2. สร้าง Service Account → ดาวน์โหลด JSON Key
 * 3. เพิ่ม Service Account email เป็น Owner ใน Google Search Console
 * 4. ตั้ง GOOGLE_SERVICE_ACCOUNT_JSON ใน .env
 */

const { google } = require('googleapis');

// --- Configuration ---
let indexingClient = null;
let isConfigured = false;

/**
 * Initialize the Google Indexing API client
 * Called once at startup — if credentials are missing, 
 * the service operates in "skip" mode gracefully.
 */
function initIndexingClient() {
  try {
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    
    if (!credentialsJson) {
      console.log('⚠️  Google Indexing API: ไม่พบ GOOGLE_SERVICE_ACCOUNT_JSON — ระบบจะข้ามการ Index อัตโนมัติ');
      return;
    }

    const credentials = JSON.parse(credentialsJson);
    
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });

    indexingClient = google.indexing({ version: 'v3', auth });
    isConfigured = true;
    console.log('✅  Google Indexing API: เชื่อมต่อสำเร็จ — URL ใหม่จะถูกส่งให้ Google อัตโนมัติ');
  } catch (err) {
    console.error('❌  Google Indexing API: ตั้งค่าไม่สำเร็จ —', err.message);
    isConfigured = false;
  }
}

/**
 * Notify Google to index/update a single URL
 * @param {string} url - The full URL to submit (e.g. https://chob.shop/?productId=abc123)
 * @param {string} type - 'URL_UPDATED' (new/updated) or 'URL_DELETED'
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function notifyGoogleIndexing(url, type = 'URL_UPDATED') {
  if (!isConfigured || !indexingClient) {
    return { success: true, message: 'Indexing API ยังไม่ได้ตั้งค่า — ข้ามไป', skipped: true };
  }

  try {
    const response = await indexingClient.urlNotifications.publish({
      requestBody: {
        url: url,
        type: type,
      },
    });

    console.log(`🔔 Google Indexing: ส่ง ${type} สำหรับ ${url} — Status: ${response.status}`);
    return { 
      success: true, 
      message: `ส่ง URL ให้ Google สำเร็จ`,
      status: response.status,
      data: response.data 
    };
  } catch (err) {
    console.error(`❌ Google Indexing Error for ${url}:`, err.message);
    return { 
      success: false, 
      message: `ส่ง URL ไม่สำเร็จ: ${err.message}`,
      error: err.message 
    };
  }
}

/**
 * Notify Google to index multiple URLs (with rate limiting)
 * Google Indexing API allows ~200 requests per day
 * @param {string[]} urls - Array of URLs to submit
 * @returns {Promise<{success: boolean, results: object}>}
 */
async function notifyBulkIndexing(urls) {
  if (!isConfigured || !indexingClient) {
    return { 
      success: true, 
      message: `Indexing API ยังไม่ได้ตั้งค่า — ข้าม ${urls.length} URLs`, 
      skipped: true,
      results: { submitted: 0, failed: 0, skipped: urls.length }
    };
  }

  const results = { submitted: 0, failed: 0, errors: [] };

  for (const url of urls) {
    try {
      await indexingClient.urlNotifications.publish({
        requestBody: {
          url: url,
          type: 'URL_UPDATED',
        },
      });
      results.submitted++;
      console.log(`🔔 Google Indexing: ส่งสำเร็จ — ${url}`);
    } catch (err) {
      results.failed++;
      results.errors.push({ url, error: err.message });
      console.error(`❌ Google Indexing: ส่งไม่สำเร็จ — ${url}: ${err.message}`);
    }

    // Rate limit: 100ms delay between requests
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`🔔 Google Indexing Bulk: ส่งสำเร็จ ${results.submitted}/${urls.length}, ล้มเหลว ${results.failed}`);
  return { success: true, results };
}

/**
 * Get the status of a URL in Google's index
 * @param {string} url - URL to check
 * @returns {Promise<object>}
 */
async function getIndexingStatus(url) {
  if (!isConfigured || !indexingClient) {
    return { success: false, message: 'Indexing API ยังไม่ได้ตั้งค่า' };
  }

  try {
    const response = await indexingClient.urlNotifications.getMetadata({
      url: url,
    });
    return { success: true, data: response.data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Initialize on module load
initIndexingClient();

module.exports = {
  notifyGoogleIndexing,
  notifyBulkIndexing,
  getIndexingStatus,
  initIndexingClient,
  isConfigured: () => isConfigured,
};
