import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { PaymentService } from '../services/PaymentService'
import Colors from '../constants/Colors'
import SkeletonLoader from '../components/SkeletonLoader'

export default function PaymentSuccessScreen() {
  const { tx_ref } = useLocalSearchParams<{ tx_ref: string }>()
  const [loading, setLoading] = useState(true)
  const [paymentStatus, setPaymentStatus] = useState<{
    status: string
    amount: number
    breakdown: any
  } | null>(null)

  useEffect(() => {
    if (tx_ref) {
      verifyPayment()
    } else {
      Alert.alert('Error', 'Invalid payment reference')
      router.replace('/')
    }
  }, [tx_ref])

  const verifyPayment = async () => {
    if (!tx_ref) return

    try {
      setLoading(true)
      const status = await PaymentService.verifyChapaPayment(tx_ref)
      
      if (status) {
        setPaymentStatus(status)
        
        if (status.status === 'completed') {
          // Process the payment
          await PaymentService.processChapaPayment(tx_ref)
        }
      } else {
        Alert.alert('Error', 'Unable to verify payment status')
      }
    } catch (error) {
      console.error('Error verifying payment:', error)
      Alert.alert('Error', 'Failed to verify payment')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle'
      case 'failed':
        return 'close-circle'
      case 'pending':
        return 'time'
      default:
        return 'help-circle'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return Colors.success[500]
      case 'failed':
        return Colors.error[500]
      case 'pending':
        return Colors.warning[500]
      default:
        return Colors.neutral[500]
    }
  }

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Payment Successful!'
      case 'failed':
        return 'Payment Failed'
      case 'pending':
        return 'Payment Pending'
      default:
        return 'Unknown Status'
    }
  }

  const handleContinue = () => {
    if (paymentStatus?.status === 'completed') {
      router.replace('/')
    } else {
      router.back()
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <SkeletonLoader width={60} height={60} borderRadius={30} style={{ marginBottom: 16 }} />
          <SkeletonLoader width={200} height={20} />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Status Icon */}
        <View style={styles.iconContainer}>
          <Ionicons 
            name={getStatusIcon(paymentStatus?.status || 'unknown')} 
            size={80} 
            color={getStatusColor(paymentStatus?.status || 'unknown')} 
          />
        </View>

        {/* Status Message */}
        <Text style={styles.statusTitle}>
          {getStatusMessage(paymentStatus?.status || 'unknown')}
        </Text>

        {/* Payment Details */}
        {paymentStatus && (
          <View style={styles.detailsCard}>
            <Text style={styles.detailsTitle}>Payment Details</Text>
            
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount:</Text>
              <Text style={styles.detailValue}>
                {formatCurrency(paymentStatus.amount)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text style={[
                styles.detailValue,
                { color: getStatusColor(paymentStatus.status) }
              ]}>
                {paymentStatus.status.charAt(0).toUpperCase() + paymentStatus.status.slice(1)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Transaction ID:</Text>
              <Text style={styles.detailValue}>{tx_ref}</Text>
            </View>

            {paymentStatus.breakdown && (
              <>
                <View style={styles.divider} />
                <Text style={styles.breakdownTitle}>Payment Breakdown</Text>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Subtotal:</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(paymentStatus.breakdown.subtotal)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>VAT (15%):</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(paymentStatus.breakdown.vat)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Platform Fee (5%):</Text>
                  <Text style={styles.detailValue}>
                    {formatCurrency(paymentStatus.breakdown.platformFee)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Total:</Text>
                  <Text style={[styles.detailValue, styles.totalAmount]}>
                    {formatCurrency(paymentStatus.breakdown.total)}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {paymentStatus?.status === 'completed' ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
              
              <Text style={styles.successMessage}>
                Your payment has been processed successfully. The tasker will receive their payment shortly.
              </Text>
            </>
          ) : paymentStatus?.status === 'failed' ? (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </TouchableOpacity>
              
              <Text style={styles.errorMessage}>
                Your payment could not be processed. Please try again or contact support.
              </Text>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={handleContinue}>
                <Ionicons name="arrow-back" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Go Back</Text>
              </TouchableOpacity>
              
              <Text style={styles.pendingMessage}>
                Your payment is being processed. You will be notified once it's completed.
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.neutral[600],
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    textAlign: 'center',
    marginBottom: 32,
  },
  detailsCard: {
    backgroundColor: Colors.background.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 14,
    color: Colors.neutral[600],
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.neutral[900],
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.primary[500],
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border.light,
    marginVertical: 16,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 12,
  },
  buttonContainer: {
    gap: 16,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary[500],
    borderRadius: 12,
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successMessage: {
    fontSize: 14,
    color: Colors.success[700],
    textAlign: 'center',
    lineHeight: 20,
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.error[700],
    textAlign: 'center',
    lineHeight: 20,
  },
  pendingMessage: {
    fontSize: 14,
    color: Colors.warning[700],
    textAlign: 'center',
    lineHeight: 20,
  },
})
