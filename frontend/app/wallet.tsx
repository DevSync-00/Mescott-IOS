import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { PaymentMethodService, PaymentMethod } from '../services/PaymentMethodService'
import { WithdrawalOrderService, WithdrawalOrder } from '../services/WithdrawalOrderService'
import { WalletService, Wallet as WalletType, WalletTransaction, WalletStats } from '../services/WalletService'
import PaymentMethodModal from '../components/PaymentMethodModal'
import WithdrawalModal from '../components/WithdrawalModal'
import Colors from '../constants/Colors'
import SkeletonLoader, { SkeletonList } from '../components/SkeletonLoader'

export default function WalletScreen() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [wallet, setWallet] = useState<WalletType | null>(null)
  const [walletStats, setWalletStats] = useState<WalletStats | null>(null)
  const [recentTransactions, setRecentTransactions] = useState<WalletTransaction[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [withdrawalOrders, setWithdrawalOrders] = useState<WithdrawalOrder[]>([])
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false)
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false)
  const [showAllPaymentMethods, setShowAllPaymentMethods] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadWalletData()
    }
  }, [isAuthenticated, user])

  const loadWalletData = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      
      // Load wallet details with stats and transactions
      const walletDetails = await WalletService.getWalletDetails(user.user_id)
      setWallet(walletDetails.wallet)
      setWalletStats(walletDetails.stats)
      setRecentTransactions(walletDetails.recentTransactions)
      
      // Load payment methods
      const methods = await PaymentMethodService.getPaymentMethods(user.user_id)
      setPaymentMethods(methods)
      
      // Load withdrawal orders
      const orders = await WithdrawalOrderService.getWithdrawalOrders(user.user_id)
      setWithdrawalOrders(orders)
    } catch (error) {
      console.error('Error loading wallet data:', error)
      Alert.alert('Error', 'Failed to load wallet data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadWalletData()
    setRefreshing(false)
  }

  const handlePaymentMethodAdded = (method: PaymentMethod) => {
    setPaymentMethods(prev => [method, ...prev])
  }

  const handleWithdrawalSuccess = () => {
    loadWalletData() // Refresh data
  }

  const handleSetDefault = async (methodId: string) => {
    if (!user) return
    
    try {
      await PaymentMethodService.setDefaultPaymentMethod(user.user_id, methodId)
      // Update local state
      setPaymentMethods(prev =>
        prev.map(method => ({
          ...method,
          is_default: method.id === methodId
        }))
      )
      Alert.alert('Success', 'Default payment method updated')
    } catch (error) {
      console.error('Error setting default:', error)
      Alert.alert('Error', 'Failed to set default payment method')
    }
  }

  const handleDeletePaymentMethod = async (methodId: string, methodName: string) => {
    if (!user) return
    
    Alert.alert(
      'Delete Payment Method',
      `Are you sure you want to delete ${methodName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await PaymentMethodService.deletePaymentMethod(user.user_id, methodId)
              setPaymentMethods(prev => prev.filter(method => method.id !== methodId))
              Alert.alert('Success', 'Payment method deleted')
            } catch (error) {
              console.error('Error deleting payment method:', error)
              Alert.alert('Error', 'Failed to delete payment method')
            }
          }
        }
      ]
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
    }).format(amount)
  }

  // Check if user is in tasker mode
  if (user?.current_mode !== 'tasker' && user?.role !== 'tasker' && user?.role !== 'both') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <Ionicons name="arrow-back" size={24} color={Colors.neutral[700]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="wallet-outline" size={64} color={Colors.neutral[400]} />
          <Text style={styles.errorTitle}>Wallet Not Available</Text>
          <Text style={styles.errorSubtitle}>
            Wallet is only available for taskers. Switch to tasker mode to access your wallet.
          </Text>
          <TouchableOpacity 
            style={styles.switchModeButton}
            onPress={() => router.push('/profile')}
          >
            <Text style={styles.switchModeButtonText}>Go to Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/profile')}>
            <Ionicons name="arrow-back" size={24} color={Colors.neutral[700]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wallet</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <SkeletonList count={3} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/profile')}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setShowPaymentMethodModal(true)}
        >
          <Ionicons name="add-outline" size={20} color={Colors.primary[500]} />
          <Text style={styles.addButtonText}>Add Method</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primary[500]]}
            tintColor={Colors.primary[500]}
          />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={24} color={Colors.primary[500]} />
            <Text style={styles.balanceTitle}>Wallet Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>{formatCurrency(wallet?.balance || 0)}</Text>
          <Text style={styles.balanceSubtitle}>Available for withdrawal</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={20} color={Colors.success[500]} />
            <Text style={styles.statValue}>{formatCurrency(walletStats?.totalEarnings || 0)}</Text>
            <Text style={styles.statLabel}>Total Earnings</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.primary[500]} />
            <Text style={styles.statValue}>{walletStats?.completedTasks || 0}</Text>
            <Text style={styles.statLabel}>Completed Tasks</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="arrow-up" size={20} color={Colors.warning[500]} />
            <Text style={styles.statValue}>{formatCurrency(walletStats?.totalWithdrawals || 0)}</Text>
            <Text style={styles.statLabel}>Total Withdrawals</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="calendar" size={20} color={Colors.primary[500]} />
            <Text style={styles.statValue}>{formatCurrency(walletStats?.thisMonthEarnings || 0)}</Text>
            <Text style={styles.statLabel}>This Month</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.withdrawButton]}
            onPress={() => setShowWithdrawalModal(true)}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Withdraw Funds</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionButton, styles.historyButton]}
            onPress={() => {/* Navigate to withdrawal history */}}
          >
            <Ionicons name="time" size={20} color={Colors.primary[500]} />
            <Text style={[styles.actionButtonText, styles.historyButtonText]}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Methods Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <TouchableOpacity onPress={() => setShowPaymentMethodModal(true)}>
              <Text style={styles.viewAllText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {paymentMethods.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={48} color={Colors.neutral[300]} />
              <Text style={styles.emptyTitle}>No Payment Methods</Text>
              <Text style={styles.emptySubtitle}>
                Add a payment method to withdraw your earnings
              </Text>
              <TouchableOpacity
                style={styles.addMethodButton}
                onPress={() => setShowPaymentMethodModal(true)}
              >
                <Text style={styles.addMethodButtonText}>Add Payment Method</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.paymentMethodsList}>
              {paymentMethods.slice(0, 3).map((method) => (
                <View key={method.id} style={styles.paymentMethodItem}>
                  <View style={styles.paymentMethodIcon}>
                    <Ionicons
                      name={
                        method.type === 'bank_account' ? 'card-outline' :
                        method.type === 'mobile_money' ? 'phone-portrait-outline' :
                        'location-outline'
                      }
                      size={20}
                      color={Colors.primary[500]}
                    />
                  </View>
                  <View style={styles.paymentMethodInfo}>
                    <Text style={styles.paymentMethodName}>{method.display_name}</Text>
                    <Text style={styles.paymentMethodType}>
                      {method.type === 'bank_account' ? 'Bank Account' :
                       method.type === 'mobile_money' ? 'Mobile Money' :
                       'Cash Pickup'}
                    </Text>
                  </View>
                  <View style={styles.paymentMethodActions}>
                    {method.is_default ? (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultText}>Default</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.setDefaultButton}
                        onPress={() => handleSetDefault(method.id)}
                      >
                        <Text style={styles.setDefaultText}>Set Default</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePaymentMethod(method.id, method.display_name || 'this method')}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.error[500]} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              {paymentMethods.length > 3 && (
                <TouchableOpacity 
                  style={styles.viewAllMethods}
                  onPress={() => setShowAllPaymentMethods(true)}
                >
                  <Text style={styles.viewAllMethodsText}>
                    View All ({paymentMethods.length})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Transactions</Text>
            <TouchableOpacity>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={48} color={Colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No Transactions Yet</Text>
            <Text style={styles.emptySubtitle}>
              Your transaction history will appear here once you start earning.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Payment Method Modal */}
      <PaymentMethodModal
        visible={showPaymentMethodModal}
        onClose={() => setShowPaymentMethodModal(false)}
        onPaymentMethodAdded={handlePaymentMethodAdded}
        userId={user?.user_id || ''}
      />

      {/* Withdrawal Modal */}
      <WithdrawalModal
        visible={showWithdrawalModal}
        onClose={() => setShowWithdrawalModal(false)}
        onWithdrawalSuccess={handleWithdrawalSuccess}
        currentBalance={wallet?.balance || 0}
        userId={user?.user_id || ''}
      />

      {/* All Payment Methods Modal */}
      <Modal
        visible={showAllPaymentMethods}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAllPaymentMethods(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAllPaymentMethods(false)}>
              <Ionicons name="close" size={24} color={Colors.neutral[700]} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Payment Methods</Text>
            <TouchableOpacity onPress={() => {
              setShowAllPaymentMethods(false)
              setShowPaymentMethodModal(true)
            }}>
              <Ionicons name="add" size={24} color={Colors.primary[500]} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            {paymentMethods.map((method) => (
              <View key={method.id} style={styles.fullPaymentMethodItem}>
                <View style={styles.paymentMethodIcon}>
                  <Ionicons
                    name={
                      method.type === 'bank_account' ? 'card-outline' :
                      method.type === 'mobile_money' ? 'phone-portrait-outline' :
                      'location-outline'
                    }
                    size={24}
                    color={Colors.primary[500]}
                  />
                </View>
                <View style={styles.fullPaymentMethodInfo}>
                  <Text style={styles.paymentMethodName}>{method.display_name}</Text>
                  <Text style={styles.paymentMethodType}>
                    {method.type === 'bank_account' ? 'Bank Account' :
                     method.type === 'mobile_money' ? 'Mobile Money' :
                     'Cash Pickup'}
                  </Text>
                  {method.withdrawal_details?.account_holder_name && (
                    <Text style={styles.accountHolderName}>
                      {method.withdrawal_details.account_holder_name}
                    </Text>
                  )}
                </View>
                <View style={styles.fullPaymentMethodActions}>
                  {method.is_default ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultText}>Default</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.setDefaultButtonLarge}
                      onPress={() => handleSetDefault(method.id)}
                    >
                      <Text style={styles.setDefaultTextLarge}>Set Default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.deleteButtonLarge}
                    onPress={() => handleDeletePaymentMethod(method.id, method.display_name || 'this method')}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.error[500]} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            
            {paymentMethods.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="card-outline" size={64} color={Colors.neutral[300]} />
                <Text style={styles.emptyTitle}>No Payment Methods</Text>
                <Text style={styles.emptySubtitle}>
                  Add a payment method to withdraw your earnings
                </Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  headerRight: {
    width: 24,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary[500],
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.neutral[600],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[700],
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 16,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  switchModeButton: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  switchModeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  balanceCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  balanceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginLeft: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.primary[600],
    marginBottom: 4,
  },
  balanceSubtitle: {
    fontSize: 14,
    color: Colors.neutral[500],
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    marginRight: '2%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.neutral[700],
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.neutral[500],
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  withdrawButton: {
    backgroundColor: Colors.primary[500],
  },
  historyButton: {
    backgroundColor: Colors.primary[50],
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    color: '#fff',
  },
  historyButtonText: {
    color: Colors.primary[600],
  },
  section: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  viewAllText: {
    fontSize: 14,
    color: Colors.primary[500],
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[600],
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  addMethodButton: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addMethodButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentMethodsList: {
    gap: 12,
  },
  paymentMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.background.primary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  paymentMethodIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  paymentMethodInfo: {
    flex: 1,
  },
  paymentMethodName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.neutral[700],
    marginBottom: 2,
  },
  paymentMethodType: {
    fontSize: 12,
    color: Colors.neutral[500],
  },
  paymentMethodActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  defaultBadge: {
    backgroundColor: Colors.success[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  defaultText: {
    fontSize: 10,
    color: Colors.success[600],
    fontWeight: '500',
  },
  setDefaultButton: {
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  setDefaultText: {
    fontSize: 10,
    color: Colors.primary[600],
    fontWeight: '500',
  },
  deleteButton: {
    padding: 4,
  },
  viewAllMethods: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  viewAllMethodsText: {
    fontSize: 14,
    color: Colors.primary[500],
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
    backgroundColor: Colors.background.primary,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  fullPaymentMethodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  fullPaymentMethodInfo: {
    flex: 1,
  },
  accountHolderName: {
    fontSize: 11,
    color: Colors.neutral[400],
    marginTop: 2,
  },
  fullPaymentMethodActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  setDefaultButtonLarge: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  setDefaultTextLarge: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  deleteButtonLarge: {
    padding: 6,
  },
})