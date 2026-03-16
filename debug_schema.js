const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function debugSchema() {
    console.log('--- Supabase Schema Debug ---');
    
    // Try to fetch one row and see what keys we get back
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('Error fetching data:', error.message);
        if (error.message.includes('schema cache')) {
            console.log('CRITICAL: The API itself is reporting a schema cache error.');
        }
    } else if (data && data.length > 0) {
        console.log('Columns found in first record:', Object.keys(data[0]));
    } else {
        console.log('No data found in products table.');
        
        // Try a metadata query if possible (or just check the keys in the error if any)
    }

    // Try a direct insert of a dummy record with JUST rating_value to see the specific error
    console.log('\n--- Testing Insert of "rating_value" ---');
    const { error: insertError } = await supabase
        .from('products')
        .insert([{ 
            id: 'debug_' + Date.now(), 
            title: 'Debug Item',
            rating_value: 5,
            review_count: 10
        }]);
    
    if (insertError) {
        console.error('Insert Error Detail:', insertError);
    } else {
        console.log('✅ Success! The column ratingValue is working fine for the API.');
    }
}

debugSchema();
