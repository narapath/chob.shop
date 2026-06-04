const { supabaseAdmin } = require('./lib/supabase');

async function checkIndex() {
    console.log('Checking indices for extension_bots...');
    try {
        const { data, error } = await supabaseAdmin.rpc('inspect_table_indices', { table_name: 'extension_bots' });
        if (error) {
            // Fallback to direct query if RPC doesn't exist
            console.log('RPC inspect_table_indices not found, trying raw query...');
            const { data: data2, error: error2 } = await supabaseAdmin.from('extension_bots').select('bot_name').limit(1);
            if (error2) {
                console.error('❌ Table access error:', error2);
            } else {
                console.log('✅ Table is accessible.');
            }
        } else {
            console.log('✅ Indices:', data);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    }
}

checkIndex();
