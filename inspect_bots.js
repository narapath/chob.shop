const { supabase } = require('./lib/supabase');

async function inspectBots() {
    console.log('--- Inspecting extension_bots ---');
    try {
        const { data, error } = await supabase.from('extension_bots').select('*');
        if (error) {
            console.error('❌ Table error:', error.message);
        } else {
            console.log('✅ Found', data.length, 'bots in DB:');
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('❌ Unexpected error:', err.message);
    }
}

inspectBots();
