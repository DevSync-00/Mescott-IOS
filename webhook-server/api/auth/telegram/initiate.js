const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const deviceInfo = req.body.deviceInfo || {};

    const { data, error } = await supabaseAdmin
      .from('auth_pending_sessions')
      .insert([{
        session_token: sessionToken,
        status: 'PENDING',
        device_info: deviceInfo
      }])
      .select()
      .single();

    if (error) {
      console.error('Error inserting pending session:', error);
      throw error;
    }

    const botName = process.env.TELEGRAM_BOT_NAME || 'MescottBot';
    const telegramLink = `tg://resolve?domain=${botName}&start=${sessionToken}`;
    const fallbackLink = `https://t.me/${botName}?start=${sessionToken}`;

    return res.status(200).json({
      success: true,
      session_token: sessionToken,
      telegram_link: telegramLink,
      fallback_link: fallbackLink
    });
  } catch (error) {
    console.error('Error initiating Telegram auth:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initiate Telegram auth',
      details: error.message
    });
  }
};
