const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function findColumns() {
    console.log('--- Searching for rating/review columns across ALL tables ---');
    
    // We can't query information_schema directly via PostgREST without an RPC. 
    // But we can try to guess table names or check if there's an RPC we can use.
    // Usually, users don't have an RPC for this, so we'll try to use the REST API 
    // to search for common table names.

    const tables = ['products', 'Products', 'PRODUCT', 'product_list'];
    for (const table of tables) {
        console.log(`\nChecking table: "${table}"`);
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);
        
        if (error) {
            console.log(`❌ Table "${table}" error:`, error.message);
        } else if (data && data.length > 0) {
            console.log(`✅ Table "${table}" found. Columns:`, Object.keys(data[0]));
        } else if (data) {
            console.log(`✅ Table "${table}" exists but is empty.`);
        }
    }
}

findColumns();
