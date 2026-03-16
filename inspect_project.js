const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function inspectProject() {
    console.log('--- Inspecting Supabase Project ---');
    console.log('Project URL:', process.env.SUPABASE_URL);

    // Get all tables and columns from information_schema
    // Since we usually can't query information_schema directly via PostgREST without an RPC,
    // we'll try to guess if there's any other schema or table.
    
    // Attempt to fetch from products via a known valid column to get the full record
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);
    
    if (error) {
        console.log('❌ Error fetching from products:', error.message);
    } else if (data && data.length > 0) {
        console.log('✅ Found "products" table.');
        console.log('Available columns in record:', Object.keys(data[0]));
        
        // Check for specific columns
        const missing = ['ratingValue', 'reviewCount'].filter(c => !Object.keys(data[0]).includes(c));
        if (missing.length > 0) {
            console.log('❌ Missing columns in data:', missing);
        } else {
            console.log('✅ Both ratingValue and reviewCount ARE present in the record!');
        }
    } else {
        console.log('Empty "products" table.');
    }
}

inspectProject();
