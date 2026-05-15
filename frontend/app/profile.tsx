import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { TaskService } from '../services/TaskService'
import { RatingService } from '../services/RatingService'
import { WalletService } from '../services/WalletService'
import Colors from '../constants/Colors'
import { supabase } from '../lib/supabase'
import SkeletonLoader, { SkeletonCard } from '../components/SkeletonLoader'

export default function Profile() {
  const { user, logout, switchMode, isAuthenticated, isLoading, refreshUserProfile } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState({
    tasksCompleted: 0,
    rating: 0,
    earned: 0,
  })
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  const formatCurrency = (amount: number): { symbol: string; number: string } => {
    // Format as ETB (Ethiopian Birr)
    const formatted = new Intl.NumberFormat('en-ET', {
      style: 'currency',
      currency: 'ETB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
    // Split the currency symbol and number
    const parts = formatted.split(/\s+/)
    return {
      symbol: 'ETB',
      number: parts[parts.length - 1] || formatted
    }
  }

  const loadProfileStats = useCallback(async () => {
    if (!user?.user_id) {
      setLoadingStats(false)
      return
    }

    try {
      setLoadingStats(true)

      // Get user's profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.user_id)
        .maybeSingle()

      if (!profile) {
        setStats({ tasksCompleted: 0, rating: 0, earned: 0 })
        setLoadingStats(false)
        return
      }

      // Fetch stats in parallel
      const [taskStats, rating, walletStats] = await Promise.all([
        // Get tasks completed as tasker
        supabase
          .from('tasks')
          .select('id, status, final_price')
          .eq('tasker_id', profile.id)
          .eq('status', 'completed'),
        
        // Get average rating as tasker
        RatingService.getTechnicianAverageRating(profile.id),
        
        // Get wallet stats for earnings
        WalletService.getWalletStats(user.user_id),
      ])

      const completedTasks = taskStats.data || []
      const tasksCompleted = completedTasks.length
      const averageRating = rating || 0
      const totalEarnings = walletStats.totalEarnings || 0

      setStats({
        tasksCompleted,
        rating: averageRating,
        earned: totalEarnings,
      })
    } catch (error) {
      console.error('Error loading profile stats:', error)
      setStats({ tasksCompleted: 0, rating: 0, earned: 0 })
    } finally {
      setLoadingStats(false)
    }
  }, [user?.user_id])

  useEffect(() => {
    if (user && isAuthenticated) {
      loadProfileStats()
    }
  }, [user, isAuthenticated, loadProfileStats])

  // Real-time subscription for profile updates
  useEffect(() => {
    if (!user) return

    const subscription = supabase
      .channel('profile-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          refreshUserProfile()
          loadProfileStats() // Refresh stats when profile updates
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasker_applications',
          filter: `user_id=eq.${user.user_id}`
        },
        (payload) => {
          refreshUserProfile()
          loadProfileStats() // Refresh stats when application updates
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `tasker_id=eq.${user.id}`
        },
        (payload) => {
          loadProfileStats() // Refresh stats when tasks update
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ratings',
        },
        (payload) => {
          loadProfileStats() // Refresh stats when ratings update
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${user.user_id}`
        },
        (payload) => {
          loadProfileStats() // Refresh stats when transactions update
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [user, refreshUserProfile, loadProfileStats])

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} bounces={false} alwaysBounceVertical={false} overScrollMode="never">
          <SkeletonCard style={styles.profileSkeleton} />
          <SkeletonCard style={styles.statsSkeleton} />
          <SkeletonCard style={styles.actionsSkeleton} />
        </ScrollView>
      </View>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Please log in to view your profile</Text>
        </View>
      </View>
    )
  }

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout()
            } catch (error) {
              Alert.alert('Error', 'Failed to logout. Please try again.')
            }
          }
        }
      ]
    )
  }

  const handleSwitchMode = async () => {
    if (!user) return
    
    // Check if user is already a tasker
    if (user.role === 'tasker' || user.role === 'both') {
      try {
        const currentMode = user.current_mode
        const newMode = currentMode === 'customer' ? 'tasker' : 'customer'
        await switchMode()
        Alert.alert('Success', `Switched to ${newMode} mode!`)
      } catch (error) {
        Alert.alert('Error', 'Failed to switch mode. Please try again.')
      }
    } else {
      // User needs to become a tasker first
      Alert.alert(
        'Become a Tasker',
        'To switch to tasker mode, you need to complete the tasker application process. Would you like to apply now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Apply Now', 
            onPress: () => router.push('/tasker-application')
          }
        ]
      )
    }
  }

  const handleBecomeTasker = () => {
    if (!user) return
    
    if (user.role === 'tasker' || user.role === 'both') {
      Alert.alert('Already a Tasker', 'You are already registered as a tasker!')
      return
    }
    
    if (user.tasker_application_status === 'pending') {
      Alert.alert(
        'Application Pending',
        'Your tasker application is currently under review. You will be notified once it\'s approved.',
        [{ text: 'OK' }]
      )
      return
    }
    
    if (user.tasker_application_status === 'rejected') {
      Alert.alert(
        'Reapply for Tasker',
        'Your previous application was rejected. Would you like to submit a new application?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Reapply', 
            onPress: () => router.push('/tasker-application')
          }
        ]
      )
      return
    }
    
    router.push('/tasker-application')
  }

  const handleMenuPress = (itemId: string) => {
    switch (itemId) {
      case 'edit-profile':
        router.push('/edit-profile')
        break
      case 'portfolio':
        router.push('/tasker-portfolio')
        break
      case 'wallet':
        router.push('/wallet')
        break
      case 'settings':
        router.push('/settings')
        break
      case 'notifications':
        router.push('/notifications')
        break
      case 'help':
        Alert.alert('Help & Support', 'For support, please contact us at support@mescott.com')
        break
      case 'about':
        Alert.alert('About Mescott', 'Version 1.0.0\nYour trusted marketplace for local services')
        break
      default:
        break
    }
  }

  const handleEditProfile = () => {
    router.push('/edit-profile')
  }

  const menuItems = [
    {
      id: 'edit-profile',
      title: 'Edit Profile',
      icon: 'person-outline',
      color: Colors.primary[500],
    },
    // Only show portfolio for taskers
    ...(user?.current_mode === 'tasker' || (user?.role === 'tasker' && user?.current_mode !== 'customer') || user?.role === 'both' ? [{
      id: 'portfolio',
      title: 'My Portfolio',
      icon: 'briefcase-outline',
      color: Colors.primary[500],
    }] : []),
    // Only show wallet for taskers (not customers)
    ...(user?.current_mode === 'tasker' || (user?.role === 'tasker' && user?.current_mode !== 'customer') || user?.role === 'both' ? [{
      id: 'wallet',
      title: 'Wallet',
      icon: 'wallet-outline',
      color: Colors.success[500],
    }] : []),
    {
      id: 'settings',
      title: 'Settings',
      icon: 'settings-outline',
      color: Colors.neutral[600],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: 'notifications-outline',
      color: Colors.warning[500],
    },
    {
      id: 'help',
      title: 'Help & Support',
      icon: 'help-circle-outline',
      color: Colors.primary[500],
    },
    {
      id: 'about',
      title: 'About',
      icon: 'information-circle-outline',
      color: Colors.neutral[500],
    },
  ]

  const scrollViewRef = useRef<ScrollView>(null)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Fixed Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
              <Ionicons name="create-outline" size={22} color={Colors.neutral[600]} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {/* Scrollable content */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 120 }}
        bounces={true}
        alwaysBounceVertical={true}
        showsVerticalScrollIndicator={false}
        overScrollMode="always"
        scrollEventThrottle={16}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatarContainer}>
              {user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  style={styles.avatar}
                />
              ) : (
                <Ionicons name="person" size={32} color={Colors.primary[500]} />
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name || user?.username || 'Guest User'}</Text>
              <Text style={styles.profilePhone}>{user?.phone || '+251 9X XXX XXXX'}</Text>
              <View style={styles.modeContainer}>
                <View style={[styles.modeBadge, { backgroundColor: Colors.primary[100] }]}>
                  <Ionicons 
                    name={user?.current_mode === 'customer' ? 'person' : 'briefcase'}
                    size={16}
                    color={Colors.primary[600]}
                  />
                  <Text style={styles.modeText}>
                    {user?.current_mode === 'customer' ? 'Customer' : 'Tasker'} Mode
                  </Text>
                </View>
                <TouchableOpacity style={styles.switchButton} onPress={handleSwitchMode}>
                  <Ionicons name="swap-horizontal" size={18} color={Colors.primary[500]} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              {loadingStats ? (
                <ActivityIndicator size="small" color={Colors.primary[500]} />
              ) : (
                <Text style={styles.statNumber}>{stats.tasksCompleted}</Text>
              )}
              <Text style={styles.statLabel}>Tasks Completed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              {loadingStats ? (
                <ActivityIndicator size="small" color={Colors.primary[500]} />
              ) : (
                <Text style={styles.statNumber}>
                  {stats.rating > 0 ? stats.rating.toFixed(1) : '0.0'}
                </Text>
              )}
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              {loadingStats ? (
                <ActivityIndicator size="small" color={Colors.primary[500]} />
              ) : (
                (() => {
                  const currency = formatCurrency(stats.earned)
                  return (
                    <View style={styles.currencyContainer}>
                      <Text style={styles.currencySymbol}>{currency.symbol}</Text>
                      <Text style={styles.statNumber}>{currency.number}</Text>
                    </View>
                  )
                })()
              )}
              <Text style={styles.statLabel}>Earned</Text>
            </View>
          </View>
        </View>

        {/* Tasker Application Status / Role Switch */}
        {user && (
          <View style={styles.becomeTaskerSection}>
            {user.tasker_application_status === 'pending' ? (
              // Application Under Review
              <View style={styles.applicationStatusBanner}>
                <Ionicons name="time" size={24} color={Colors.warning[500]} />
                <View style={styles.applicationStatusContent}>
                  <Text style={styles.applicationStatusTitle}>Application Under Review</Text>
                  <Text style={styles.applicationStatusSubtitle}>Your tasker application is being reviewed. You'll be notified once approved.</Text>
                </View>
              </View>
            ) : user.tasker_application_status === 'approved' && (user.role === 'tasker' || user.role === 'both') ? (
              // Application Approved - Show role switch
              <TouchableOpacity style={styles.approvedStatusBanner} onPress={handleSwitchMode}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success[500]} />
                <View style={styles.applicationStatusContent}>
                  <Text style={styles.approvedStatusTitle}>Application Approved!</Text>
                  <Text style={styles.approvedStatusSubtitle}>
                    You're now a tasker! {user.current_mode === 'customer' ? 'Switch to tasker mode to start earning.' : 'You are currently in tasker mode.'}
                  </Text>
                </View>
                <Ionicons name="swap-horizontal" size={20} color={Colors.success[500]} />
              </TouchableOpacity>
            ) : user.tasker_application_status === 'approved' ? (
              // Application approved but role not updated yet
              <View style={styles.approvedStatusBanner}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success[500]} />
                <View style={styles.applicationStatusContent}>
                  <Text style={styles.approvedStatusTitle}>Application Approved!</Text>
                  <Text style={styles.approvedStatusSubtitle}>
                    Your application has been approved! Please restart the app to update your profile.
                  </Text>
                </View>
              </View>
            ) : user.tasker_application_status === 'rejected' ? (
              // Application Rejected - Show reapply option
              <TouchableOpacity style={styles.rejectedStatusBanner} onPress={handleBecomeTasker}>
                <Ionicons name="close-circle" size={24} color={Colors.error[500]} />
                <View style={styles.applicationStatusContent}>
                  <Text style={styles.rejectedStatusTitle}>Application Rejected</Text>
                  <Text style={styles.rejectedStatusSubtitle}>Your tasker application was not approved. Tap to reapply.</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={Colors.error[500]} />
              </TouchableOpacity>
            ) : (
              // Become Tasker Button
              <TouchableOpacity style={styles.becomeTaskerButton} onPress={handleBecomeTasker}>
                <Ionicons name="briefcase" size={24} color="#fff" />
                <View style={styles.becomeTaskerContent}>
                  <Text style={styles.becomeTaskerTitle}>Become a Tasker</Text>
                  <Text style={styles.becomeTaskerSubtitle}>Start earning by completing tasks</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account</Text>
          {menuItems.map((item, index) => (
            <TouchableOpacity 
              key={item.id} 
              style={index === menuItems.length - 1 ? styles.lastMenuItem : styles.menuItem}
              onPress={() => handleMenuPress(item.id)}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIcon, { backgroundColor: item.color + '20' }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.color} />
                </View>
                <Text style={styles.menuText}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
            </TouchableOpacity>
          ))}
        </View>

        {/* App Info */}
        <View style={styles.appInfoSection}>
          <Text style={styles.appName}>Mescott</Text>
          <Text style={styles.appVersion}>Version 1.0.0</Text>
          <Text style={styles.appDescription}>
            Your trusted marketplace for local services
          </Text>
        </View>
                
        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error[500]} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* Bottom Spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 100, // Increased to prevent content cutoff
    flexGrow: 1, // Ensure content can grow to fill available space
  },
  header: {
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: Colors.background.primary,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: Colors.border.light,
    marginBottom: 24,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginBottom: 12,
  },
  modeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 12,
  },
  modeText: {
    fontSize: 12,
    color: Colors.primary[600],
    marginLeft: 6,
    fontWeight: '600',
  },
  switchButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    marginTop: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 4,
    textAlign: 'center',
  },
  currencyContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  currencySymbol: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginRight: 4,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.neutral[600],
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.border.light,
    marginHorizontal: 16,
  },
  menuSection: {
    backgroundColor: Colors.background.primary,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
    borderRadius: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  lastMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 20,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    fontSize: 16,
    color: Colors.neutral[900],
    fontWeight: '500',
  },
  appInfoSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 24,
  },
  appName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.primary[500],
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 14,
    color: Colors.neutral[500],
    marginBottom: 8,
  },
  appDescription: {
    fontSize: 12,
    color: Colors.neutral[400],
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background.primary,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 20,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error[200],
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    color: Colors.error[500],
    fontWeight: '600',
  },
  bottomSpacing: {
    height: 20,
  },
  becomeTaskerSection: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 24,
  },
  becomeTaskerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 12,
    shadowColor: Colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  becomeTaskerContent: {
    flex: 1,
  },
  becomeTaskerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  becomeTaskerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  applicationStatusBanner: {
    backgroundColor: Colors.warning[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.warning[200],
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  applicationStatusContent: {
    flex: 1,
  },
  applicationStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.warning[700],
    marginBottom: 2,
  },
  applicationStatusSubtitle: {
    fontSize: 14,
    color: Colors.warning[600],
  },
  approvedStatusBanner: {
    backgroundColor: Colors.success[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success[200],
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  approvedStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.success[700],
    marginBottom: 2,
  },
  approvedStatusSubtitle: {
    fontSize: 14,
    color: Colors.success[600],
  },
  rejectedStatusBanner: {
    backgroundColor: Colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error[200],
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  rejectedStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.error[700],
    marginBottom: 2,
  },
  rejectedStatusSubtitle: {
    fontSize: 14,
    color: Colors.error[600],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.neutral[600],
    marginTop: 10,
  },
  profileSkeleton: {
    marginBottom: 20,
  },
  statsSkeleton: {
    marginBottom: 20,
  },
  actionsSkeleton: {
    marginBottom: 20,
  },
})