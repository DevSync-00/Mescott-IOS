import { supabase } from '../lib/supabase'
import { handleError } from '../utils/errorHandler'
import { CHAPA_CONFIG } from '../config/chapa'

// Chapa API Types
export interface ChapaPaymentRequest {
  amount: string
  currency: string
  email: string
  first_name: string
  last_name: string
  phone_number: string
  tx_ref: string
  callback_url: string
  return_url: string
  customization: {
    title: string
    description: string
    logo: string
  }
  meta?: {
    task_id?: string
    customer_id?: string
    tasker_id?: string
    vat_amount?: number
    platform_fee?: number
    net_amount?: number
  }
}

export interface ChapaPaymentResponse {
  status: string
  message: string
  data: {
    checkout_url: string
    tx_ref: string
  }
}

export interface ChapaVerificationResponse {
  status: string
  message: string
  data: {
    tx_ref: string
    amount: number
    currency: string
    status: string
    created_at: string
    customer: {
      email: string
      first_name: string
      last_name: string
      phone_number: string
    }
    meta?: any
  }
}

export interface ChapaWebhookPayload {
  event: string
  data: {
    tx_ref: string
    status: string
    amount: number
    currency: string
    created_at: string
    customer: {
      email: string
      first_name: string
      last_name: string
      phone_number: string
    }
    meta?: any
  }
}

export interface PaymentCalculation {
  originalAmount: number
  vatAmount: number
  totalAmount: number
  platformFee: number
  netAmount: number
  breakdown: {
    subtotal: number
    vat: number
    platformFee: number
    total: number
    netToTasker: number
  }
}

export class ChapaPaymentService {
  // Calculate payment breakdown with VAT and platform fees
  static calculatePaymentBreakdown(originalAmount: number): PaymentCalculation {
    const vatAmount = originalAmount * CHAPA_CONFIG.vatRate
    const totalAmount = originalAmount + vatAmount
    const platformFee = totalAmount * CHAPA_CONFIG.platformFeeRate
    const netAmount = totalAmount - platformFee

    return {
      originalAmount,
      vatAmount,
      totalAmount,
      platformFee,
      netAmount,
      breakdown: {
        subtotal: originalAmount,
        vat: vatAmount,
        platformFee: platformFee,
        total: totalAmount,
        netToTasker: netAmount
      }
    }
  }

  // Initialize payment with Chapa
  static async initializePayment(
    taskId: string,
    customerUserId: string,
    amount: number,
    customerInfo: {
      email: string
      firstName: string
      lastName: string
      phone: string
    }
  ): Promise<{ checkoutUrl: string; txRef: string } | { success: false; error: string; checkoutUrl: null; txRef: null }> {
    try {
      // Calculate payment breakdown
      const calculation = this.calculatePaymentBreakdown(amount)
      
      // Generate unique transaction reference (max 50 characters)
      const txRef = `MUYA_${taskId.slice(0, 8)}_${Date.now().toString().slice(-8)}`
      
      // Get task details
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, description, customer_id, tasker_id')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        throw new Error('Task not found')
      }

      // Validate and format email - Chapa has very strict email validation
      const validateEmail = (email: string) => {
        // Very strict email validation for Chapa
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
        return emailRegex.test(email) && email.length <= 254 && !email.includes('..') && !email.startsWith('.') && !email.endsWith('.')
      }

      // Use the real customer email in live mode; fail fast if invalid.
      const validEmail = String(customerInfo.email || '').trim().toLowerCase()
      if (!validateEmail(validEmail)) {
        return {
          success: false,
          error: 'Please provide a valid customer email before initializing payment.',
          checkoutUrl: null,
          txRef: null
        }
      }

      // Prepare Chapa payment request
      const paymentRequest: ChapaPaymentRequest = {
        amount: calculation.totalAmount.toString(),
        currency: CHAPA_CONFIG.currency,
        email: String(validEmail).trim(), // Ensure it's a plain string
        first_name: customerInfo.firstName.trim(),
        last_name: customerInfo.lastName.trim(),
        phone_number: customerInfo.phone.replace(/\s+/g, ''), // Remove spaces from phone
        tx_ref: txRef,
        callback_url: 'https://mchapaw-n0utcbuab-bereket-birhanu-kinfus-projects.vercel.app/api/webhook',
        return_url: 'https://mescott.com/payment-success',
        customization: {
          title: CHAPA_CONFIG.companyName,
          description: 'Payment for task completion',
          logo: CHAPA_CONFIG.companyLogo
        },
        meta: {
          task_id: taskId,
          customer_id: customerUserId,
          tasker_id: task.tasker_id,
          vat_amount: calculation.vatAmount,
          platform_fee: calculation.platformFee,
          net_amount: calculation.netAmount
        }
      }

      // Check if API credentials are configured and not test-mode credentials.
      if (
        !CHAPA_CONFIG.secretKey ||
        CHAPA_CONFIG.secretKey.includes('xxxxxxxxxxxxxxxxxxxxxxxx') ||
        CHAPA_CONFIG.secretKey === 'CHASECK_TEST-your_secret_key_here' ||
        CHAPA_CONFIG.secretKey.includes('_TEST')
      ) {
        console.error('❌ Chapa API credentials not configured')
        console.error('Please create a .env file in the frontend directory with:')
        console.error('EXPO_PUBLIC_CHAPA_SECRET_KEY=your_live_secret_key')
        console.error('Get your keys from: https://dashboard.chapa.co/')
        return {
          success: false,
          error: 'Chapa live API credentials not configured. Please set EXPO_PUBLIC_CHAPA_SECRET_KEY to a live key.',
          checkoutUrl: null,
          txRef: null
        }
      }

      const chapaUrl = `${CHAPA_CONFIG.baseUrl}/transaction/initialize`

      const requestBody = {
        ...paymentRequest,
        email: String(paymentRequest.email).trim(),
      }

      console.log('Sending to Chapa:', requestBody)

      // Make API call to Chapa with retry logic for rate limiting
      let response: Response | undefined
      let retryCount = 0
      const maxRetries = 3
      
      while (retryCount < maxRetries) {
        response = await fetch(chapaUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${CHAPA_CONFIG.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        })
        
        // If we get rate limited, wait and retry
        if (response.status === 429) {
          retryCount++
          const waitTime = Math.pow(2, retryCount) * 1000 // Exponential backoff: 2s, 4s, 8s
          console.log(`Rate limited. Retrying in ${waitTime/1000} seconds... (attempt ${retryCount}/${maxRetries})`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        // If not rate limited, break out of retry loop
        break
      }

      if (!response) {
        throw new Error('Failed to get response from Chapa API')
      }

      const responseText = await response.text()
      console.log('Chapa Raw Response:', responseText)

      let result
      try {
        result = JSON.parse(responseText)
      } catch {
        throw new Error(`Invalid JSON from Chapa: ${responseText}`)
      }

      if (result.status !== 'success') {
        console.error('Chapa Error Details:', result)
        
        // Handle specific validation errors
        if (result.message?.email) {
          throw new Error(`Chapa validation failed: ${result.message.email.join(', ')}`)
        }
        
        throw new Error(`Chapa payment failed: ${result.message?.email || result.message || 'Unknown error'}`)
      }

      // Store payment record in database
      await this.createPaymentRecord(
        taskId,
        customerUserId,
        calculation,
        txRef,
        'pending'
      )

      return {
        checkoutUrl: result.data.checkout_url,
        txRef: result.data.tx_ref
      }

    } catch (error) {
      const appError = handleError(error, 'initializePayment')
      console.error('Error initializing Chapa payment:', appError)
      return {
        success: false,
        error: appError.message || 'Payment initialization failed',
        checkoutUrl: null,
        txRef: null
      }
    }
  }

  // Verify payment status with Chapa
  static async verifyPayment(txRef: string): Promise<ChapaVerificationResponse | null> {
    try {
      const response = await fetch(`${CHAPA_CONFIG.baseUrl}/transaction/verify/${txRef}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CHAPA_CONFIG.secretKey}`,
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(`Chapa API Error: ${errorData.message || 'Unknown error'}`)
      }

      const result: ChapaVerificationResponse = await response.json()
      return result

    } catch (error) {
      const appError = handleError(error, 'verifyPayment')
      console.error('Error verifying Chapa payment:', appError)
      return null
    }
  }

  // Handle webhook from Chapa
  static async handleWebhook(payload: ChapaWebhookPayload): Promise<boolean> {
    try {
      const { tx_ref, status, amount, meta } = payload.data

      // Verify webhook signature (implement proper verification)
      // const signature = headers['chapa-signature']
      // if (!this.verifyWebhookSignature(payload, signature)) {
      //   throw new Error('Invalid webhook signature')
      // }

      // Update payment status in database
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: status === 'success' ? 'completed' : 'failed',
          updated_at: new Date().toISOString(),
          metadata: {
            ...meta,
            chapa_verification: payload.data
          }
        })
        .eq('metadata->>tx_ref', tx_ref)

      if (updateError) {
        throw updateError
      }

      // If payment successful, process wallet credit
      if (status === 'success' && meta?.tasker_id) {
        await this.processSuccessfulPayment(tx_ref, meta.tasker_id, amount, meta)
      }

      return true

    } catch (error) {
      const appError = handleError(error, 'handleWebhook')
      console.error('Error handling Chapa webhook:', appError)
      return false
    }
  }

  // Process successful payment and credit tasker wallet
  public static async processSuccessfulPayment(
    txRef: string,
    taskerId: string,
    amount: number,
    meta: any
  ): Promise<void> {
    try {
      // Get tasker's user_id from profile
      const { data: taskerProfile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', taskerId)
        .single()

      if (profileError || !taskerProfile) {
        throw new Error('Tasker profile not found')
      }

      // Check if this payment was already processed (to avoid duplicate credits)
      const { data: existingTx, error: checkError } = await supabase
        .from('transactions')
        .select('id')
        .eq('user_id', taskerProfile.user_id)
        .eq('type', 'deposit')
        .eq('metadata->>tx_ref', txRef)
        .maybeSingle()

      if (existingTx) {
        console.log(`Payment with tx_ref ${txRef} already processed for wallet credit. Skipping duplicate credit.`)
        return
      }

      // Get or create tasker wallet
      let { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', taskerProfile.user_id)
        .single()

      if (walletError && walletError.code === 'PGRST116') {
        // Wallet doesn't exist, create it
        const { data: newWallet, error: createError } = await supabase
          .from('wallets')
          .insert([{
            user_id: taskerProfile.user_id,
            balance: 0,
            currency: CHAPA_CONFIG.currency,
            is_active: true
          }])
          .select()
          .single()

        if (createError) throw createError
        wallet = newWallet
      } else if (walletError) {
        throw walletError
      }

      // Calculate net amount to credit (after platform fee)
      const netAmount = meta.net_amount || (amount - (amount * CHAPA_CONFIG.platformFeeRate))

      // Update wallet balance
      const { error: updateWalletError } = await supabase
        .from('wallets')
        .update({
          balance: (wallet.balance + netAmount),
          updated_at: new Date().toISOString()
        })
        .eq('id', wallet.id)

      if (updateWalletError) throw updateWalletError

      // Create wallet transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          user_id: taskerProfile.user_id,
          type: 'deposit',
          amount: netAmount,
          currency: CHAPA_CONFIG.currency,
          status: 'completed',
          description: `Payment received for task completion`,
          metadata: {
            tx_ref: txRef,
            task_id: meta.task_id,
            platform_fee: meta.platform_fee,
            vat_amount: meta.vat_amount,
            source: 'chapa_payment'
          }
        }])

      if (transactionError) throw transactionError

      // Update task payment status
      if (meta.task_id) {
        await supabase
          .from('tasks')
          .update({
            payment_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', meta.task_id)
      }

    } catch (error) {
      const appError = handleError(error, 'processSuccessfulPayment')
      console.error('Error processing successful payment:', appError)
      throw appError
    }
  }

  // Create payment record in database
  private static async createPaymentRecord(
    taskId: string,
    customerUserId: string,
    calculation: PaymentCalculation,
    txRef: string,
    status: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('transactions')
        .insert([{
          user_id: customerUserId,
          task_id: taskId,
          type: 'task_payment',
          amount: calculation.totalAmount,
          currency: CHAPA_CONFIG.currency,
          status: status,
          description: `Task payment via Chapa`,
          metadata: {
            tx_ref: txRef,
            payment_gateway: 'chapa',
            breakdown: calculation.breakdown,
            vat_rate: CHAPA_CONFIG.vatRate,
            platform_fee_rate: CHAPA_CONFIG.platformFeeRate
          }
        }])

      if (error) throw error

    } catch (error) {
      const appError = handleError(error, 'createPaymentRecord')
      console.error('Error creating payment record:', appError)
      throw appError
    }
  }

  // Get payment status by transaction reference
  static async getPaymentStatus(txRef: string): Promise<{
    status: string
    amount: number
    breakdown: any
  } | null> {
    try {
      const { data: transaction, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('metadata->>tx_ref', txRef)
        .single()

      if (error) throw error

      return {
        status: transaction.status,
        amount: transaction.amount,
        breakdown: transaction.metadata?.breakdown
      }

    } catch (error) {
      const appError = handleError(error, 'getPaymentStatus')
      console.error('Error getting payment status:', appError)
      return null
    }
  }

  // Get tasker wallet balance
  static async getTaskerWalletBalance(taskerUserId: string): Promise<{
    balance: number
    currency: string
    isActive: boolean
  } | null> {
    try {
      const { data: wallet, error } = await supabase
        .from('wallets')
        .select('balance, currency, is_active')
        .eq('user_id', taskerUserId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // Wallet doesn't exist, return zero balance
          return {
            balance: 0,
            currency: CHAPA_CONFIG.currency,
            isActive: true
          }
        }
        throw error
      }

      return {
        balance: wallet.balance,
        currency: wallet.currency,
        isActive: wallet.is_active
      }

    } catch (error) {
      const appError = handleError(error, 'getTaskerWalletBalance')
      console.error('Error getting tasker wallet balance:', appError)
      return null
    }
  }

  // Get tasker transaction history
  static async getTaskerTransactionHistory(taskerUserId: string): Promise<any[]> {
    try {
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', taskerUserId)
        .in('type', ['deposit', 'withdrawal'])
        .order('created_at', { ascending: false })

      if (error) throw error

      return transactions || []

    } catch (error) {
      const appError = handleError(error, 'getTaskerTransactionHistory')
      console.error('Error getting tasker transaction history:', appError)
      return []
    }
  }

  // Withdraw from tasker wallet
  static async withdrawFromWallet(
    taskerUserId: string,
    amount: number,
    withdrawalMethod: string
  ): Promise<boolean> {
    try {
      // Get current wallet balance
      const walletBalance = await this.getTaskerWalletBalance(taskerUserId)
      if (!walletBalance || walletBalance.balance < amount) {
        throw new Error('Insufficient wallet balance')
      }

      // Create withdrawal transaction
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          user_id: taskerUserId,
          type: 'withdrawal',
          amount: amount,
          currency: CHAPA_CONFIG.currency,
          status: 'pending',
          description: `Withdrawal via ${withdrawalMethod}`,
          metadata: {
            withdrawal_method: withdrawalMethod,
            source: 'wallet_withdrawal'
          }
        }])

      if (transactionError) throw transactionError

      // Update wallet balance
      const { error: updateError } = await supabase
        .from('wallets')
        .update({
          balance: walletBalance.balance - amount,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', taskerUserId)

      if (updateError) throw updateError

      return true

    } catch (error) {
      const appError = handleError(error, 'withdrawFromWallet')
      console.error('Error withdrawing from wallet:', appError)
      return false
    }
  }
}
