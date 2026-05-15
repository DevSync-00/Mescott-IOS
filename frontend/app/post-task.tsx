import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Modal,
  ScrollView,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { TaskService } from '../services/TaskService'
import { SimpleNotificationService } from '../services/SimpleNotificationService'
import { PushNotificationService } from '../services/PushNotificationService'
import { supabase } from '../lib/supabase'
import Colors from '../constants/Colors'
import MultiImageUpload from '../components/MultiImageUpload'

const categories = [
  'General',
  'Cleaning',
  'Handyman',
  'Delivery',
  'Photography',
  'Technology',
  'Gardening',
  'Pet Care',
  'Moving',
  'Tutoring',
  'Cooking',
  'Painting',
  'Plumbing',
  'Electrical',
  'Carpentry',
  'Landscaping',
  'Event Planning'
]

// Category colors for visual appeal
const getCategoryColor = (category: string) => {
  const colorMap: Record<string, string> = {
    'General': Colors.primary[500],
    'Cleaning': Colors.success[500],
    'Handyman': Colors.primary[500],
    'Delivery': Colors.warning[500],
    'Photography': Colors.primary[600],
    'Technology': Colors.primary[400],
    'Gardening': Colors.success[600],
    'Pet Care': Colors.warning[600],
    'Moving': Colors.error[500],
    'Tutoring': Colors.primary[500],
    'Cooking': Colors.error[400],
    'Painting': Colors.warning[500],
    'Plumbing': Colors.primary[400],
    'Electrical': Colors.warning[700],
    'Carpentry': Colors.error[600],
    'Landscaping': Colors.success[700],
    'Event Planning': Colors.primary[600],
  }
  return colorMap[category] || Colors.neutral[500]
}

export default function PostTask() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { category, taskId, editMode } = useLocalSearchParams()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [taskImages, setTaskImages] = useState<string[]>([])
  const [taskDate, setTaskDate] = useState(new Date())
  const [taskTime, setTaskTime] = useState(() => {
    const defaultTime = new Date()
    defaultTime.setHours(0, 0, 0, 0) // Set to 12:00 AM
    return defaultTime
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTimePicker, setShowTimePicker] = useState(false)
  const isEdit = editMode === 'true' && typeof taskId === 'string'

  useEffect(() => {
    if (isEdit && taskId) {
      // Load existing task and prefill form
      ;(async () => {
        try {
          const existing = await TaskService.getTaskById(taskId as string)
          if (existing) {
            setTitle(existing.title || '')
            setDescription(existing.description || '')
            setPrice(existing.budget ? String(existing.budget) : '')
            setLocation(existing.address || '')
            if (existing.category_name) setSelectedCategory(existing.category_name)
            if (existing.task_date) setTaskDate(new Date(existing.task_date))
            if (existing.task_time) {
              const [h, m, s] = (existing.task_time as any as string).split(':').map(Number)
              const t = new Date()
              t.setHours(h || 0, m || 0, s || 0, 0)
              setTaskTime(t)
            }
            if (existing.photos) setTaskImages(existing.photos)
          }
        } catch (e) {
          console.error('Error loading task for edit:', e)
        }
      })()
    }
  }, [isEdit, taskId])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  useEffect(() => {
    if (category && typeof category === 'string') {
      setSelectedCategory(category)
    }
  }, [category])

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const ensureUserProfile = async (userId: string): Promise<string> => {
    try {
      // Check if profile exists using the auth.users.id (user_id field)
      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (profileError) {
        console.error('Error checking profile existence:', profileError)
        throw new Error(`Database error: ${profileError.message}`)
      }

      if (existingProfile) {
        console.log('Profile found:', existingProfile.id)
        return existingProfile.id
      }

      // If profile doesn't exist, throw an error instead of creating one
      throw new Error('Profile not found. Please complete your profile setup first.')
    } catch (error) {
      console.error('Error ensuring user profile:', error)
      throw error // Re-throw the error instead of returning fallback
    }
  }

  const getOrCreateCategory = async (categoryName: string): Promise<string> => {
    try {
      // First try to find existing category
      const { data: existingCategory } = await supabase
        .from('task_categories')
        .select('id')
        .eq('name', categoryName)
        .single()

      if (existingCategory) {
        return existingCategory.id
      }

      // Create new category if it doesn't exist
      const { data: newCategory, error } = await supabase
        .from('task_categories')
        .insert([{
          name: categoryName,
          slug: categoryName.toLowerCase().replace(/\s+/g, '-'),
        description: `${categoryName} services`,
        icon: 'briefcase',
        color: '#8B5CF6',
        is_active: true
        }])
        .select('id')
        .single()

      if (error) throw error
      return newCategory.id
    } catch (error) {
      console.error('Error getting/creating category:', error)
      // Return a default category ID or create a fallback
      return '550e8400-e29b-41d4-a716-446655440000' // General category UUID
    }
  }

  const handlePostTask = async () => {
    if (!user) {
      Alert.alert('Error', 'Please log in to post a task')
      return
    }

    // Validation
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a task title')
      return
    }
    if (!description.trim()) {
      Alert.alert('Error', 'Please enter a task description')
      return
    }
    if (!price.trim()) {
      Alert.alert('Error', 'Please enter a budget')
      return
    }
    if (!location.trim()) {
      Alert.alert('Error', 'Please enter a location')
      return
    }
    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category')
      return
    }

    setLoading(true)
    try {
      console.log('Post task - User object:', {
        id: user.id,
        user_id: user.user_id,
        full_name: user.full_name,
        phone: user.phone
      })
      
      // First ensure user profile exists and get profile ID
      const profileId = await ensureUserProfile(user.user_id)
      
      // Then get or create category
      const categoryId = await getOrCreateCategory(selectedCategory)
      
      const taskData = {
        title: title.trim(),
        description: description.trim(),
        budget: parseFloat(price) || 0,
        address: location.trim(),
        city: 'Addis Ababa',
        state: 'Addis Ababa',
        zip_code: '1000',
        latitude: undefined,
        longitude: undefined,
        flexible_date: false, // Now we have specific date/time
        // Store as date and time strings compatible with Postgres DATE and TIME
        task_date: taskDate.toISOString().split('T')[0],
        task_time: taskTime.toISOString().split('T')[1].slice(0, 8),
        estimated_hours: 2, // Default estimate
        task_size: 'medium' as const,
        urgency: 'flexible' as const,
        status: 'open' as const,
        customer_id: profileId, // Use the actual profile ID
        user_id: user.user_id, // Use the auth.users.id for user_id field
        category_id: categoryId,
        requirements: [],
        attachments: [],
        tags: [selectedCategory.toLowerCase()],
        is_featured: false,
        is_urgent: false,
        payment_status: 'pending' as const,
        special_instructions: '',
        photos: taskImages,
        estimated_duration_hours: 2
      }

      if (isEdit && typeof taskId === 'string') {
        const updated = await TaskService.updateTask(taskId as string, user.id, taskData as any)
        if (!updated) throw new Error('Failed to update task')
      } else {
        const createdTask = await TaskService.createTask(taskData)
        if (!createdTask) {
          throw new Error('Failed to create task')
        }
      }
      
      if (!isEdit) {
        // Create notification for successful task posting
        await SimpleNotificationService.createTaskNotification(title, 'created')
        // Create push notification for nearby taskers
        // createdTask exists in create branch only; skip in edit
      }
      
      Alert.alert('Success', isEdit ? 'Task updated successfully!' : 'Task posted successfully!', [
        {
          text: 'OK',
          onPress: () => {
            // Reset form
            setTitle('')
            setDescription('')
            setPrice('')
            setLocation('')
            setSelectedCategory('')
            setTaskImages([])
            setTaskDate(new Date())
            const defaultTime = new Date()
            defaultTime.setHours(0, 0, 0, 0) // Set to 12:00 AM
            setTaskTime(defaultTime)
            
            // Redirect appropriately
            if (isEdit && typeof taskId === 'string') {
              router.push({ pathname: '/task-detail', params: { taskId: taskId as string } })
            } else {
              router.push('/jobs')
            }
          }
        }
      ])
    } catch (error) {
      console.error('Error posting task:', error)
      Alert.alert('Error', 'Failed to post task. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const scrollViewRef = useRef<ScrollView>(null)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Fixed Header */}
        <View style={styles.headerContainer}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.push('/jobs')}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.neutral[700]} />
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Post a Task</Text>
              <Text style={styles.headerSubtitle}>Tell us what you need done</Text>
            </View>
            <View style={styles.placeholder} />
          </View>
        </View>

        {/* Decorative gradient header accent - Fixed */}
        <LinearGradient
          colors={[Colors.primary[500], Colors.primary[600]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientAccent}
        />

        {/* Scrollable Content - Only content below header bounces */}
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.content}
            contentContainerStyle={{ paddingBottom: 120 }}
            bounces={true}
            alwaysBounceVertical={true}
            showsVerticalScrollIndicator={false}
            overScrollMode="always"
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.form}>
              {/* Task Title */}
              <View style={styles.inputCard}>
                <View style={styles.labelRow}>
                  <Ionicons name="create" size={18} color={Colors.primary[500]} />
                  <Text style={styles.label}>Task Title *</Text>
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., House Cleaning, Furniture Assembly"
                    placeholderTextColor={Colors.neutral[400]}
                    value={title}
                    onChangeText={setTitle}
                    maxLength={100}
                  />
                </View>
                <Text style={styles.characterCount}>{title.length}/100</Text>
              </View>

              {/* Description */}
              <View style={styles.inputCard}>
                <View style={styles.labelRow}>
                  <Ionicons name="document-text" size={18} color={Colors.primary[500]} />
                  <Text style={styles.label}>Description *</Text>
                </View>
                <View style={styles.inputContainer}>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe what needs to be done in detail..."
                    placeholderTextColor={Colors.neutral[400]}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                  />
                </View>
                <Text style={styles.characterCount}>{description.length}/500</Text>
              </View>

              {/* Task Date and Time */}
              <View style={styles.row}>
                <View style={[styles.inputCard, { flex: 1, marginRight: 8 }]}>
                  <View style={styles.labelRow}>
                    <Ionicons name="calendar" size={18} color={Colors.primary[500]} />
                    <Text style={styles.label}>Task Date *</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.dateTimeInputContainer}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={styles.dateText}>
                      {taskDate.toLocaleDateString()}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={Colors.primary[500]} />
                  </TouchableOpacity>
                </View>
                <View style={[styles.inputCard, { flex: 1, marginLeft: 8 }]}>
                  <View style={styles.labelRow}>
                    <Ionicons name="time" size={18} color={Colors.primary[500]} />
                    <Text style={styles.label}>Task Time *</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.dateTimeInputContainer}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text style={styles.dateText}>
                      {taskTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={Colors.primary[500]} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Price and Location Row */}
              <View style={styles.row}>
                <View style={[styles.inputCard, { flex: 1, marginRight: 8 }]}>
                  <View style={styles.labelRow}>
                    <Ionicons name="cash" size={18} color={Colors.success[500]} />
                    <Text style={styles.label}>Budget *</Text>
                  </View>
                  <View style={styles.inputContainer}>
                    <Text style={styles.currencySymbol}>ETB</Text>
                    <TextInput
                      style={[styles.input, styles.currencyInput]}
                      placeholder="e.g., 500 - 1000"
                      placeholderTextColor={Colors.neutral[400]}
                      value={price}
                      onChangeText={setPrice}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <View style={[styles.inputCard, { flex: 1, marginLeft: 8 }]}>
                  <View style={styles.labelRow}>
                    <Ionicons name="location" size={18} color={Colors.error[500]} />
                    <Text style={styles.label}>Location *</Text>
                  </View>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., Addis Ababa, Bole"
                      placeholderTextColor={Colors.neutral[400]}
                      value={location}
                      onChangeText={setLocation}
                    />
                  </View>
                </View>
              </View>

              {/* Category */}
              <View style={styles.inputCard}>
                <View style={styles.labelRow}>
                  <Ionicons name="grid" size={18} color={Colors.primary[500]} />
                  <Text style={styles.label}>Category *</Text>
                </View>
                <View style={styles.categoriesGrid}>
                  {categories.map((category) => {
                    const categoryColor = getCategoryColor(category)
                    const isSelected = selectedCategory === category
                    return (
                      <TouchableOpacity
                        key={category}
                        style={[
                          styles.categoryChip,
                          isSelected && { 
                            backgroundColor: categoryColor,
                            borderColor: categoryColor,
                            shadowColor: categoryColor,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.3,
                            shadowRadius: 4,
                            elevation: 3,
                          },
                        ]}
                        onPress={() => setSelectedCategory(category)}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark-circle" size={16} color="#fff" style={{ marginRight: 6 }} />
                        )}
                        <Text
                          style={[
                            styles.categoryChipText,
                            isSelected && styles.categoryChipTextActive,
                          ]}
                        >
                          {category}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              {/* Task Images */}
              <View style={styles.inputCard}>
                <View style={styles.labelRow}>
                  <Ionicons name="images" size={18} color={Colors.primary[500]} />
                  <Text style={styles.label}>Task Photos (Optional)</Text>
                </View>
                <Text style={styles.helperText}>Add photos to help taskers understand what needs to be done</Text>
                <View style={styles.imageUploadContainer}>
                  <MultiImageUpload
                    onImagesChange={setTaskImages}
                    currentImages={taskImages}
                    maxImages={5}
                    placeholder="Add task images"
                    showPreview={true}
                  />
                </View>
              </View>

              {/* Post Button */}
              <TouchableOpacity
                style={[styles.postButton, loading && styles.postButtonDisabled]}
                onPress={handlePostTask}
                disabled={loading}
              >
                <LinearGradient
                  colors={loading ? [Colors.neutral[300], Colors.neutral[300]] : [Colors.primary[500], Colors.primary[600]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.postButtonGradient}
                >
                  <Ionicons name="checkmark-circle" size={22} color="#fff" />
                  <Text style={styles.postButtonText}>
                    {loading ? 'Posting Task...' : 'Post Task'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>

        {/* Modern Date Picker Modal */}
        <Modal
              visible={showDatePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowDatePicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Date</Text>
                    <TouchableOpacity
                      onPress={() => setShowDatePicker(false)}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color={Colors.neutral[600]} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.datePickerContainer}>
                    <View style={styles.dateDisplay}>
                      <Text style={styles.selectedDateText}>
                        {taskDate.toLocaleDateString('en-US', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </Text>
                    </View>
                    
                    <View style={styles.dateControls}>
                      <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => {
                          const newDate = new Date(taskDate)
                          newDate.setDate(newDate.getDate() - 1)
                          if (newDate >= new Date()) {
                            setTaskDate(newDate)
                          }
                        }}
                      >
                        <Ionicons name="chevron-down" size={20} color={Colors.primary[500]} />
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.dateButton}
                        onPress={() => {
                          const newDate = new Date(taskDate)
                          newDate.setDate(newDate.getDate() + 1)
                          setTaskDate(newDate)
                        }}
                      >
                        <Ionicons name="chevron-up" size={20} color={Colors.primary[500]} />
                      </TouchableOpacity>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={() => setShowDatePicker(false)}
                    >
                      <Text style={styles.confirmButtonText}>Confirm Date</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Modern Time Picker Modal */}
            <Modal
              visible={showTimePicker}
              transparent={true}
              animationType="slide"
              onRequestClose={() => setShowTimePicker(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Select Time</Text>
                    <TouchableOpacity
                      onPress={() => setShowTimePicker(false)}
                      style={styles.modalCloseButton}
                    >
                      <Ionicons name="close" size={24} color={Colors.neutral[600]} />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.timePickerContainer}>
                    <View style={styles.timeDisplay}>
                      <Text style={styles.selectedTimeText}>
                        {taskTime.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: true 
                        })}
                      </Text>
                    </View>
                    
                    <View style={styles.timeControls}>
                      <View style={styles.timeControlGroup}>
                        <Text style={styles.timeLabel}>Hour</Text>
                        <View style={styles.timeButtons}>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => {
                              const newTime = new Date(taskTime)
                              newTime.setHours(newTime.getHours() + 1)
                              setTaskTime(newTime)
                            }}
                          >
                            <Ionicons name="chevron-up" size={20} color={Colors.primary[500]} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => {
                              const newTime = new Date(taskTime)
                              newTime.setHours(newTime.getHours() - 1)
                              setTaskTime(newTime)
                            }}
                          >
                            <Ionicons name="chevron-down" size={20} color={Colors.primary[500]} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      
                      <View style={styles.timeControlGroup}>
                        <Text style={styles.timeLabel}>Minute</Text>
                        <View style={styles.timeButtons}>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => {
                              const newTime = new Date(taskTime)
                              newTime.setMinutes(newTime.getMinutes() + 10)
                              setTaskTime(newTime)
                            }}
                          >
                            <Ionicons name="chevron-up" size={20} color={Colors.primary[500]} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.timeButton}
                            onPress={() => {
                              const newTime = new Date(taskTime)
                              newTime.setMinutes(newTime.getMinutes() - 10)
                              setTaskTime(newTime)
                            }}
                          >
                            <Ionicons name="chevron-down" size={20} color={Colors.primary[500]} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    
                    <TouchableOpacity
                      style={styles.confirmButton}
                      onPress={() => setShowTimePicker(false)}
                    >
                      <Text style={styles.confirmButtonText}>Confirm Time</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[50],
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: Colors.neutral[50],
  },
  gradientAccent: {
    height: 4,
    width: '100%',
  },
  headerContainer: {
    backgroundColor: Colors.background.primary,
    marginTop: 0,
    paddingTop: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: Colors.neutral[100],
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: Colors.neutral[600],
  },
  form: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 40,
  },
  inputCard: {
    backgroundColor: Colors.background.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[50],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border.primary,
  },
  dateTimeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.neutral[50],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: Colors.border.primary,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
  },
  currencyInput: {
    marginLeft: 8,
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.success[600],
    backgroundColor: Colors.success[50],
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: Colors.neutral[500],
    textAlign: 'right',
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: Colors.neutral[100],
    borderWidth: 2,
    borderColor: Colors.border.primary,
  },
  categoryChipActive: {
    borderWidth: 2,
  },
  categoryChipText: {
    fontSize: 14,
    color: Colors.neutral[700],
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  postButton: {
    borderRadius: 16,
    marginVertical: 32,
    marginBottom: 40,
    overflow: 'hidden',
    shadowColor: Colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  postButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  postButtonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  postButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  helperText: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginBottom: 16,
    lineHeight: 20,
  },
  imagesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  imageWrapper: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  taskImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 10,
    padding: 2,
  },
  addImageButton: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.primary[300],
    borderStyle: 'dashed',
    backgroundColor: Colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: 12,
    color: Colors.primary[600],
    marginTop: 4,
    textAlign: 'center',
  },
  imageToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.primary[50],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  imageToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.primary[600],
    marginLeft: 8,
  },
  imageUploadContainer: {
    marginTop: 12,
  },
  locationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  locationToggleText: {
    fontSize: 14,
    color: Colors.neutral[600],
    fontWeight: '500',
  },
  dateText: {
    fontSize: 16,
    color: Colors.neutral[700],
    fontWeight: '500',
    flex: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.background.primary,
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  modalCloseButton: {
    padding: 4,
  },
  datePickerContainer: {
    alignItems: 'center',
  },
  dateDisplay: {
    backgroundColor: Colors.primary[50],
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    width: '100%',
    alignItems: 'center',
  },
  selectedDateText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primary[700],
    textAlign: 'center',
  },
  dateControls: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  dateButton: {
    backgroundColor: Colors.primary[100],
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  confirmButton: {
    backgroundColor: Colors.primary[500],
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  timePickerContainer: {
    alignItems: 'center',
  },
  timeDisplay: {
    backgroundColor: Colors.primary[50],
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    width: '100%',
    alignItems: 'center',
  },
  selectedTimeText: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary[700],
    textAlign: 'center',
  },
  timeControls: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 24,
  },
  timeControlGroup: {
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[600],
    marginBottom: 12,
  },
  timeButtons: {
    gap: 8,
  },
  timeButton: {
    backgroundColor: Colors.primary[100],
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
})