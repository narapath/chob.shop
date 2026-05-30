const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkLogsTable() {
    console.log('--- Database Verification ---');
    console.log('URL:', process.env.SUPABASE_URL);

    console.log('\n1. Checking extension_bots...');
    const botRes = await supabase.from('extension_bots').select('count', { count: 'exact', head: true });
    if (botRes.error) {
        console.error('❌ extension_bots error:', botRes.error.message);
    } else {
        console.log('✅ extension_bots exists. Rows:', botRes.count);
    }

    console.log('\n2. Checking extension_logs...');
    const logRes = await supabase.from('extension_logs').select('count', { count: 'exact', head: true });
    if (logRes.error) {
        console.error('❌ extension_logs error:', logRes.error.message);
        if (logRes.error.code === 'PGRST205' || logRes.error.code === '42P01') {
            console.warn('\n⚠️  ACTION REQUIRED: The "extension_logs" table is still missing.');
            console.warn('Please run the SQL in your Supabase SQL Editor.');
        }
    } else {
        console.log('✅ extension_logs exists! Rows:', logRes.count);
    }
}

checkLogsTable();
