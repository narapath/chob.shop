const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkActualSchema() {
    console.log('--- Querying information_schema.columns ---');
    
    // Attempt to query the information_schema directly via the RPC if available, 
    // or just a raw SQL query if we had access. 
    // Since we don't have direct SQL access through the client usually without an RPC,
    // we'll try to select columns explicitly to see which ones fail.

    const columns = ['ratingValue', 'reviewCount', 'seo_keywords', 'seo_title', 'commission'];
    
    for (const col of columns) {
        const { error } = await supabase
            .from('products')
            .select(col)
            .limit(1);
        
        if (error) {
            console.log(`❌ Column "${col}" error:`, error.message);
        } else {
            console.log(`✅ Column "${col}" is ACCESSIBLE.`);
        }
    }
}

checkActualSchema();
