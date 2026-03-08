/**
 * Threads API OAuth Setup Helper
 * 
 * This script helps you get Threads API credentials:
 * 1. Opens a local server to capture the OAuth callback
 * 2. Opens your browser to authorize the Threads app
 * 3. Automatically exchanges the code for an access token
 * 4. Saves the credentials to .env
 * 
 * Usage: node threads_setup.js
 */

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const THREADS_APP_ID = '1783174216420956';
const THREADS_APP_SECRET = '78f2410670002b8848cb7af6782a7eb4';
const REDIRECT_URI = 'http://localhost:3001/callback';
const PORT = 3001;

if (!THREADS_APP_ID || !THREADS_APP_SECRET) {
    console.error('❌ Missing FB_APP_ID or FB_APP_SECRET in .env');
    process.exit(1);
}

const app = express();

// Step 1: Home page with instructions
app.get('/', (req, res) => {
    const authUrl = `https://threads.net/oauth/authorize?client_id=${THREADS_APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=threads_basic,threads_content_publish&response_type=code`;

    res.send(`
        <html>
        <head><title>Threads API Setup - Chob.Shop</title></head>
        <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #0f0f1a; color: #f1f1f1;">
            <h1 style="color: #e94560;">🧵 Threads API Setup</h1>
            <p>คลิกปุ่มด้านล่างเพื่อ authorize Threads API</p>
            <a href="${authUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #e94560, #ff6b81); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; font-size: 16px;">
                🔗 เชื่อมต่อ Threads Account
            </a>
            <p style="margin-top: 20px; color: #888; font-size: 13px;">
                หมายเหตุ: ต้องเพิ่ม "Threads" product ใน Meta Developer Portal ก่อน<br>
                และตั้ง Redirect URI เป็น: <code style="color: #e94560;">${REDIRECT_URI}</code>
            </p>
            <hr style="border-color: #333; margin: 20px 0;">
            <h3>📋 ขั้นตอนก่อนกดปุ่ม:</h3>
            <ol style="line-height: 2;">
                <li>เปิด <a href="https://developers.facebook.com/apps/${THREADS_APP_ID}/settings/basic/" style="color: #e94560;" target="_blank">Meta Developer Portal</a></li>
                <li>ไปที่ Use Cases → Threads → Settings</li>
                <li>เพิ่ม Redirect URI: <code style="color: #e94560;">${REDIRECT_URI}</code></li>
                <li>กลับมากดปุ่ม "เชื่อมต่อ Threads Account" ด้านบน</li>
            </ol>
        </body>
        </html>
    `);
});

// Step 2: OAuth callback - exchange code for token
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;

    if (error) {
        res.send(`<html><body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; background: #0f0f1a; color: #f1f1f1; padding: 20px;">
            <h1 style="color: #e94560;">❌ Authorization Failed</h1>
            <p>Error: ${req.query.error_description || error}</p>
            <a href="/" style="color: #e94560;">ลองใหม่</a>
        </body></html>`);
        return;
    }

    if (!code) {
        res.send('<h1>❌ No code received</h1>');
        return;
    }

    console.log(`\n📥 Received authorization code: ${code.substring(0, 20)}...`);

    try {
        // Exchange code for short-lived token
        console.log('🔄 Exchanging code for access token...');
        const tokenRes = await axios.post('https://graph.threads.net/oauth/access_token', null, {
            params: {
                client_id: THREADS_APP_ID,
                client_secret: THREADS_APP_SECRET,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI,
                code: code
            }
        });

        const shortLivedToken = tokenRes.data.access_token;
        const userId = tokenRes.data.user_id;

        console.log(`✅ Got short-lived token for user: ${userId}`);

        // Exchange for long-lived token (60 days)
        console.log('🔄 Exchanging for long-lived token...');
        let longLivedToken = shortLivedToken;
        try {
            const longRes = await axios.get('https://graph.threads.net/access_token', {
                params: {
                    grant_type: 'th_exchange_token',
                    client_secret: THREADS_APP_SECRET,
                    access_token: shortLivedToken
                }
            });
            longLivedToken = longRes.data.access_token;
            console.log(`✅ Got long-lived token (valid for ~60 days)`);
        } catch (e) {
            console.log(`⚠️ Could not get long-lived token, using short-lived: ${e.message}`);
        }

        // Save to .env
        const envPath = path.join(__dirname, '.env');
        let envContent = fs.readFileSync(envPath, 'utf-8');

        // Update THREADS_USER_ID
        if (envContent.match(/^THREADS_USER_ID=.*$/m)) {
            envContent = envContent.replace(/^THREADS_USER_ID=.*$/m, `THREADS_USER_ID=${userId}`);
        } else {
            envContent += `\nTHREADS_USER_ID=${userId}`;
        }

        // Update THREADS_ACCESS_TOKEN
        if (envContent.match(/^THREADS_ACCESS_TOKEN=.*$/m)) {
            envContent = envContent.replace(/^THREADS_ACCESS_TOKEN=.*$/m, `THREADS_ACCESS_TOKEN=${longLivedToken}`);
        } else {
            envContent += `\nTHREADS_ACCESS_TOKEN=${longLivedToken}`;
        }

        fs.writeFileSync(envPath, envContent, 'utf-8');

        // Also update the running server via API
        try {
            await axios.put('http://localhost:3000/api/settings', {
                THREADS_USER_ID: userId.toString(),
                THREADS_ACCESS_TOKEN: longLivedToken
            }, {
                headers: {
                    Authorization: 'Bearer vibe_secret_token_12345',
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ Updated running server settings (hot-reload)');
        } catch (e) {
            console.log('⚠️ Could not update running server, restart may be needed');
        }

        console.log('\n🎉 === THREADS API SETUP COMPLETE ===');
        console.log(`   User ID: ${userId}`);
        console.log(`   Token: ${longLivedToken.substring(0, 20)}...`);
        console.log('   Saved to .env ✅');
        console.log('   Hot-reloaded to server ✅');

        res.send(`
            <html>
            <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; background: #0f0f1a; color: #f1f1f1; padding: 20px;">
                <h1 style="color: #00c853;">🎉 Threads API Setup สำเร็จ!</h1>
                <div style="background: #1a1a2e; padding: 20px; border-radius: 12px; margin: 20px 0;">
                    <p><strong>Threads User ID:</strong> <code style="color: #e94560;">${userId}</code></p>
                    <p><strong>Access Token:</strong> <code style="color: #e94560;">${longLivedToken.substring(0, 30)}...</code></p>
                    <p style="color: #00c853; font-weight: bold;">✅ บันทึกลง .env และอัปเดต server เรียบร้อย!</p>
                </div>
                <p>คุณสามารถปิดหน้านี้และกลับไปใช้ Admin Panel ได้เลย</p>
                <a href="http://localhost:3000/admin.html" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #e94560, #ff6b81); color: white; text-decoration: none; border-radius: 10px; font-weight: bold;">
                    ← กลับ Admin Panel
                </a>
            </body>
            </html>
        `);

        // Close this setup server after 30 seconds
        setTimeout(() => {
            console.log('\n👋 Threads setup server shutting down...');
            process.exit(0);
        }, 30000);

    } catch (err) {
        const errorMsg = err.response?.data?.error_message || err.message;
        console.error(`❌ Token exchange failed: ${errorMsg}`);
        console.error('Full error:', err.response?.data || err.message);

        res.send(`
            <html>
            <body style="font-family: sans-serif; max-width: 600px; margin: 50px auto; background: #0f0f1a; color: #f1f1f1; padding: 20px;">
                <h1 style="color: #e94560;">❌ Token Exchange Failed</h1>
                <p style="color: #ff6b81;">${errorMsg}</p>
                <pre style="background: #1a1a2e; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px;">${JSON.stringify(err.response?.data || err.message, null, 2)}</pre>
                <a href="/" style="color: #e94560;">ลองใหม่</a>
            </body>
            </html>
        `);
    }
});

// Start
app.listen(PORT, () => {
    const setupUrl = `http://localhost:${PORT}`;
    console.log(`\n🧵 Threads Setup Server running at ${setupUrl}`);
    console.log('   Opening in your browser...\n');

    // Open in default browser (Windows)
    exec(`start ${setupUrl}`);
});
