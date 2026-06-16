const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Helper to send Telegram messages
async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured, skipping sendTelegramMessage');
    return;
  }
  try {
    const body = { chat_id: chatId, text };
    if (replyMarkup) {
      body.reply_markup = replyMarkup;
    }
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    console.log('Telegram send message result:', result);
  } catch (err) {
    console.error('Error sending message to Telegram:', err);
  }
}

// Helper to generate a secure deterministic password for Supabase Auth
function generateUserPassword(chatId) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mescott-default-auth-secret-1234';
  return crypto
    .createHmac('sha256', secret)
    .update(String(chatId))
    .digest('hex');
}

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
    const payload = req.body;
    console.log('Received Telegram Webhook:', JSON.stringify(payload, null, 2));

    if (payload.message) {
      const { chat, text, contact, from } = payload.message;
      const chatId = chat.id;
      const username = from.username || '';

      // Handle shared contact (phone number)
      if (contact) {
        if (String(contact.user_id) !== String(from.id)) {
          await sendTelegramMessage(chatId, '⚠️ Verification failed: You must share your own contact.');
          return res.status(200).json({ success: false, error: 'User ID mismatch' });
        }

        const rawPhone = contact.phone_number;
        const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

        // Find the pending session matching this Telegram chat ID
        const { data: sessionRow, error: sessionError } = await supabaseAdmin
          .from('auth_pending_sessions')
          .select('*')
          .eq('status', 'PENDING')
          .eq('device_info->>telegram_chat_id', String(chatId))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionError || !sessionRow) {
          console.error('No pending session found for chat ID:', chatId, sessionError);
          await sendTelegramMessage(chatId, '❌ No pending login session found. Please start login from the Mescott app.');
          return res.status(200).json({ success: false, error: 'No pending session' });
        }

        const sessionToken = sessionRow.session_token;
        const password = generateUserPassword(chatId);

        let { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('phone', phone)
          .maybeSingle();

        let userId;

        if (profile) {
          userId = profile.user_id;
          await supabaseAdmin
            .from('profiles')
            .update({
              telegram_chat_id: String(chatId),
              telegram_username: username,
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id);
        } else {
          try {
            const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
              phone: phone,
              password: password,
              phone_confirm: true
            });

            if (signUpError) {
              if (signUpError.message.includes('already exists') || signUpError.status === 422) {
                console.log('User auth already exists, proceeding to login');
              } else {
                throw signUpError;
              }
            } else {
              userId = newUser.user.id;
            }
          } catch (createErr) {
            console.error('Error creating user:', createErr);
          }
        }

        const { data: authData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          phone: phone,
          password: password
        });

        if (signInError) {
          console.error('Error signing in user:', signInError);
          await sendTelegramMessage(chatId, '⚠️ Authentication failed. Please contact support.');
          return res.status(200).json({ success: false, error: 'Sign in failed' });
        }

        if (!profile && authData.user) {
          userId = authData.user.id;
          const { data: newProfile, error: createProfileError } = await supabaseAdmin
            .from('profiles')
            .insert([{
              user_id: userId,
              full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Telegram User',
              username: username || `tg_${chatId}`,
              phone: phone,
              telegram_chat_id: String(chatId),
              telegram_username: username,
              role: 'customer',
              current_mode: 'customer'
            }])
            .select()
            .single();

          if (createProfileError) {
            console.error('Error creating profile:', createProfileError);
          } else {
            profile = newProfile;
          }
        }

        const jwtPayload = {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          user: {
            id: profile ? profile.id : authData.user.id,
            user_id: authData.user.id,
            full_name: profile ? profile.full_name : 'Telegram User',
            username: username || `tg_${chatId}`,
            phone: phone,
            role: profile ? profile.role : 'customer',
            current_mode: profile ? profile.current_mode : 'customer'
          }
        };

        await supabaseAdmin
          .from('auth_pending_sessions')
          .update({
            status: 'APPROVED',
            user_id: authData.user.id,
            jwt_payload: jwtPayload
          })
          .eq('session_token', sessionToken);

        const channel = supabaseAdmin.channel(`auth:${sessionToken}`);
        await channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await channel.send({
              type: 'broadcast',
              event: 'AUTH_SUCCESS',
              payload: jwtPayload
            });
            console.log(`Successfully broadcasted AUTH_SUCCESS for session: ${sessionToken}`);
          }
        });

        await sendTelegramMessage(chatId, '🎉 Authentication successful! Please return to the Mescott app to continue.');

        return res.status(200).json({ success: true });
      }

      // Handle /start command
      if (text && text.startsWith('/start')) {
        const token = text.split(' ')[1];
        if (!token) {
          await sendTelegramMessage(chatId, "Welcome to Mescott! Please use the 'Continue with Telegram' button in the Mescott mobile app to sign in.");
          return res.status(200).json({ success: true });
        }

        const { data: sessionRow, error: sessionError } = await supabaseAdmin
          .from('auth_pending_sessions')
          .select('*')
          .eq('session_token', token)
          .single();

        if (sessionError || !sessionRow) {
          await sendTelegramMessage(chatId, '❌ Invalid or expired login session. Please try logging in again from Mescott.');
          return res.status(200).json({ success: true });
        }

        if (sessionRow.status !== 'PENDING') {
          await sendTelegramMessage(chatId, '⚠️ This login session has already been processed.');
          return res.status(200).json({ success: true });
        }

        const ageInSeconds = (Date.now() - new Date(sessionRow.created_at).getTime()) / 1000;
        if (ageInSeconds > 300) {
          await supabaseAdmin
            .from('auth_pending_sessions')
            .update({ status: 'EXPIRED' })
            .eq('session_token', token);

          await sendTelegramMessage(chatId, '⌛ This login session has expired. Please try again from Mescott.');
          return res.status(200).json({ success: true });
        }

        await supabaseAdmin
          .from('auth_pending_sessions')
          .update({
            device_info: {
              ...sessionRow.device_info,
              telegram_chat_id: String(chatId),
              telegram_username: username
            }
          })
          .eq('session_token', token);

        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('telegram_chat_id', String(chatId))
          .maybeSingle();

        if (profile) {
          const password = generateUserPassword(chatId);
          const { data: authData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
            phone: profile.phone,
            password: password
          });

          if (signInError) {
            console.error('Error signing in existing Telegram user:', signInError);
            await sendTelegramMessage(chatId, '⚠️ Authentication failed. Please contact support.');
            return res.status(200).json({ success: true });
          }

          const jwtPayload = {
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
            user: {
              id: profile.id,
              user_id: authData.user.id,
              full_name: profile.full_name,
              username: profile.username || username,
              phone: profile.phone,
              role: profile.role,
              current_mode: profile.current_mode
            }
          };

          await supabaseAdmin
            .from('auth_pending_sessions')
            .update({
              status: 'APPROVED',
              user_id: authData.user.id,
              jwt_payload: jwtPayload
            })
            .eq('session_token', token);

          const channel = supabaseAdmin.channel(`auth:${token}`);
          await channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await channel.send({
                type: 'broadcast',
                event: 'AUTH_SUCCESS',
                payload: jwtPayload
              });
              console.log(`Successfully broadcasted AUTH_SUCCESS for existing session: ${token}`);
            }
          });

          await sendTelegramMessage(chatId, '🎉 Sign in successful! You can now return to the Mescott app.');
        } else {
          const textMsg = 'To complete your sign in or registration with Mescott, please click the button below to share your phone number.';
          const replyMarkup = {
            keyboard: [[{ text: 'Share Contact 📱', request_contact: true }]],
            one_time_keyboard: true,
            resize_keyboard: true
          };

          await sendTelegramMessage(chatId, textMsg, replyMarkup);
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
};
