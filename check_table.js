const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const supabase = createClient(url, key);

async function checkTables() {
    console.log('🔍 Listing tables to check for typos...');
    // This is a hacky way to get table names via PostgREST if permitted
    const { data, error } = await supabase.from('products').select('*').limit(0);
    if (error) {
        console.log('Error accessing "products":', error.message);
    } else {
        console.log('Successfully accessed "products" table.');
    }
}

checkTables();
