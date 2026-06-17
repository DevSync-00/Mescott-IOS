const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Send a message via Telegram Bot API
async function sendMessage(chatId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN not set — skipping message');
    return;
  }
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) console.error('[telegram] sendMessage failed:', json);
  } catch (err) {
    console.error('[telegram] sendMessage error:', err.message);
  }
}

// Deterministic password derived from chatId — same secret as used when user was created
function derivePassword(chatId) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mescott-fallback-secret';
  return crypto.createHmac('sha256', secret).update(String(chatId)).digest('hex');
}

// Broadcast AUTH_SUCCESS via Supabase Realtime and persist jwt_payload to DB
async function approveSession(sessionToken, userId, jwtPayload) {
  // 1. Update DB row to APPROVED
  const { error: updateError } = await supabaseAdmin
    .from('auth_pending_sessions')
    .update({ status: 'APPROVED', user_id: userId, jwt_payload: jwtPayload })
    .eq('session_token', sessionToken);

  if (updateError) {
    console.error('[telegram] Failed to update session to APPROVED:', updateError.message);
    return false;
  }

  // 2. Broadcast via Supabase Realtime so the mobile app gets the event immediately
  try {
    const channel = supabaseAdmin.channel(`auth:${sessionToken}`);
    await new Promise((resolve) => {
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast',
            event: 'AUTH_SUCCESS',
            payload: jwtPayload,
          });
          console.log(`[telegram] Broadcasted AUTH_SUCCESS for session ${sessionToken.substring(0, 8)}...`);
          await supabaseAdmin.removeChannel(channel);
          resolve();
        }
      });
    });
  } catch (broadcastErr) {
    // Non-fatal — the DB fallback in TelegramAuthService will catch it
    console.warn('[telegram] Realtime broadcast failed (DB fallback will handle it):', broadcastErr.message);
  }

  return true;
}

// Find or create Supabase Auth user + profile, then sign them in
async function authenticateUser(phone, chatId, username, contact) {
  const password = derivePassword(chatId);

  // Try sign-in first (user may already exist)
  const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    phone,
    password,
  });

  if (!signInError && signInData?.session) {
    // Existing user — update telegram fields on their profile
    await supabaseAdmin
      .from('profiles')
      .update({ telegram_chat_id: String(chatId), telegram_username: username, updated_at: new Date().toISOString() })
      .eq('user_id', signInData.user.id);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', signInData.user.id)
      .maybeSingle();

    return { session: signInData.session, user: signInData.user, profile };
  }

  // User doesn't exist — create them
  console.log('[telegram] User not found, creating new account for phone:', phone);

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });

  if (createError && !createError.message.includes('already registered')) {
    console.error('[telegram] Failed to create user:', createError.message);
    return null;
  }

  // Sign in with the newly created user
  const { data: freshSignIn, error: freshSignInError } = await supabaseAdmin.auth.signInWithPassword({
    phone,
    password,
  });

  if (freshSignInError || !freshSignIn?.session) {
    console.error('[telegram] Sign-in after creation failed:', freshSignInError?.message);
    return null;
  }

  const userId = freshSignIn.user.id;
  const fullName = [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Telegram User';

  // Create profile row
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert([{
      user_id: userId,
      full_name: fullName,
      username: username || `tg_${chatId}`,
      phone,
      telegram_chat_id: String(chatId),
      telegram_username: username,
      role: 'customer',
      current_mode: 'customer',
    }])
    .select()
    .single();

  if (profileError) {
    console.error('[telegram] Profile creation error:', profileError.message);
    // Profile creation failed but auth is fine — return what we have
    return { session: freshSignIn.session, user: freshSignIn.user, profile: null };
  }

  return { session: freshSignIn.session, user: freshSignIn.user, profile };
}

// ─── Main handler ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  // Telegram always expects 200 from webhook — respond immediately, process async
  res.status(200).json({ ok: true });

  try {
    const payload = req.body;
    if (!payload?.message) return;

    const { message } = payload;
    const chatId = message.chat.id;
    const from = message.from || {};
    const username = from.username || '';
    const text = message.text || '';
    const contact = message.contact;

    console.log(`[telegram] Received message from chatId=${chatId} username=${username}`);

    // ── /start <token> ──────────────────────────────────────────────────────
    if (text.startsWith('/start')) {
      const token = text.split(' ')[1];

      if (!token) {
        await sendMessage(chatId, 'Welcome to Mescott!\n\nPlease use the <b>Continue with Telegram</b> button in the Mescott app to sign in.');
        return;
      }

      // Look up the pending session
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('auth_pending_sessions')
        .select('*')
        .eq('session_token', token)
        .maybeSingle();

      if (sessionError || !session) {
        await sendMessage(chatId, '❌ Invalid or expired login link. Please try again from the Mescott app.');
        return;
      }

      if (session.status !== 'PENDING') {
        await sendMessage(chatId, '⚠️ This login session has already been used. Please start a new one from the app.');
        return;
      }

      const ageSeconds = (Date.now() - new Date(session.created_at).getTime()) / 1000;
      if (ageSeconds > 300) {
        await supabaseAdmin.from('auth_pending_sessions').update({ status: 'EXPIRED' }).eq('session_token', token);
        await sendMessage(chatId, '⌛ This login session has expired (5 min limit). Please try again from the app.');
        return;
      }

      // Save chatId + username into device_info so the contact handler can match sessions
      await supabaseAdmin
        .from('auth_pending_sessions')
        .update({ device_info: { ...session.device_info, telegram_chat_id: String(chatId), telegram_username: username } })
        .eq('session_token', token);

      // If we already know this Telegram user (returning user), authenticate immediately
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('telegram_chat_id', String(chatId))
        .maybeSingle();

      if (existingProfile) {
        console.log(`[telegram] Returning user found: ${existingProfile.full_name}`);
        const password = derivePassword(chatId);
        const { data: authData, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
          phone: existingProfile.phone,
          password,
        });

        if (signInErr || !authData?.session) {
          console.error('[telegram] Sign-in for returning user failed:', signInErr?.message);
          await sendMessage(chatId, '⚠️ Authentication failed. Please contact support.');
          return;
        }

        const jwtPayload = {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          user: {
            id: existingProfile.id,
            user_id: authData.user.id,
            full_name: existingProfile.full_name,
            username: existingProfile.username,
            phone: existingProfile.phone,
            role: existingProfile.role,
            current_mode: existingProfile.current_mode,
          },
        };

        await approveSession(token, authData.user.id, jwtPayload);
        await sendMessage(chatId, '🎉 Signed in successfully! Return to the Mescott app.');
        return;
      }

      // New user — ask them to share their phone number
      await sendMessage(
        chatId,
        '👋 Welcome to Mescott!\n\nTo complete sign-in, please share your phone number using the button below.',
        {
          keyboard: [[{ text: '📱 Share Phone Number', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        }
      );
      return;
    }

    // ── Contact shared (phone number) ───────────────────────────────────────
    if (contact) {
      // Make sure they're sharing their own number
      if (String(contact.user_id) !== String(from.id)) {
        await sendMessage(chatId, '⚠️ Please share <b>your own</b> phone number, not someone else\'s.');
        return;
      }

      const rawPhone = contact.phone_number;
      const phone = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;

      // Find the pending session for this chatId
      const { data: session, error: sessionError } = await supabaseAdmin
        .from('auth_pending_sessions')
        .select('*')
        .eq('status', 'PENDING')
        .eq('device_info->>telegram_chat_id', String(chatId))
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError || !session) {
        await sendMessage(chatId, '❌ No active login session found. Please tap <b>Continue with Telegram</b> in the Mescott app first.');
        return;
      }

      const authResult = await authenticateUser(phone, chatId, username, contact);
      if (!authResult) {
        await sendMessage(chatId, '⚠️ Authentication failed. Please try again or contact support.');
        return;
      }

      const { session: authSession, user: authUser, profile } = authResult;

      const jwtPayload = {
        access_token: authSession.access_token,
        refresh_token: authSession.refresh_token,
        user: {
          id: profile?.id || authUser.id,
          user_id: authUser.id,
          full_name: profile?.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Telegram User',
          username: profile?.username || username || `tg_${chatId}`,
          phone,
          role: profile?.role || 'customer',
          current_mode: profile?.current_mode || 'customer',
        },
      };

      const approved = await approveSession(session.session_token, authUser.id, jwtPayload);
      if (approved) {
        await sendMessage(chatId, '🎉 Authentication successful! Return to the Mescott app to continue.', {
          remove_keyboard: true,
        });
      } else {
        await sendMessage(chatId, '⚠️ Something went wrong finalizing your session. Please try again.');
      }
      return;
    }
  } catch (err) {
    console.error('[telegram] Unhandled error in webhook handler:', err);
  }
};
