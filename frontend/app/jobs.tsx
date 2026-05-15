import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { TaskService, Task } from '../services/TaskService'
import { TaskApplicationService } from '../services/TaskApplicationService'
import { ChatService } from '../services/ChatService'
import { SearchService, SearchFilters } from '../services/SearchService'
import { PaymentService, Payment } from '../services/PaymentService'
import AdvancedSearch from '../components/AdvancedSearch'
import LoadingErrorState from '../components/LoadingErrorState'
import ChapaPaymentModal from '../components/ChapaPaymentModal'
// import RatingModal from '../components/RatingModal'
import JobsHeader from '../components/JobsHeader'
import Colors from '../constants/Colors'
import SkeletonLoader, { SkeletonList } from '../components/SkeletonLoader'
import TaskDetailSheet from '../components/TaskDetailSheet'

const { width } = Dimensions.get('window')

const categories = ['All', 'General', 'Cleaning', 'Handyman', 'Delivery', 'Photography', 'Technology', 'Gardening', 'Moving', 'Pet Care', 'Tutoring', 'Cooking', 'Painting', 'Plumbing', 'Electrical', 'Carpentry', 'Event Planning']

const budgetRanges = [
  { label: 'jobs.any_budget', min: 0, max: Infinity },
  { label: 'jobs.under_25', min: 0, max: 25 },
  { label: 'jobs.25_50', min: 25, max: 50 },
  { label: 'jobs.50_100', min: 50, max: 100 },
  { label: 'jobs.100_200', min: 100, max: 200 },
  { label: 'jobs.over_200', min: 200, max: Infinity },
]

const sortOptions = [
  { label: 'Newest First', value: 'newest' },
  { label: 'Oldest First', value: 'oldest' },
  { label: 'Price: Low to High', value: 'price_low' },
  { label: 'Price: High to Low', value: 'price_high' },
  { label: 'Distance: Nearest', value: 'distance' },
  { label: 'Urgency', value: 'urgency' },
]

export default function Jobs() {
  const { user, isAuthenticated, loading: isLoading } = useAuth()
  const { t } = useLanguage()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [activeTab, setActiveTab] = useState('available')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [appliedTasks, setAppliedTasks] = useState<Set<string>>(new Set())
  
  // Enhanced filtering states
  const [showFilters, setShowFilters] = useState(false)
  const [selectedBudgetRange, setSelectedBudgetRange] = useState(0)
  const [selectedSort, setSelectedSort] = useState('newest')
  const [selectedDate, setSelectedDate] = useState('any')
  const [selectedUrgency, setSelectedUrgency] = useState('any')
  const [selectedLocation, setSelectedLocation] = useState('any')
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false)
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({})
  const [error, setError] = useState<string | null>(null)
  const [pendingPayments, setPendingPayments] = useState<Payment[]>([])
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [selectedTaskForRating, setSelectedTaskForRating] = useState<Task | null>(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  useEffect(() => {
    if (isAuthenticated) {
      // Reset category filter when switching tabs
      setSelectedCategory('All')
      loadTasks()
      loadPendingPayments()
    }
  }, [activeTab, user, isAuthenticated])

  // Refresh tasks when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (isAuthenticated && user) {
        loadTasks() // This will call checkAppliedTasks internally
        loadPendingPayments()
      }
    }, [isAuthenticated, user, activeTab])
  )

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <SkeletonList count={3} />
        </View>
      </View>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const loadTasks = async () => {
    if (!user) {
      return
    }
    
    
    setLoading(true)
    try {
      let fetchedTasks: Task[] = []
      
      if (activeTab === 'available') {
        fetchedTasks = await TaskService.getAvailableTasks(user.user_id)
      } else {
        fetchedTasks = await TaskService.getMyTasks(user.user_id)
      }
      
      setTasks(fetchedTasks)
      
      // Check which tasks user has already applied to
      if (activeTab === 'available' && (user.role === 'tasker' || user.role === 'both')) {
        await checkAppliedTasks(fetchedTasks)
      }
    } catch (error) {
      console.error('Error loading tasks:', error)
      Alert.alert('Error', 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const checkAppliedTasks = async (tasks: Task[]) => {
    if (!user) return

    const appliedSet = new Set<string>()
    
    // Check each task to see if user has applied
    for (const task of tasks) {
      try {
        const hasApplied = await TaskApplicationService.hasUserAppliedToTask(user.user_id, task.id)
        if (hasApplied) {
          appliedSet.add(task.id)
        }
      } catch (error) {
        console.error(`Error checking application for task ${task.id}:`, error)
      }
    }
    
    setAppliedTasks(appliedSet)
  }

  const loadPendingPayments = async () => {
    if (!user) return
    
    try {
      const payments = await PaymentService.getPendingPayments(user.user_id)
      setPendingPayments(payments)
    } catch (error) {
      console.error('Error loading pending payments:', error)
    }
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

  const handlePaymentSuccess = (task: Task) => {
    loadPendingPayments() // Reload pending payments
    loadTasks() // Reload tasks to update status
    
    // Show rating modal for the completed task
    setSelectedTaskForRating(task)
    setShowRatingModal(true)
  }

  const handleRatingSubmitted = () => {
    // Refresh tasks after rating is submitted
    loadTasks()
    setShowRatingModal(false)
    setSelectedTaskForRating(null)
  }

  const hasPendingPayment = (task: Task) => {
    const hasPayment = pendingPayments.some(p => p.task_id === task.id)
    return hasPayment
  }

  const handleAdvancedSearch = async (filters: SearchFilters) => {
    try {
      setLoading(true)
      setError(null)
      setSearchFilters(filters)
      
      const searchResult = await SearchService.searchTasks(filters)
      setTasks(searchResult.tasks)
    } catch (error) {
      console.error('Error in advanced search:', error)
      setError('Search failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyToTask = async (taskId: string) => {
    if (!user) return
    
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
    
    // Find the task to get its details
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    
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

  const handleSearch = async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const searchResults = await TaskService.searchTasks(searchQuery, selectedCategory)
      setTasks(searchResults)
    } catch (error) {
      console.error('Error searching tasks:', error)
      Alert.alert('Error', 'Failed to search tasks')
    } finally {
      setLoading(false)
    }
  }

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = searchQuery === '' || 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.description.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesCategory = selectedCategory === 'All' || 
      task.category_name?.toLowerCase() === selectedCategory.toLowerCase()
    
    const matchesBudget = selectedBudgetRange === 0 || 
      (task.budget >= budgetRanges[selectedBudgetRange].min && 
       task.budget <= budgetRanges[selectedBudgetRange].max)
    
    const matchesDate = selectedDate === 'any' || 
      (selectedDate === 'today' && task.task_date === new Date().toISOString().split('T')[0]) ||
      (selectedDate === 'tomorrow' && task.task_date === new Date(Date.now() + 86400000).toISOString().split('T')[0]) ||
      (selectedDate === 'this_week' && task.task_date && new Date(task.task_date) <= new Date(Date.now() + 7 * 86400000))
    
    const matchesUrgency = selectedUrgency === 'any' || 
      task.urgency === selectedUrgency
    
    const matchesLocation = selectedLocation === 'any' || 
      task.city?.toLowerCase().includes(selectedLocation.toLowerCase()) ||
      task.address?.toLowerCase().includes(selectedLocation.toLowerCase())
    
    return matchesSearch && matchesCategory && matchesBudget && matchesDate && matchesUrgency && matchesLocation
  }).sort((a, b) => {
    switch (selectedSort) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'price_low':
        return a.budget - b.budget
      case 'price_high':
        return b.budget - a.budget
      case 'urgency':
        const urgencyOrder = { urgent: 3, within_week: 2, flexible: 1 }
        return (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0)
      default:
        return 0
    }
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return Colors.warning[500]
      case 'assigned': return Colors.primary[500]
      case 'in_progress': return Colors.primary[500]
      case 'completed': return Colors.success[500]
      case 'cancelled': return Colors.error[500]
      default: return Colors.neutral[500]
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'assigned': return 'Assigned'
      case 'in_progress': return 'In Progress'
      case 'completed': return 'Completed'
      case 'cancelled': return 'Cancelled'
      default: return 'Unknown'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 1) {
      return 'Just now'
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`
      } else {
      return `${Math.floor(diffInHours / 24)}d ago`
    }
  }

    const scrollViewRef = useRef<ScrollView>(null)

    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        {/* Fixed Header (does not scroll) */}
        <JobsHeader
            title={activeTab === 'available' ? t('jobs.available') : t('jobs.my_tasks')}
            subtitle=""
            onCreateTask={() => router.push({ pathname: '/post-task' })}
            createTaskText={t('jobs.create_task')}
          />

        {/* Fixed Controls: Tabs + Category chips */}
        <View style={styles.headerControls}>
          {/* Tab Navigation (fixed) */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'available' && styles.activeTab]}
              onPress={() => setActiveTab('available')}
            >
              <Text style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}>
                Available
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'my' && styles.activeTab]}
              onPress={() => setActiveTab('my')}
            >
              <Text style={[styles.tabText, activeTab === 'my' && styles.activeTabText]}>
                My Tasks
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category Chips (fixed; for both Available and My Tasks) */}
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.headerChipsScroll}
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
          >
            {categories.map((category) => (
              <TouchableOpacity
                key={category}
                style={[styles.filterChip, selectedCategory === category && styles.filterChipActive]}
                onPress={() => setSelectedCategory(category)}
              >
                <Text style={[styles.filterChipText, selectedCategory === category && styles.filterChipTextActive]}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Scrollable content below header */}
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
        {/* Tabs moved to fixed header */}

        {/* Search and advanced filters removed for this version */}

        {/* Tasker Registration Prompt */}
        {user && user.role !== 'tasker' && user.role !== 'both' && user.tasker_application_status !== 'pending' && activeTab === 'available' && (
          <View style={styles.taskerPrompt}>
            <View style={styles.taskerPromptContent}>
              <Ionicons name="briefcase" size={18} color={Colors.primary[500]} />
              <View style={styles.taskerPromptText}>
                <Text style={styles.taskerPromptTitle}>Want to apply for tasks?</Text>
                <Text style={styles.taskerPromptSubtitle}>Become a tasker to start earning money</Text>
              </View>
              <TouchableOpacity 
                style={styles.taskerPromptButton}
                onPress={() => router.push('/tasker-application')}
              >
                <Text style={styles.taskerPromptButtonText}>Apply Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      {/* Category chips moved to fixed header */}

      {/* Tasks List */}
      <ScrollView 
        style={styles.tasksList} 
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        scrollEventThrottle={16}
      >
        {loading ? (
          <SkeletonList count={5} />
        ) : error ? (
          <LoadingErrorState
            loading={false}
            error={error}
            empty={false}
            onRetry={loadTasks}
          />
        ) : filteredTasks.length === 0 ? (
          <LoadingErrorState
            loading={false}
            error={null}
            empty={true}
            emptyMessage="No tasks found. Try adjusting your search criteria."
            emptyIcon="briefcase-outline"
            onRetry={loadTasks}
          />
        ) : (
          <>
            {filteredTasks.map((task) => (
            <TouchableOpacity 
              key={task.id} 
              style={styles.taskCard}
              onPress={() => { setSelectedTaskId(task.id); setDetailVisible(true) }}
            >
              {/* Task Image */}
        {task.photos && task.photos.length > 0 && (
          <View style={styles.taskImageContainer}>
            <Image
              source={{ uri: task.photos[0] }}
              style={styles.taskImage}
              resizeMode="cover"
            />
            {/* Image overlay with photo count */}
              {task.photos.length > 1 && (
              <View style={styles.imageOverlay}>
                <View style={styles.imageCountBadge}>
                  <Text style={styles.imageCountText}>+{task.photos.length - 1}</Text>
                </View>
                </View>
              )}
          </View>
        )}

              {/* Task Header */}
              <View style={styles.taskHeader}>
                <View style={styles.taskTitleRow}>
                  <Text style={styles.taskTitle} numberOfLines={1} ellipsizeMode="tail">
                    {task.title}
                  </Text>
                </View>
                <View style={styles.priceContainer}>
                  <Text style={styles.taskPrice}>{task.budget} ETB</Text>
                </View>
              </View>
              
              {/* Task Description */}
              <View style={styles.descriptionContainer}>
                <Text style={styles.taskDescription} numberOfLines={3} ellipsizeMode="tail">
                  {task.description}
                </Text>
              </View>
              
              {/* Task Meta */}
              <View style={styles.taskMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={16} color={Colors.neutral[500]} />
                  <Text style={styles.metaText} numberOfLines={1} ellipsizeMode="tail">
                    {task.address}
                  </Text>
                </View>
                {task.task_date && (
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={16} color={Colors.primary[500]} />
                    <Text style={styles.metaText}>
                      {new Date(task.task_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </Text>
                  </View>
                )}
                {task.task_time && (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={16} color={Colors.primary[500]} />
                    <Text style={styles.metaText}>{task.task_time}</Text>
                  </View>
                )}
                {task.flexible_date && (
                  <View style={styles.metaItem}>
                    <Ionicons name="refresh-outline" size={16} color={Colors.neutral[500]} />
                    <Text style={styles.metaText}>Flexible</Text>
                  </View>
                )}
            </View>
            
              {/* Task Footer */}
              <View style={styles.taskFooter}>
                <View style={styles.taskTags}>
                  <View style={styles.categoryTag}>
                    <Text style={styles.categoryTagText}>{task.category_name}</Text>
              </View>
                  {activeTab === 'available' && (
                    <View style={styles.ratingTag}>
                      <Ionicons name="star" size={14} color={Colors.warning[500]} />
                      <Text style={styles.ratingText}>{task.customer_rating || 5.0}</Text>
                    </View>
                  )}
                  {/* Remove redundant status tag for My Tasks tab */}
                  {activeTab === 'my' && task.status !== 'assigned' && (
                    <View style={[styles.statusTag, { backgroundColor: getStatusColor(task.status) + '15' }]}>
                      <Text style={[styles.statusTagText, { color: getStatusColor(task.status) }]}>
                        {getStatusLabel(task.status)}
                      </Text>
                    </View>
                  )}
          </View>

                {/* Action Button - Different for available vs my tasks */}
                {activeTab === 'available' ? (
                  <TouchableOpacity 
                    style={[
                      styles.actionButton,
                      appliedTasks.has(task.id) && styles.appliedButton
                    ]}
                    onPress={() => {
                      if (appliedTasks.has(task.id)) {
                        Alert.alert('Already Applied', 'You have already applied to this task.')
                      } else {
                        handleApplyToTask(task.id)
                      }
                    }}
                  >
                    <Text style={[
                      styles.actionButtonText,
                      appliedTasks.has(task.id) && styles.appliedButtonText
                    ]}>
                      {appliedTasks.has(task.id) ? 'Already Applied' : 'Apply'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  // My Tasks - Show different actions based on task status
                  <>
                    {task.status === 'completed' ? (
                      hasPendingPayment(task) ? (
                        <TouchableOpacity 
                          style={[styles.actionButton, styles.payButton]}
                          onPress={() => handlePayNow(task)}
                        >
                          <Ionicons name="card" size={16} color="#fff" />
                          <Text style={styles.actionButtonText}>Pay Now</Text>
                        </TouchableOpacity>
                      ) : task.payment_status === 'completed' ? (
                        <TouchableOpacity 
                          style={[styles.actionButton, styles.rateButton]}
                          onPress={() => {
                            setSelectedTaskForRating(task)
                            setShowRatingModal(true)
                          }}
                        >
                          <Ionicons name="star" size={16} color="#fff" />
                          <Text style={styles.actionButtonText}>Rate & Review</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark-circle" size={16} color={Colors.success[500]} />
                          <Text style={styles.completedText}>Paid</Text>
                        </View>
                      )
                    ) : task.tasker_id ? (
                      <TouchableOpacity 
                        style={[styles.actionButton, styles.messageButton]}
                        onPress={async () => {
                          if (!user?.id || !task.tasker_id) {
                            Alert.alert('Error', 'Unable to start chat. Missing user or tasker information.')
                            return
                          }
                          
                          try {
                            // Get or create chat for this task
                            const chat = await ChatService.getOrCreateChat(
                              task.id, 
                              user.id, // This is the profile ID
                              task.tasker_id // This is also a profile ID
                            )
                            
                            if (chat) {
                              router.push({
                                pathname: '/chat-detail',
                                params: { 
                                  chatId: chat.id,
                                  taskId: task.id,
                                  taskTitle: task.title,
                                  otherUserName: task.tasker_name || 'Tasker'
                                }
                              })
                            } else {
                              Alert.alert('Error', 'Unable to start chat. Please try again.')
                            }
                          } catch (error) {
                            console.error('Error creating chat:', error)
                            Alert.alert('Error', 'Unable to start chat. Please try again.')
                          }
                        }}
                      >
                        <Ionicons name="chatbubble" size={16} color="#fff" />
                        <Text style={styles.actionButtonText}>Message</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={styles.actionButton}
                        onPress={() => {
                          router.push({
                            pathname: '/task-applications',
                            params: { taskId: task.id }
                          })
                        }}
                      >
                        <Text style={styles.actionButtonText}>View Applications</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
        </View>
            </TouchableOpacity>
            ))}
          </>
        )}
          </ScrollView>
        </ScrollView>

        {/* Advanced Search Modal */}
        <AdvancedSearch
        visible={showAdvancedSearch}
        onClose={() => setShowAdvancedSearch(false)}
        onSearch={handleAdvancedSearch}
        initialFilters={searchFilters}
      />

      {/* Payment Modal */}
      <ChapaPaymentModal
        visible={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false)
          setSelectedPayment(null)
        }}
        payment={selectedPayment}
        onPaymentSuccess={(payment) => {
          const task = payment?.task_id ? tasks.find(t => t.id === payment.task_id) : null
          if (task) {
            handlePaymentSuccess(task)
          }
        }}
        customerInfo={{
          email: user?.profile?.email || 'customer@mescott.com',
          firstName: user?.name?.split(' ')[0] || 'Customer',
          lastName: user?.name?.split(' ').slice(1).join(' ') || 'User',
          phone: user?.phone || '+251911234567'
        }}
      />

      {/* Rating Modal - Temporarily disabled */}
      {/* {selectedTaskForRating && (
        <RatingModal
          visible={showRatingModal}
          onClose={() => {
            setShowRatingModal(false)
            setSelectedTaskForRating(null)
          }}
          onRatingSubmitted={handleRatingSubmitted}
          taskId={selectedTaskForRating.id || ''}
          customerId={selectedTaskForRating.customer_id || ''}
          technicianId={selectedTaskForRating.tasker_id || ''}
          customerUserId={user?.id || ''}
          technicianUserId={selectedTaskForRating.tasker_id || ''}
          taskTitle={selectedTaskForRating.title || 'Task'}
          technicianName={selectedTaskForRating.tasker_name || 'Technician'}
        />
      )} */}

      {/* Task Detail Sheet */}
      {selectedTaskId && (
        <TaskDetailSheet
          visible={detailVisible}
          onClose={() => setDetailVisible(false)}
          taskId={selectedTaskId}
          onPaymentSuccess={handlePaymentSuccess}
          onRatingSubmitted={handleRatingSubmitted}
          hasPendingPayment={hasPendingPayment}
          user={user}
          pendingPayments={pendingPayments}
          handlePayNow={handlePayNow}
          handleApplyToTask={handleApplyToTask}
          appliedTasks={appliedTasks}
          getStatusColor={getStatusColor}
          getStatusLabel={getStatusLabel}
          formatTime={formatTime}
          t={t}
          router={router}
          setSelectedTaskId={setSelectedTaskId}
          setDetailVisible={setDetailVisible}
        />
      )}
        <TaskDetailSheet
          taskId={selectedTaskId || undefined}
          visible={detailVisible}
          onClose={() => { setDetailVisible(false); setSelectedTaskId(null) }}
        />
      </SafeAreaView>
    )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA', // Very light gray background for scrollable content
  },
  content: {
    flex: 1,
  },
  headerControls: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: Colors.error[500],
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12, // spacing between tabs and search
    marginBottom: 12, // breathing room below search
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
    marginLeft: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12, // a touch more breathing room before category chips
    borderRadius: 10, // slightly reduced roundness
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTab: {
    backgroundColor: Colors.primary[500],
  },
  tabText: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.neutral[600],
  },
  activeTabText: {
    fontSize: 16,
    fontWeight: '600', // Semi-bold for active tab
    color: '#FFFFFF',
  },
  filtersSection: {
    paddingVertical: 16,
    backgroundColor: Colors.background.primary,
  },
  filtersScroll: {
    paddingHorizontal: 20,
  },
  headerChipsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background.secondary,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  filterChipActive: {
    backgroundColor: Colors.primary[500],
    borderColor: Colors.primary[500],
  },
  filterChipText: {
    fontSize: 14,
    color: Colors.neutral[600],
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.primary[50],
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary[500],
  },
  filterPanel: {
    backgroundColor: Colors.background.primary,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterSection: {
    marginRight: 24,
    minWidth: 200,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 8,
  },
  clearFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.primary[50],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary[200],
    marginLeft: 16,
  },
  clearFiltersText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary[600],
    marginLeft: 4,
  },
  tasksList: {
    flex: 1,
    backgroundColor: '#FAFAFA', // Match container background
  },
  scrollContent: {
    paddingTop: 16, // Add spacing between tab section and first task card
    paddingBottom: 120, // Increased padding to prevent content cutoff
    flexGrow: 1, // Ensure content can grow to fill available space
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.neutral[600],
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8, // Increased vertical spacing between cards
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 0.5,
    borderColor: Colors.neutral[200],
  },
  taskImageContainer: {
    position: 'relative',
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  taskImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  imageCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageCountText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskTitleRow: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    lineHeight: 20,
  },
  priceContainer: {
    backgroundColor: Colors.primary[50],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  taskPrice: {
    fontSize: 16,
    fontWeight: '700', // Bold font for price
    color: Colors.primary[600],
  },
  descriptionContainer: {
    marginBottom: 10,
  },
  taskDescription: {
    fontSize: 14,
    color: Colors.neutral[600],
    lineHeight: 18,
  },
  taskMeta: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  metaText: {
    fontSize: 12,
    color: Colors.neutral[500],
    marginLeft: 4,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
  },
  taskTags: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryTag: {
    backgroundColor: Colors.primary[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryTagText: {
    fontSize: 11,
    color: Colors.primary[600],
    fontWeight: '600',
  },
  ratingTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warning[100],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  ratingText: {
    fontSize: 12,
    color: Colors.warning[700],
    marginLeft: 4,
    fontWeight: '600',
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: Colors.primary[500],
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  appliedButton: {
    backgroundColor: Colors.neutral[200],
    borderColor: Colors.neutral[300],
    shadowOpacity: 0.1,
  },
  appliedButtonText: {
    color: Colors.neutral[500],
    fontWeight: '600',
  },
  payButton: {
    backgroundColor: Colors.success[600],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: Colors.success[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.success[700],
  },
  rateButton: {
    backgroundColor: Colors.warning[500],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: Colors.warning[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: Colors.warning[600],
  },
  messageButton: {
    backgroundColor: Colors.primary[500],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success[100],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  completedText: {
    color: Colors.success[600],
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
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
    paddingHorizontal: 40,
  },
  taskerPrompt: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.primary[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  taskerPromptContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  taskerPromptText: {
    flex: 1,
  },
  taskerPromptTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary[700],
    marginBottom: 1,
  },
  taskerPromptSubtitle: {
    fontSize: 12,
    color: Colors.primary[600],
  },
  taskerPromptButton: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  taskerPromptButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
})
