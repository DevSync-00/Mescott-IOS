const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
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
    const deviceInfo = req.body?.deviceInfo || {};

    const { error } = await supabaseAdmin
      .from('auth_pending_sessions')
      .insert([{
        session_token: sessionToken,
        status: 'PENDING',
        device_info: deviceInfo,
      }]);

    if (error) {
      console.error('[initiate] Supabase insert error:', error);
      return res.status(500).json({ success: false, error: 'Failed to create session', details: error.message });
    }

    const botName = process.env.TELEGRAM_BOT_NAME || 'MescottVerifyBot';
    const telegramLink = `tg://resolve?domain=${botName}&start=${sessionToken}`;
    const fallbackLink = `https://t.me/${botName}?start=${sessionToken}`;

    console.log(`[initiate] Session created: ${sessionToken.substring(0, 8)}... bot: ${botName}`);

    return res.status(200).json({
      success: true,
      session_token: sessionToken,
      telegram_link: telegramLink,
      fallback_link: fallbackLink,
    });
  } catch (err) {
    console.error('[initiate] Unexpected error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
  }
};
