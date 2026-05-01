const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing in .env');
}

// Public client for basic operations
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Admin client for bypass operations/bulk if needed
const supabaseAdmin = (supabaseUrl && supabaseServiceRoleKey) ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

module.exports = {
    supabase,
    supabaseAdmin,
};
