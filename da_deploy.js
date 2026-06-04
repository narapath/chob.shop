const puppeteer = require('puppeteer');

(async () => {
    console.log("Starting Puppeteer to Deploy & Restart on DirectAdmin...");
    const browser = await puppeteer.launch({
        headless: 'new',
        defaultViewport: { width: 1440, height: 900 },
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        timeout: 60000
    });
    const page = await browser.newPage();

    try {
        // Step 1: Login to DirectAdmin
        console.log("1. Navigating to login...");
        await page.goto('https://chob.shop:2222/evo/', { waitUntil: 'networkidle2', timeout: 30000 });

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

        // Step 2: Navigate to Terminal (if available) or Node.js App
        console.log("3. Navigating to Node.js App module...");
        await page.goto('https://chob.shop:2222/CMD_PLUGINS/nodejs_selector/', { waitUntil: 'networkidle0', timeout: 30000 });
        await new Promise(r => setTimeout(r, 4000));

        // Step 3: Enter Edit mode
        console.log("4. Entering Edit mode for chob.shop...");
        await page.evaluate(() => {
            const btn = document.querySelector('.lvemanager-icon-edit');
            if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 6000));

        // Step 4: Run NPM script or use Run JS to execute git pull
        // Try to find and use the "Run Script" or terminal function
        console.log("5. Looking for Run Script button...");

        // Check if there's a "Run Script" input and button
        const hasRunScript = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"]');
            for (const input of inputs) {
                if (input.placeholder && input.placeholder.toLowerCase().includes('script')) {
                    return true;
                }
            }
            return false;
        });

        if (hasRunScript) {
            console.log("  Found Run Script field, entering 'git pull'...");
            await page.evaluate(() => {
                const inputs = document.querySelectorAll('input[type="text"]');
                for (const input of inputs) {
                    if (input.placeholder && input.placeholder.toLowerCase().includes('script')) {
                        input.value = '';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                }
            });
        }

        // Step 5: Stop Application
        console.log("6. Stopping Application...");
        await page.evaluate(() => {
            const stopBtn = document.querySelector('#stopAppButton');
            if (stopBtn) stopBtn.click();
        });
        console.log("Waiting 10 seconds for app to stop...");
        await new Promise(r => setTimeout(r, 10000));

        // Step 6: Start Application  
        console.log("7. Starting Application...");
        await page.evaluate(() => {
            const startBtn = document.querySelector('#startAppButton') || document.querySelector('#restartAppButton');
            if (startBtn) startBtn.click();
        });

        console.log("Waiting 5 seconds for app to start...");
        await new Promise(r => setTimeout(r, 5000));

        console.log("✅ Restart successful!");

    } catch (e) {
        console.error("An error occurred:", e.message);
    } finally {
        await browser.close();
    }
})();
