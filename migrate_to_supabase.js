const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ SUPABASE_URL and SUPABASE_KEY must be set in your .env file.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const backupFile = path.join(__dirname, 'products_backup.json');

async function migrate() {
    if (!fs.existsSync(backupFile)) {
        console.error(`❌ Backup file not found at ${backupFile}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
    console.log(`📦 Found ${data.length} products to migrate...`);

    // Transform data to ensure it matches the Supabase schema
    const itemsToAdd = data.map(p => ({
        id: p.id,
        title: p.title || 'Untitled',
        price: String(p.price || '0'),
        originalPrice: String(p.originalPrice || ''),
        discount: String(p.discount || ''),
        image: p.image || '',
        affiliateUrl: p.affiliateUrl || '',
        category: p.category || 'ทั่วไป',
        description: p.description || '',
        clicks: p.clicks || 0,
        date: p.date || p.createdAt || new Date().toISOString(),
        facebookPostId: p.fbPostId || null,
        twitterPostId: p.xPostId || null
    }));

    const { error } = await supabase.from('products').insert(itemsToAdd);

    if (error) {
        console.error("❌ Migration failed:", error.message);
        if (error.code === '23505') {
            console.log("💡 (Duplicate Key Error) - The data might have been migrated already.");
        }
    } else {
        console.log("✅ Successfully migrated all products to Supabase!");
    }
}

migrate();
