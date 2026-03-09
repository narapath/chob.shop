const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Puppeteer to Restart Node.js App on DirectAdmin...");
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    try {
        console.log("1. Navigating to login...");
        await page.goto('https://chob.shop:2222/evo/', { waitUntil: 'networkidle2' });

        console.log("2. Entering credentials...");
        const inputs = await page.$$('input');
        if (inputs.length >= 2) {
            await inputs[0].type('nanoha49');
            await inputs[1].type('zO0BGoQTB7Jv');
        } else {
            await page.type('input[type="text"]', 'nanoha49');
            await page.type('input[type="password"]', 'zO0BGoQTB7Jv');
        }
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
            page.keyboard.press('Enter')
        ]);
        console.log("Login successful!");

        console.log("3. Navigating to Node.js App module...");
        await page.goto('https://chob.shop:2222/CMD_PLUGINS/nodejs_selector/', { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 4000));

        console.log("4. Entering Edit mode for chob.shop...");
        await page.evaluate(() => {
            const btn = document.querySelector('.lvemanager-icon-edit');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 6000));

        console.log("5. Stopping Application...");
        await page.evaluate(() => {
            const stopBtn = document.querySelector('#stopAppButton');
            if (stopBtn) stopBtn.click();
        });
        console.log("Waiting 10 seconds for app to stop...");
        await new Promise(r => setTimeout(r, 10000));

        console.log("6. Starting Application...");
        await page.evaluate(() => {
            const startBtn = document.querySelector('#startAppButton') || document.querySelector('#restartAppButton');
            if (startBtn) startBtn.click();
        });

        console.log("Waiting 5 seconds for app to start...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("✅ Restart successful!");

    } catch (e) {
        console.error("An error occurred during restart automation:", e);
    } finally {
        await browser.close();
    }
})();
