const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
    console.log('--- Database Table Check ---');

    // Check extension_bots
    const { error: botsError } = await supabase.from('extension_bots').select('count', { count: 'exact', head: true });
    if (botsError) {
        console.log('❌ extension_bots table:', botsError.message);
    } else {
        console.log('✅ extension_bots table: Found');
    }

    // Check extension_logs
    const { error: logsError } = await supabase.from('extension_logs').select('count', { count: 'exact', head: true });
    if (logsError) {
        console.log('❌ extension_logs table:', logsError.message);
    } else {
        console.log('✅ extension_logs table: Found');
    }
}

checkTables();
