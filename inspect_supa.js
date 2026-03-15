const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

async function inspectSchema() {
    console.log('🔍 Inspecting current columns in "products" table...');
    const { data, error } = await supabase.from('products').select('*').limit(1);
    
    if (error) {
        console.error('❌ Error fetching data:', error.message);
    } else if (data && data.length > 0) {
        console.log('✅ Found product. Column names are:');
        console.log(JSON.stringify(Object.keys(data[0]), null, 2));
    } else {
        console.log('❓ No products found in table to inspect.');
    }
}

inspectSchema();
