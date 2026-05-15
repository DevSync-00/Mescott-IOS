const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Verify webhook signature
function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
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

// Main webhook handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET requests for testing
  if (req.method === 'GET') {
    return res.status(200).json({ 
      success: true, 
      message: 'Mescott Webhook Server is running!',
      timestamp: new Date().toISOString(),
      environment: {
        supabase_url: process.env.SUPABASE_URL ? 'Set' : 'Not set',
        supabase_anon_key: process.env.SUPABASE_ANON_KEY ? 'Set' : 'Not set',
        chapa_webhook_secret: process.env.CHAPA_WEBHOOK_SECRET ? 'Set' : 'Not set'
      }
    });
  }

  // Handle POST requests (webhook)
  if (req.method === 'POST') {
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
        const isValid = verifyWebhookSignature(payload, signature, webhookSecret);
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
  }

  return res.status(405).json({ 
    success: false, 
    error: 'Method not allowed' 
  });
}
