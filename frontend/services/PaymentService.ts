import { supabase } from '../lib/supabase'
import { handleError } from '../utils/errorHandler'
import { UnifiedNotificationService } from './UnifiedNotificationService'
import { ChapaPaymentService, PaymentCalculation } from './ChapaPaymentService'
import { WalletService } from './WalletService'

export interface Payment {
  id: string
  user_id: string
  task_id?: string
  type: 'task_payment' | 'refund' | 'withdrawal' | 'deposit'
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded'
  payment_method_id?: string
  description: string
  metadata?: any
  created_at: string
  updated_at: string
  // Additional fields for display
  task_title?: string
  customer_name?: string
  tasker_name?: string
  // Chapa payment fields
  tx_ref?: string
  checkout_url?: string
  payment_breakdown?: PaymentCalculation
}

export interface PaymentMethod {
  id: string
  user_id: string
  type: 'card' | 'bank_account' | 'mobile_money' | 'wallet'
  last4?: string
  brand?: string
  expiry_month?: number
  expiry_year?: number
  is_default: boolean
  created_at: string
  // Additional fields for display
  display_name?: string
}

export class PaymentService {
  // Create a payment for a completed task
  static async createTaskPayment(
    taskId: string, 
    customerProfileId: string, 
    amount: number, 
    description: string
  ): Promise<Payment | null> {
    try {

      // Get task details and customer user_id
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, customer_id, tasker_id, final_price, budget, user_id')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        throw new Error('Task not found')
      }

      // Use the user_id from the task (which is the auth.users.id)
      const customerUserId = task.user_id

      // Use final_price if available, otherwise use budget
      const paymentAmount = task.final_price || task.budget || amount

      // Create payment record
      const { data: payment, error: paymentError } = await supabase
        .from('transactions')
        .insert([{
          user_id: customerUserId, // Use auth.users.id, not profile.id
          task_id: taskId,
          type: 'task_payment',
          amount: paymentAmount,
          currency: 'ETB',
          status: 'pending',
          description: description || `Payment for task: ${task.title}`,
          metadata: {
            task_title: task.title,
            tasker_id: task.tasker_id,
            payment_type: 'task_completion'
          }
        }])
        .select('*')
        .single()

      if (paymentError) {
        throw paymentError
      }

      // Send notification to customer about payment requirement (non-blocking)
      UnifiedNotificationService.notifyPaymentRequired(
        taskId,
        task.title,
        customerUserId, // Use user_id for notifications too
        paymentAmount
      ).catch(err => console.error('Payment notification error:', err))

      return {
        ...payment,
        task_title: task.title,
        customer_name: '', // Will be populated when needed
        tasker_name: '' // Will be populated when needed
      }
    } catch (error) {
      const appError = handleError(error, 'createTaskPayment')
      console.error('Error creating task payment:', appError)
      return null
    }
  }

  // Process a payment
  static async processPayment(paymentId: string, paymentMethodId?: string): Promise<boolean> {
    try {

      // Update payment status to processing
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'processing',
          payment_method_id: paymentMethodId,
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId)

      if (updateError) {
        console.error('🚀 PAYMENT SERVICE - Error updating payment status:', updateError)
        throw updateError
      }

      // Simulate payment processing (in real app, integrate with payment gateway)
      // For now, we'll mark it as completed after a short delay
      setTimeout(async () => {
        try {
          const { error: completeError } = await supabase
            .from('transactions')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', paymentId)

          if (completeError) {
            console.error('Error completing payment:', completeError)
            return
          }

          // Update task payment status
          const { data: payment } = await supabase
            .from('transactions')
            .select('task_id, amount, user_id')
            .eq('id', paymentId)
            .single()

          if (payment?.task_id) {
            await supabase
              .from('tasks')
              .update({
                payment_status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('id', payment.task_id)

            // Send success notification
            await UnifiedNotificationService.notifyPaymentProcessed(
              payment.user_id,
              payment.amount,
              'Task Payment',
              'success'
            )
          }

        } catch (error) {
          console.error('Error in payment completion:', error)
        }
      }, 2000) // 2 second delay to simulate processing

      return true
    } catch (error) {
      const appError = handleError(error, 'processPayment')
      console.error('Error processing payment:', appError)
      return false
    }
  }

  // Get user's payment methods
  static async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      return data?.map(method => ({
        ...method,
        display_name: this.getPaymentMethodDisplayName(method)
      })) || []
    } catch (error) {
      console.error('Error getting payment methods:', error)
      return []
    }
  }

  // Get payment method display name
  private static getPaymentMethodDisplayName(method: any): string {
    switch (method.type) {
      case 'card':
        return `${method.brand || 'Card'} ending in ${method.last4 || '****'}`
      case 'bank_account':
        return `Bank Account ending in ${method.last4 || '****'}`
      case 'mobile_money':
        return 'Mobile Money'
      case 'wallet':
        return 'Wallet'
      default:
        return 'Payment Method'
    }
  }

  // Get user's payments
  static async getUserPayments(userId: string): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          tasks!inner(
            id,
            title,
            customer_id,
            tasker_id
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get names for display
      const taskIds = data?.map(p => p.tasks?.id).filter(Boolean) || []
      const customerIds = data?.map(p => p.tasks?.customer_id).filter(Boolean) || []
      const taskerIds = data?.map(p => p.tasks?.tasker_id).filter(Boolean) || []

      const [customerNames, taskerNames] = await Promise.all([
        this.getProfileNames(customerIds),
        this.getProfileNames(taskerIds)
      ])

      return data?.map(payment => ({
        ...payment,
        task_title: payment.tasks?.title,
        customer_name: customerNames.get(payment.tasks?.customer_id) || '',
        tasker_name: taskerNames.get(payment.tasks?.tasker_id) || ''
      })) || []
    } catch (error) {
      console.error('Error getting user payments:', error)
      return []
    }
  }

  // Get pending payments for a user
  static async getPendingPayments(userId: string): Promise<Payment[]> {
    try {
      const payments = await this.getUserPayments(userId)
      return payments.filter(payment => 
        payment.status === 'pending' && 
        payment.type === 'task_payment'
      )
    } catch (error) {
      console.error('Error getting pending payments:', error)
      return []
    }
  }

  // Cancel a payment
  static async cancelPayment(paymentId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', paymentId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error cancelling payment:', error)
      return false
    }
  }

  // Get payment by ID
  static async getPaymentById(paymentId: string): Promise<Payment | null> {
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          tasks!inner(
            id,
            title,
            customer_id,
            tasker_id
          )
        `)
        .eq('id', paymentId)
        .single()

      if (error) throw error

      // Get names for display
      const [customerName, taskerName] = await Promise.all([
        this.getProfileName(data.tasks?.customer_id),
        this.getProfileName(data.tasks?.tasker_id)
      ])

      return {
        ...data,
        task_title: data.tasks?.title,
        customer_name: customerName,
        tasker_name: taskerName
      }
    } catch (error) {
      console.error('Error getting payment by ID:', error)
      return null
    }
  }

  // Helper method to get profile names by IDs
  private static async getProfileNames(profileIds: string[]): Promise<Map<string, string>> {
    if (profileIds.length === 0) return new Map()
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds)
    
    return new Map(profiles?.map(p => [p.id, p.full_name]) || [])
  }

  // Helper method to get single profile name
  private static async getProfileName(profileId: string): Promise<string> {
    if (!profileId) return ''
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', profileId)
      .maybeSingle()
    
    return profile?.full_name || ''
  }

  // Create a refund
  static async createRefund(
    originalPaymentId: string, 
    amount: number, 
    reason: string
  ): Promise<Payment | null> {
    try {
      // Get original payment details
      const originalPayment = await this.getPaymentById(originalPaymentId)
      if (!originalPayment) {
        throw new Error('Original payment not found')
      }

      const { data: refund, error } = await supabase
        .from('transactions')
        .insert([{
          user_id: originalPayment.user_id,
          task_id: originalPayment.task_id,
          type: 'refund',
          amount: amount,
          currency: originalPayment.currency,
          status: 'pending',
          description: `Refund for: ${originalPayment.description}`,
          metadata: {
            original_payment_id: originalPaymentId,
            reason: reason,
            refund_type: 'task_refund'
          }
        }])
        .select('*')
        .single()

      if (error) throw error

      return {
        ...refund,
        task_title: originalPayment.task_title,
        customer_name: originalPayment.customer_name,
        tasker_name: originalPayment.tasker_name
      }
    } catch (error) {
      console.error('Error creating refund:', error)
      return null
    }
  }

  // Get payment statistics for a user
  static async getPaymentStats(userId: string): Promise<{
    totalPayments: number
    totalAmount: number
    pendingPayments: number
    completedPayments: number
    failedPayments: number
  }> {
    try {
      const payments = await this.getUserPayments(userId)
      
      return {
        totalPayments: payments.length,
        totalAmount: payments
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + p.amount, 0),
        pendingPayments: payments.filter(p => p.status === 'pending').length,
        completedPayments: payments.filter(p => p.status === 'completed').length,
        failedPayments: payments.filter(p => p.status === 'failed').length
      }
    } catch (error) {
      console.error('Error getting payment stats:', error)
      return {
        totalPayments: 0,
        totalAmount: 0,
        pendingPayments: 0,
        completedPayments: 0,
        failedPayments: 0
      }
    }
  }

  // Initialize Chapa payment for a task
  static async initializeChapaPayment(
    taskId: string,
    customerUserId: string,
    customerInfo: {
      email: string
      firstName: string
      lastName: string
      phone: string
    }
  ): Promise<{ checkoutUrl: string; txRef: string; breakdown: PaymentCalculation } | null> {
    try {
      // Get task details to determine amount
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, final_price, budget')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        throw new Error('Task not found')
      }

      const amount = task.final_price || task.budget || 0
      if (amount <= 0) {
        throw new Error('Invalid task amount')
      }

      // Initialize Chapa payment
      const result = await ChapaPaymentService.initializePayment(
        taskId,
        customerUserId,
        amount,
        customerInfo
      )

      if (!result || !result.checkoutUrl || !result.txRef) {
        throw new Error(result && 'error' in result ? (result as any).error : 'Failed to initialize payment')
      }

      // Calculate payment breakdown for display
      const breakdown = ChapaPaymentService.calculatePaymentBreakdown(amount)

      return {
        checkoutUrl: result.checkoutUrl,
        txRef: result.txRef,
        breakdown
      }
    } catch (error) {
      const appError = handleError(error, 'initializeChapaPayment')
      console.error('Error initializing Chapa payment:', appError)
      return null
    }
  }

  // Verify Chapa payment status
  static async verifyChapaPayment(txRef: string): Promise<{
    status: string
    amount: number
    breakdown: any
  } | null> {
    try {
      // First check Chapa directly to get the real-time status
      const verification = await ChapaPaymentService.verifyPayment(txRef)
      
      if (verification && verification.data.status === 'success') {
        // If Chapa says success, we can return completed status
        return {
          status: 'completed',
          amount: verification.data.amount,
          breakdown: verification.data.meta?.breakdown
        }
      }

      // Fallback to checking local database
      return await ChapaPaymentService.getPaymentStatus(txRef)
    } catch (error) {
      const appError = handleError(error, 'verifyChapaPayment')
      console.error('Error verifying Chapa payment:', appError)
      return null
    }
  }

  // Process Chapa payment (called after successful payment)
  static async processChapaPayment(txRef: string): Promise<boolean> {
    try {
      // Verify payment with Chapa
      const verification = await ChapaPaymentService.verifyPayment(txRef)
      if (!verification || verification.data.status !== 'success') {
        throw new Error('Payment verification failed')
      }

      // If payment successful, process wallet credit for tasker
      if (verification.data.meta?.tasker_id) {
        await ChapaPaymentService.processSuccessfulPayment(
          txRef,
          verification.data.meta.tasker_id,
          verification.data.amount,
          verification.data.meta
        ).catch(err => console.error('Error crediting tasker wallet:', err))
      }

      // Update payment status in database
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
          metadata: {
            chapa_verification: verification.data,
            payment_gateway: 'chapa'
          }
        })
        .eq('metadata->>tx_ref', txRef)

      if (updateError) throw updateError

      // Update task payment status
      const { data: transaction } = await supabase
        .from('transactions')
        .select('task_id')
        .eq('metadata->>tx_ref', txRef)
        .single()

      if (transaction?.task_id) {
        await supabase
          .from('tasks')
          .update({
            payment_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', transaction.task_id)
      }

      // Update task payment status
      const { data: payment } = await supabase
        .from('transactions')
        .select('task_id, user_id, amount')
        .eq('metadata->>tx_ref', txRef)
        .single()

      if (payment?.task_id) {
        await supabase
          .from('tasks')
          .update({
            payment_status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', payment.task_id)

        // Send success notification
        await UnifiedNotificationService.notifyPaymentProcessed(
          payment.user_id,
          payment.amount,
          'Task Payment',
          'success'
        )
      }

      return true
    } catch (error) {
      const appError = handleError(error, 'processChapaPayment')
      console.error('Error processing Chapa payment:', appError)
      return false
    }
  }

  // Get payment breakdown for display
  static calculatePaymentBreakdown(amount: number): PaymentCalculation {
    return ChapaPaymentService.calculatePaymentBreakdown(amount)
  }

  // Get tasker wallet balance
  static async getTaskerWalletBalance(taskerUserId: string): Promise<{
    balance: number
    currency: string
    isActive: boolean
  } | null> {
    try {
      return await ChapaPaymentService.getTaskerWalletBalance(taskerUserId)
    } catch (error) {
      const appError = handleError(error, 'getTaskerWalletBalance')
      console.error('Error getting tasker wallet balance:', appError)
      return null
    }
  }

  // Get tasker transaction history
  static async getTaskerTransactionHistory(taskerUserId: string): Promise<any[]> {
    try {
      return await ChapaPaymentService.getTaskerTransactionHistory(taskerUserId)
    } catch (error) {
      const appError = handleError(error, 'getTaskerTransactionHistory')
      console.error('Error getting tasker transaction history:', appError)
      return []
    }
  }

  // Request withdrawal from wallet
  static async requestWithdrawal(
    taskerUserId: string,
    amount: number,
    withdrawalMethod: 'bank_transfer' | 'mobile_money' | 'cash_pickup',
    accountDetails: any
  ): Promise<boolean> {
    try {
      return await WalletService.requestWithdrawal(
        taskerUserId,
        amount,
        withdrawalMethod,
        accountDetails
      )
    } catch (error) {
      const appError = handleError(error, 'requestWithdrawal')
      console.error('Error requesting withdrawal:', appError)
      return false
    }
  }

  // Get wallet details
  static async getWalletDetails(taskerUserId: string): Promise<{
    wallet: any
    stats: any
    recentTransactions: any[]
  }> {
    try {
      return await WalletService.getWalletDetails(taskerUserId)
    } catch (error) {
      const appError = handleError(error, 'getWalletDetails')
      console.error('Error getting wallet details:', appError)
      return {
        wallet: null,
        stats: null,
        recentTransactions: []
      }
    }
  }
}
