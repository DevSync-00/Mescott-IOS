const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Initialize Supabase Admin client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Mescott Webhook Server is running!',
    timestamp: new Date().toISOString(),
    environment: {
      supabase_url: process.env.SUPABASE_URL ? 'Set' : 'Not set',
      supabase_anon_key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set',
      chapa_webhook_secret: process.env.CHAPA_WEBHOOK_SECRET ? 'Set' : 'Not set'
    }
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint working!',
    timestamp: new Date().toISOString()
  });
});

// Verify webhook signature
function verifyWebhookSignature(rawBody, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

// Process successful payment
async function processSuccessfulPayment(payload) {
  try {
    const { tx_ref, amount, meta } = payload.data;
    
    console.log(`Processing successful payment for tx_ref: ${tx_ref}`);
    
    // Get tasker's user_id from profile
    const { data: taskerProfile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id')
      .eq('id', meta.tasker_id)
      .single();

    if (profileError || !taskerProfile) {
      console.error('Tasker profile not found:', profileError);
      return false;
    }

    // Check if this payment was already processed (to avoid duplicate credits)
    const { data: existingTx, error: checkError } = await supabase
      .from('transactions')
      .select('id')
      .eq('user_id', taskerProfile.user_id)
      .eq('type', 'deposit')
      .eq('metadata->>tx_ref', tx_ref)
      .maybeSingle();

    if (existingTx) {
      console.log(`Payment with tx_ref ${tx_ref} already processed for wallet credit. Skipping duplicate credit.`);
      return true;
    }

    // Get or create tasker wallet
    let { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', taskerProfile.user_id)
      .single();

    if (walletError && walletError.code === 'PGRST116') {
      // Wallet doesn't exist, create it
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert([{
          user_id: taskerProfile.user_id,
          balance: 0,
          currency: 'ETB',
          is_active: true
        }])
        .select()
        .single();

      if (createError) {
        console.error('Error creating wallet:', createError);
        return false;
      }
      wallet = newWallet;
    } else if (walletError) {
      console.error('Error getting wallet:', walletError);
      return false;
    }

    // Calculate net amount to credit (after platform fee)
    const platformFeeRate = 0.05; // 5% platform fee
    const netAmount = meta.net_amount || (amount - (amount * platformFeeRate));

    // Update wallet balance
    const { error: updateWalletError } = await supabase
      .from('wallets')
      .update({
        balance: wallet.balance + netAmount,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet.id);

    if (updateWalletError) {
      console.error('Error updating wallet:', updateWalletError);
      return false;
    }

    // Create wallet transaction record
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert([{
        user_id: taskerProfile.user_id,
        type: 'deposit',
        amount: netAmount,
        currency: 'ETB',
        status: 'completed',
        description: `Payment received for task completion`,
        metadata: {
          tx_ref: tx_ref,
          task_id: meta.task_id,
          platform_fee: meta.platform_fee,
          vat_amount: meta.vat_amount,
          source: 'chapa_payment'
        }
      }]);

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
      return false;
    }

    // Update task payment status
    if (meta.task_id) {
      const { error: taskUpdateError } = await supabase
        .from('tasks')
        .update({
          payment_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', meta.task_id);

      if (taskUpdateError) {
        console.error('Error updating task:', taskUpdateError);
        return false;
      }
    }

    console.log(`Successfully processed payment for tasker ${meta.tasker_id}, amount: ${netAmount} ETB`);
    return true;

  } catch (error) {
    console.error('Error processing successful payment:', error);
    return false;
  }
}

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['chapa-signature'] || req.headers['x-chapa-signature'];
    const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('CHAPA_WEBHOOK_SECRET environment variable is required');
    }

    console.log('Received webhook:', JSON.stringify(payload, null, 2));

    // Verify webhook signature (optional but recommended)
    if (signature && webhookSecret) {
      const isValid = verifyWebhookSignature(req.rawBody || JSON.stringify(payload), signature, webhookSecret);
      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid signature' 
        });
      }
    }

    // Check if this is a payment event
    if (payload.event === 'charge.completed' || payload.event === 'charge.success') {
      const success = await processSuccessfulPayment(payload);
      
      if (success) {
        console.log('Webhook processed successfully');
        return res.status(200).json({ 
          success: true, 
          message: 'Webhook processed successfully' 
        });
      } else {
        console.error('Failed to process webhook');
        return res.status(400).json({ 
          success: false, 
          error: 'Failed to process payment' 
        });
      }
    } else {
      console.log(`Received webhook event: ${payload.event}, ignoring`);
      return res.status(200).json({ 
        success: true, 
        message: 'Webhook received but not processed' 
      });
    }

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// --- TELEGRAM 2FA AUTHENTICATION FLOW ---

// Helper function to send messages to Telegram Bot
async function sendTelegramMessage(chatId, text, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured, skipping sendTelegramMessage');
    return;
  }
  try {
    const body = {
      chat_id: chatId,
      text
    };
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

// 1. Endpoint: Initiate Telegram authentication and obtain deep link
app.post('/api/auth/telegram/initiate', async (req, res) => {
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

    return res.json({
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
});

// 2. Endpoint: Telegram Bot Webhook to handle start command and contact sharing
app.post('/api/webhooks/telegram', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Telegram Webhook:', JSON.stringify(payload, null, 2));

    if (payload.message) {
      const { chat, text, contact, from } = payload.message;
      const chatId = chat.id;
      const username = from.username || '';

      // Check if contact (phone number) is shared
      if (contact) {
        if (String(contact.user_id) !== String(from.id)) {
          await sendTelegramMessage(chatId, "⚠️ Verification failed: You must share your own contact.");
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
          await sendTelegramMessage(chatId, "❌ No pending login session found. Please start login from the Mescott app.");
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
          await sendTelegramMessage(chatId, "⚠️ Authentication failed. Please contact support.");
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

        await sendTelegramMessage(
          chatId,
          "🎉 Authentication successful! Please return to the Mescott app to continue."
        );

        return res.json({ success: true });
      }

      // Handle start command
      if (text && text.startsWith('/start')) {
        const token = text.split(' ')[1];
        if (!token) {
          await sendTelegramMessage(chatId, "Welcome to Mescott! Please use the 'Continue with Telegram' button in the Mescott mobile app to sign in.");
          return res.json({ success: true });
        }

        const { data: sessionRow, error: sessionError } = await supabaseAdmin
          .from('auth_pending_sessions')
          .select('*')
          .eq('session_token', token)
          .single();

        if (sessionError || !sessionRow) {
          await sendTelegramMessage(chatId, "❌ Invalid or expired login session. Please try logging in again from Mescott.");
          return res.json({ success: true });
        }

        if (sessionRow.status !== 'PENDING') {
          await sendTelegramMessage(chatId, "⚠️ This login session has already been processed.");
          return res.json({ success: true });
        }

        const ageInSeconds = (Date.now() - new Date(sessionRow.created_at).getTime()) / 1000;
        if (ageInSeconds > 300) {
          await supabaseAdmin
            .from('auth_pending_sessions')
            .update({ status: 'EXPIRED' })
            .eq('session_token', token);

          await sendTelegramMessage(chatId, "⌛ This login session has expired. Please try again from Mescott.");
          return res.json({ success: true });
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
            await sendTelegramMessage(chatId, "⚠️ Authentication failed. Please contact support.");
            return res.json({ success: true });
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

          await sendTelegramMessage(
            chatId,
            "🎉 Sign in successful! You can now return to the Mescott app."
          );
        } else {
          const textMsg = "To complete your sign in or registration with Mescott, please click the button below to share your phone number.";
          const replyMarkup = {
            keyboard: [[{ text: "Share Contact 📱", request_contact: true }]],
            one_time_keyboard: true,
            resize_keyboard: true
          };

          await sendTelegramMessage(chatId, textMsg, replyMarkup);
        }
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Mescott Webhook Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/`);
  console.log(`🔗 Webhook endpoint: http://localhost:${PORT}/webhook`);
});

module.exports = app;
