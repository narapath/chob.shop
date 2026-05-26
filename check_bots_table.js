const { supabase } = require('./lib/supabase');

async function checkTable() {
    console.log('Checking extension_bots table...');
    try {
        const { data, error } = await supabase.from('extension_bots').select('count', { count: 'exact', head: true });
        if (error) {
            console.error('❌ Table error:', error.message);
            if (error.message.includes('not found')) {
                console.log('⚠️  Table "extension_bots" does not exist!');
            }
        } else {
            console.log('✅ Table "extension_bots" exists! Count:', data);
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

checkTable();
