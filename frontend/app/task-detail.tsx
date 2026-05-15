import React, { useState, useEffect } from 'react'
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert,
  Dimensions,
  Image,
  FlatList,
  Modal,
  StatusBar
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { TaskService, Task } from '../services/TaskService'
import { TaskApplicationService } from '../services/TaskApplicationService'
import { PaymentService } from '../services/PaymentService'
import ChapaPaymentModal from '../components/ChapaPaymentModal'
import TaskStatusManager from '../components/TaskStatusManager'
import Header from '../components/Header'
import Colors from '../constants/Colors'
import SkeletonLoader, { SkeletonCard } from '../components/SkeletonLoader'

const { width } = Dimensions.get('window')

export default function TaskDetail() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { taskId } = useLocalSearchParams()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasApplied, setHasApplied] = useState(false)
  const [applying, setApplying] = useState(false)
  const [imageModalVisible, setImageModalVisible] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [pendingPayments, setPendingPayments] = useState<any[]>([])
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState<any>(null)

  useEffect(() => {
    // Only redirect to auth if we're sure the user is not authenticated
    // and we're not still loading the auth state
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
      return
    }
    
    if (isAuthenticated && taskId) {
      loadTaskDetails()
      loadPendingPayments()
    }
  }, [taskId, isAuthenticated, isLoading])

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: 16 }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const handleImagePress = (index: number) => {
    setSelectedImageIndex(index)
    setImageModalVisible(true)
  }

  const closeImageModal = () => {
    setImageModalVisible(false)
  }

  const loadTaskDetails = async () => {
    if (!taskId || !user) return

    
    setLoading(true)
    try {
      // Get task details
      const taskDetails = await TaskService.getTaskById(taskId as string)
      setTask(taskDetails)

      // Check if user has already applied (only for taskers)
      if (user.role === 'tasker' || user.role === 'both') {
        const applied = await TaskApplicationService.hasUserAppliedToTask(user.user_id, taskId as string)
        setHasApplied(applied)
      }
    } catch (error) {
      console.error('Error loading task details:', error)
      Alert.alert('Error', 'Failed to load task details')
    } finally {
      setLoading(false)
    }
  }

  const loadPendingPayments = async () => {
    if (!user) return

    try {
      const payments = await PaymentService.getPendingPayments(user.id)
      setPendingPayments(payments)
    } catch (error) {
      console.error('Error loading pending payments:', error)
    }
  }

  const hasPendingPayment = (task: Task) => {
    const hasPayment = pendingPayments.some(p => p.task_id === task.id)
    console.log('🔍 Payment Debug:', {
      taskId: task.id,
      taskStatus: task.status,
      pendingPayments: pendingPayments.length,
      hasPayment,
      payments: pendingPayments.map(p => ({ task_id: p.task_id, amount: p.amount }))
    })
    return hasPayment
  }

  const handlePayNow = async (task: Task) => {
    if (!user || !task.id) return

    // Find the pending payment for this task
    const pendingPayment = pendingPayments.find(p => p.task_id === task.id)
    
    if (!pendingPayment) {
      Alert.alert('Error', 'No pending payment found for this task')
      return
    }

    // Get customer info for Chapa payment
    const customerInfo = {
      email: user.profile?.email || 'customer@mescott.com',
      firstName: user.name?.split(' ')[0] || 'Customer',
      lastName: user.name?.split(' ').slice(1).join(' ') || 'User',
      phone: user.phone || '+251911234567'
    }

    console.log('Customer Info for Payment:', customerInfo)
    console.log('User Data:', { email: user.profile?.email, name: user.name, phone: user.phone })

    setSelectedPayment(pendingPayment)
    setShowPaymentModal(true)
  }

  const handlePaymentSuccess = (payment: any) => {
    loadPendingPayments() // Reload pending payments
    loadTaskDetails() // Reload task details to update status
    setShowPaymentModal(false)
    setSelectedPayment(null)
  }

  const handleEditTask = () => {
    if (!task || !user) return
    
    router.push({
      pathname: '/post-task',
      params: { 
        taskId: task.id,
        editMode: 'true'
      }
    })
  }

  const handleDeleteTask = () => {
    if (!task || !user) return

    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await TaskService.deleteTask(task.id, user.id)
              Alert.alert('Success', 'Task deleted successfully')
              router.push('/jobs')
            } catch (error: any) {
              console.error('Error deleting task:', error)
              // Fallback: if deletion is restricted by DB policy (e.g., published/applications), cancel the task instead
              try {
                await TaskService.updateTask(task.id, user.id, { status: 'cancelled' } as any)
                Alert.alert('Task Cancelled', 'The task could not be deleted, so it was cancelled instead.')
                router.push('/jobs')
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to delete or cancel task')
              }
            }
          }
        }
      ]
    )
  }

  const handleApply = async () => {
    if (!user || !task) return

    // Check if this is the user's own task
    if (task.customer_id === user.id) {
      // If task is completed, handle payment
      if (task.status === 'completed') {
        // Check if there's a pending payment
        if (hasPendingPayment(task)) {
          handlePayNow(task)
        } else {
          // If no pending payment found, reload payments and try again
          await loadPendingPayments()
          if (hasPendingPayment(task)) {
            handlePayNow(task)
          } else {
            Alert.alert(
              'Payment Not Ready',
              'The payment for this completed task is being processed. Please try again in a moment.'
            )
          }
        }
        return
      }
      
      console.log('Navigating to applications for task:', task.id)
      // Navigate to applications view for task owners
      router.push(`/task-applications?taskId=${task.id}`)
      return
    }

    // Check if user is a tasker
    if (user.role !== 'tasker' && user.role !== 'both') {
      Alert.alert(
        'Become a Tasker',
        'You need to become a tasker to apply for tasks. Would you like to apply now?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Apply Now', 
            onPress: () => router.push('/tasker-application')
          }
        ]
      )
      return
    }

    if (hasApplied) {
      Alert.alert('Already Applied', 'You have already applied to this task.')
      return
    }

    // Navigate to application form
    router.push({
      pathname: '/apply-task',
      params: { 
        taskId: task.id,
        taskTitle: task.title,
        customerName: task.customer_name,
        budget: task.budget.toString()
      }
    })
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) return 'Just now'
    if (diffInHours < 24) return `${diffInHours}h ago`
    if (diffInHours < 168) return `${Math.floor(diffInHours / 24)}d ago`
    return date.toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return Colors.warning[500]
      case 'assigned': return Colors.primary[500]
      case 'in_progress': return Colors.primary[500]
      case 'completed': return Colors.success[500]
      case 'cancelled': return Colors.error[500]
      default: return Colors.neutral[500]
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return 'time-outline'
      case 'assigned': return 'person-outline'
      case 'in_progress': return 'play-outline'
      case 'completed': return 'checkmark-circle-outline'
      case 'cancelled': return 'close-circle-outline'
      default: return 'help-circle-outline'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Open'
      case 'assigned': return 'Assigned'
      case 'in_progress': return 'In Progress'
      case 'completed': return 'Completed'
      case 'cancelled': return 'Cancelled'
      default: return 'Unknown'
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Task Details"
          showBackButton={true}
          onBackPress={() => router.push('/jobs')}
        />
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ marginBottom: 16 }} />
          <SkeletonCard />
        </View>
      </SafeAreaView>
    )
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        <Header
          title="Task Details"
          showBackButton={true}
          onBackPress={() => router.push('/jobs')}
        />
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error[500]} />
          <Text style={styles.errorTitle}>Task Not Found</Text>
          <Text style={styles.errorSubtitle}>This task may have been removed or doesn&apos;t exist.</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Task Details"
        showBackButton={true}
        onBackPress={() => router.push('/jobs')}
      />

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollEventThrottle={16}
      >
        {/* Task Header */}
        <View style={styles.taskHeader}>
          <View style={styles.taskTitleRow}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            {task.is_urgent && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentText}>URGENT</Text>
              </View>
            )}
          </View>
          <Text style={styles.taskPrice}>{task.budget} ETB</Text>
        </View>

        {/* Task Images */}
        {(task.images && task.images.length > 0) || (task.photos && task.photos.length > 0) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Images</Text>
            <FlatList
              data={task.images || task.photos || []}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => `${task.id}-image-${index}`}
              renderItem={({ item, index }) => (
                <TouchableOpacity 
                  style={styles.imageContainer}
                  onPress={() => handleImagePress(index)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item }}
                    style={styles.taskImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              )}
              contentContainerStyle={styles.imagesList}
            />
          </View>
        ) : null}

        {/* Task Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.taskDescription}>{task.description}</Text>
        </View>

        {/* Task Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>
          <View style={styles.detailsList}>
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={20} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task.address}</Text>
            </View>
            {task.task_date && (
              <View style={styles.detailItem}>
                <Ionicons name="calendar-outline" size={20} color={Colors.neutral[500]} />
                <Text style={styles.detailText}>
                  Preferred Date: {new Date(task.task_date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
              </View>
            )}
            {task.task_time && (
              <View style={styles.detailItem}>
                <Ionicons name="time-outline" size={20} color={Colors.neutral[500]} />
                <Text style={styles.detailText}>
                  Preferred Time: {task.task_time}
                </Text>
              </View>
            )}
            {task.flexible_date && (
              <View style={styles.detailItem}>
                <Ionicons name="refresh-outline" size={20} color={Colors.neutral[500]} />
                <Text style={styles.detailText}>Date is flexible</Text>
              </View>
            )}
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={20} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>Posted {formatTime(task.created_at)}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="person-outline" size={20} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task.customer_name}</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="folder-outline" size={20} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task.category_name}</Text>
            </View>
          </View>
        </View>

        {/* Task Status Display */}
        {task.customer_id === user?.id ? (
          // Customer can manage status
          <TaskStatusManager
            taskId={task.id}
            currentStatus={task.status as any}
            userId={user?.id || ''}
            userRole="customer"
            onStatusUpdate={(newStatus) => {
              setTask(prev => prev ? { ...prev, status: newStatus } : null)
            }}
            showHistory={true}
          />
        ) : (
          // Tasker can only view status
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Task Status</Text>
            <View style={styles.statusDisplay}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(task.status) + '20' }]}>
                <Ionicons 
                  name={getStatusIcon(task.status)} 
                  size={20} 
                  color={getStatusColor(task.status)} 
                />
                <Text style={[styles.statusText, { color: getStatusColor(task.status) }]}>
                  {getStatusLabel(task.status)}
                </Text>
              </View>
              <Text style={styles.statusNote}>
                Status updates are managed from your bookings page
              </Text>
            </View>
          </View>
        )}

        {/* Customer Rating */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Rating</Text>
          <View style={styles.ratingContainer}>
            <View style={styles.ratingStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= (task.customer_rating || 5) ? "star" : "star-outline"}
                  size={20}
                  color={Colors.warning[500]}
                />
              ))}
            </View>
            <Text style={styles.ratingText}>{task.customer_rating || 5.0} / 5.0</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {/* Edit and Delete buttons for task owner */}
        {task.customer_id === user?.id && (task.status === 'open' || task.status === 'draft') && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.editButton]}
              onPress={handleEditTask}
            >
              <Ionicons name="pencil" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]}
              onPress={handleDeleteTask}
            >
              <Ionicons name="trash" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main action button */}
        <TouchableOpacity 
          style={[
            styles.applyButton,
            hasApplied && styles.appliedButton
          ]}
          onPress={handleApply}
          disabled={applying}
        >
          {applying ? (
            <View style={{ width: 20, height: 20 }}>
              <SkeletonLoader width={20} height={20} borderRadius={10} />
            </View>
          ) : (
            <Text style={[
              styles.applyButtonText,
              hasApplied && styles.appliedButtonText
            ]}>
              {task.customer_id === user?.id 
                ? (task.status === 'completed' 
                    ? 'Pay Now' 
                    : 'View Applications')
                : (hasApplied ? 'Already Applied' : 'Apply')
              }
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Image Viewer Modal */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={styles.modalContainer}>
          <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
          
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeImageModal} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedImageIndex + 1} of {(task?.images || task?.photos || []).length}
            </Text>
            <View style={styles.placeholder} />
          </View>

          {/* Image */}
          <View style={styles.modalImageContainer}>
            <Image
              source={{ uri: (task?.images || task?.photos || [])[selectedImageIndex] }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          </View>

          {/* Navigation */}
          {(task?.images || task?.photos || []).length > 1 && (
            <View style={styles.modalNavigation}>
              <TouchableOpacity
                onPress={() => setSelectedImageIndex(Math.max(0, selectedImageIndex - 1))}
                disabled={selectedImageIndex === 0}
                style={[styles.navButton, selectedImageIndex === 0 && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={24} color={selectedImageIndex === 0 ? "#666" : "#fff"} />
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => setSelectedImageIndex(Math.min((task?.images || task?.photos || []).length - 1, selectedImageIndex + 1))}
                disabled={selectedImageIndex === (task?.images || task?.photos || []).length - 1}
                style={[styles.navButton, selectedImageIndex === (task?.images || task?.photos || []).length - 1 && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-forward" size={24} color={selectedImageIndex === (task?.images || task?.photos || []).length - 1 ? "#666" : "#fff"} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Payment Modal */}
      <ChapaPaymentModal
        visible={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false)
          setSelectedPayment(null)
        }}
        payment={selectedPayment}
        onPaymentSuccess={handlePaymentSuccess}
        customerInfo={{
          email: user?.profile?.email || 'customer@mescott.com',
          firstName: user?.name?.split(' ')[0] || 'Customer',
          lastName: user?.name?.split(' ').slice(1).join(' ') || 'User',
          phone: user?.phone || '+251911234567'
        }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 120, // Increased padding to ensure content is visible above footer
    flexGrow: 1, // Ensure content can grow to fill available space
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: Colors.neutral[600],
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.error[600],
    marginTop: 15,
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
  },
  taskHeader: {
    backgroundColor: Colors.background.primary,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    flex: 1,
    marginRight: 10,
  },
  urgentBadge: {
    backgroundColor: Colors.error[500],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  urgentText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  taskPrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.primary[600],
  },
  section: {
    backgroundColor: Colors.background.primary,
    padding: 20,
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 12,
  },
  taskDescription: {
    fontSize: 16,
    color: Colors.neutral[700],
    lineHeight: 24,
  },
  detailsList: {
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 16,
    color: Colors.neutral[700],
    flex: 1,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  ratingText: {
    fontSize: 16,
    color: Colors.neutral[700],
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background.primary,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    gap: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editButton: {
    backgroundColor: Colors.primary[500],
  },
  deleteButton: {
    backgroundColor: Colors.error[500],
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  applyButton: {
    backgroundColor: Colors.primary[500],
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  appliedButton: {
    backgroundColor: Colors.neutral[300],
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  appliedButtonText: {
    color: Colors.neutral[600],
  },
  imagesList: {
    paddingHorizontal: 4,
  },
  imageContainer: {
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.neutral[100],
  },
  taskImage: {
    width: 120,
    height: 120,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  closeButton: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  modalImage: {
    width: '100%',
    height: '80%',
    maxWidth: 400,
    maxHeight: 600,
  },
  modalNavigation: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  navButton: {
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  statusDisplay: {
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 8,
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusNote: {
    fontSize: 12,
    color: Colors.neutral[500],
    textAlign: 'center',
    fontStyle: 'italic',
  },
})
