const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function checkCount() {
    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true });
    
    if (error) {
        console.error('Error fetching count:', error);
    } else {
        console.log('Total products in database:', count);
    }
}

checkCount();
