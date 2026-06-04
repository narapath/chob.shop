const { supabase, supabaseAdmin } = require('./lib/supabase');
require('dotenv').config();

async function debugDB() {
    console.log('--- Supabase Debug Info ---');
    console.log('URL:', process.env.SUPABASE_URL);
    console.log('Using Admin Client:', !!supabaseAdmin);

    try {
        const { data, error } = await supabase.from('extension_bots').select('bot_name, status, last_heartbeat');
        if (error) {
            console.error('❌ Database error:', error.message);
        } else {
            console.log('✅ Found', data.length, 'bots:');
            data.forEach(b => {
                console.log(` - ${b.bot_name} [${b.status}] Last: ${b.last_heartbeat}`);
            });
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

debugDB();
