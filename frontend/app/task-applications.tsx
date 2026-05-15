import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal, Image } from 'react-native'
import SkeletonLoader, { SkeletonList } from '../components/SkeletonLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { TaskApplicationService, TaskApplication } from '../services/TaskApplicationService'
import { ProfileService } from '../services/ProfileService'
import TaskerProfileView from '../components/TaskerProfileView'
import Colors from '../constants/Colors'

export default function TaskApplications() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { taskId } = useLocalSearchParams()
  const [applications, setApplications] = useState<TaskApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [profileModalVisible, setProfileModalVisible] = useState(false)
  const [selectedTaskerId, setSelectedTaskerId] = useState<string | null>(null)
  const [processingApplication, setProcessingApplication] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    } else if (isAuthenticated && taskId) {
      loadApplications()
    }
  }, [isAuthenticated, taskId, isLoading])

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.loadingContainer}>
          <SkeletonList count={3} />
        </View>
      </SafeAreaView>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const loadApplications = async () => {
    if (!taskId || typeof taskId !== 'string') return
    
    try {
      setLoading(true)
      const data = await TaskApplicationService.getTaskApplications(taskId)
      setApplications(data)
    } catch (error) {
      console.error('Error loading applications:', error)
      Alert.alert('Error', 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  const handleAcceptApplication = async (applicationId: string) => {
    Alert.alert(
      'Accept Application',
      'Are you sure you want to accept this application? This will assign the task to this tasker.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setProcessingApplication(applicationId)
            try {
              const success = await TaskApplicationService.acceptApplication(taskId as string, applicationId)
              if (success) {
                Alert.alert('Success', 'Application accepted successfully!')
                loadApplications()
              } else {
                Alert.alert('Error', 'Failed to accept application')
              }
            } catch (error) {
              Alert.alert('Error', 'An error occurred while accepting the application')
            } finally {
              setProcessingApplication(null)
            }
          }
        }
      ]
    )
  }

  const handleRejectApplication = async (applicationId: string) => {
    Alert.alert(
      'Reject Application',
      'Are you sure you want to reject this application?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setProcessingApplication(applicationId)
            try {
              const success = await TaskApplicationService.rejectApplication(applicationId)
              if (success) {
                Alert.alert('Success', 'Application rejected successfully!')
                loadApplications()
              } else {
                Alert.alert('Error', 'Failed to reject application')
              }
            } catch (error) {
              Alert.alert('Error', 'An error occurred while rejecting the application')
            } finally {
              setProcessingApplication(null)
            }
          }
        }
      ]
    )
  }

  const handleViewProfile = (taskerId: string) => {
    setSelectedTaskerId(taskerId)
    setProfileModalVisible(true)
  }

  const closeProfileModal = () => {
    setProfileModalVisible(false)
    setSelectedTaskerId(null)
  }

  const handleBackPress = () => {
    // Return to list context rather than old full task-detail page
    router.push('/jobs')
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return Colors.warning[500]
      case 'accepted': return Colors.success[500]
      case 'rejected': return Colors.error[500]
      case 'withdrawn': return Colors.neutral[500]
      default: return Colors.neutral[500]
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'accepted': return 'Accepted'
      case 'rejected': return 'Rejected'
      case 'withdrawn': return 'Withdrawn'
      default: return 'Unknown'
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Applications</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <SkeletonList count={3} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Applications</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true} 
        bounces={false} 
        alwaysBounceVertical={false} 
        overScrollMode="never"
      >
        {applications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={Colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No Applications Yet</Text>
            <Text style={styles.emptySubtitle}>
              Applications for this task will appear here when taskers apply.
            </Text>
          </View>
        ) : (
          <View style={styles.applicationsList}>
            {applications.map((application) => (
              <View key={application.id} style={styles.applicationCard}>
                <View style={styles.applicationHeader}>
                  <View style={styles.taskerInfo}>
                    <View style={styles.avatar}>
                      {application.tasker_avatar ? (
                        <Image
                          source={{ uri: application.tasker_avatar }}
                          style={styles.avatarImage}
                        />
                      ) : (
                        <Text style={styles.avatarText}>
                          {application.tasker_name?.charAt(0)?.toUpperCase() || 'T'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.taskerDetails}>
                      <Text style={styles.taskerName}>{application.tasker_name || 'Unknown Tasker'}</Text>
                      <Text style={styles.applicationDate}>
                        Applied {new Date(application.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(application.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(application.status) }]}>
                      {getStatusLabel(application.status)}
                    </Text>
                  </View>
                </View>

                {application.message && (
                  <View style={styles.messageContainer}>
                    <Text style={styles.messageLabel}>Message:</Text>
                    <Text style={styles.messageText}>{application.message}</Text>
                  </View>
                )}

                {application.proposed_price && (
                  <View style={styles.budgetContainer}>
                    <Text style={styles.budgetLabel}>Proposed Price:</Text>
                    <Text style={styles.budgetAmount}>${application.proposed_price}</Text>
                  </View>
                )}

                {/* View Profile Button */}
                <View style={styles.profileButtonContainer}>
                  <TouchableOpacity
                    style={styles.viewProfileButton}
                    onPress={() => handleViewProfile(application.tasker_id)}
                  >
                    <Ionicons name="person-outline" size={16} color={Colors.primary[500]} />
                    <Text style={styles.viewProfileButtonText}>View Profile</Text>
                  </TouchableOpacity>
                </View>

                {application.status === 'pending' && (
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.rejectButton, processingApplication === application.id && styles.processingButton]}
                      onPress={() => handleRejectApplication(application.id)}
                      disabled={processingApplication === application.id}
                    >
                      {processingApplication === application.id ? (
                        <ActivityIndicator size="small" color={Colors.error[500]} />
                      ) : (
                        <Ionicons name="close" size={16} color={Colors.error[500]} />
                      )}
                      <Text style={styles.rejectButtonText}>
                        {processingApplication === application.id ? 'Rejecting...' : 'Reject'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptButton, processingApplication === application.id && styles.processingButton]}
                      onPress={() => handleAcceptApplication(application.id)}
                      disabled={processingApplication === application.id}
                    >
                      {processingApplication === application.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                      <Text style={styles.acceptButtonText}>
                        {processingApplication === application.id ? 'Accepting...' : 'Accept'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Enhanced Tasker Profile Modal */}
      <TaskerProfileView
        taskerId={selectedTaskerId || ''}
        visible={profileModalVisible}
        onClose={closeProfileModal}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[900],
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 20,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.neutral[600],
    textAlign: 'center',
    lineHeight: 24,
  },
  applicationsList: {
    padding: 20,
  },
  applicationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  applicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  taskerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  taskerDetails: {
    flex: 1,
  },
  taskerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  applicationDate: {
    fontSize: 14,
    color: Colors.neutral[600],
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  messageContainer: {
    marginBottom: 16,
  },
  messageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: Colors.neutral[600],
    lineHeight: 20,
  },
  budgetContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  budgetAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary[500],
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.error[300],
    backgroundColor: Colors.error[50],
    gap: 4,
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error[500],
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: Colors.success[500],
    gap: 4,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Profile Button Styles
  profileButtonContainer: {
    marginVertical: 12,
  },
  viewProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  viewProfileButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary[500],
    marginLeft: 6,
  },
  processingButton: {
    opacity: 0.7,
  },
})
