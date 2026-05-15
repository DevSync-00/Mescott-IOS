import { supabase } from '../lib/supabase'
import { handleError } from '../utils/errorHandler'
import { UnifiedNotificationService } from './UnifiedNotificationService'

export interface Task {
  id: string
  title: string
  description: string
  budget: number
  address: string
  city: string
  state: string
  zip_code: string
  latitude?: number
  longitude?: number
  task_date?: string
  task_time?: string
  flexible_date: boolean
  estimated_hours?: number
  task_size: 'small' | 'medium' | 'large'
  urgency: 'flexible' | 'within_week' | 'urgent'
  status: 'draft' | 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  customer_id: string
  tasker_id?: string
  category_id: string
  images?: string[]
  requirements?: string[]
  attachments?: string[]
  tags?: string[]
  is_featured: boolean
  is_urgent: boolean
  expires_at?: string
  published_at?: string
  assigned_at?: string
  started_at?: string
  completed_at?: string
  cancelled_at?: string
  cancellation_reason?: string
  customer_rating?: number
  customer_review?: string
  tasker_rating?: number
  tasker_review?: string
  payment_status: 'pending' | 'partial' | 'completed' | 'refunded'
  payment_method?: string
  transaction_id?: string
  final_price?: number
  special_instructions?: string
  photos?: string[]
  estimated_duration_hours?: number
  created_at: string
  updated_at: string
  // Additional fields for display
  customer_name?: string
  tasker_name?: string
  category_name?: string
  applications_count?: number
}

export interface TaskApplication {
  id: string
  task_id: string
  tasker_id: string
  proposed_price: number
  estimated_time: number
  status: 'pending' | 'accepted' | 'rejected'
  message: string
  attachments?: string[]
  availability_date: string
  estimated_hours?: number
  created_at: string
  updated_at: string
  // Additional fields for display
  tasker_name?: string
  tasker_rating?: number
  tasker_avatar_url?: string
}

export class TaskService {
  // Helper method to get profile names by IDs
  private static async getProfileNames(profileIds: string[]): Promise<Map<string, string>> {
    if (profileIds.length === 0) return new Map();
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', profileIds);
    
    return new Map(profiles?.map(p => [p.id, p.full_name]) || []);
  }

  // Helper function to get category name by ID
  private static async getCategoryName(categoryId: string): Promise<string> {
    try {
      const { data: category } = await supabase
        .from('task_categories')
        .select('name')
        .eq('id', categoryId)
        .maybeSingle()
      return category?.name || 'Other'
    } catch (error) {
      console.error('Error fetching category name:', error)
      return 'Other'
    }
  }

  // Helper function to get category names for multiple tasks
  private static async getCategoryNames(categoryIds: string[]): Promise<Map<string, string>> {
    try {
      const { data: categories } = await supabase
        .from('task_categories')
        .select('id, name')
        .in('id', categoryIds)
      
      const categoryMap = new Map<string, string>()
      categories?.forEach(category => {
        categoryMap.set(category.id, category.name)
      })
      return categoryMap
    } catch (error) {
      console.error('Error fetching category names:', error)
      return new Map()
    }
  }

  // Get all available tasks (open status, not assigned to current user)
  static async getAvailableTasks(userId: string): Promise<Task[]> {
    try {
      console.log('🚀 NEW CODE RUNNING - Getting available tasks for user:', userId)
      
      // First get the profile ID for this user to exclude their own tasks
      const { data: userProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id')
        .eq('user_id', userId)
        .maybeSingle()

      console.log('User profile lookup result:', { userProfile, profileError })
      console.log('DEBUG: userProfile.user_id =', userProfile?.user_id)

      if (!userProfile) {
        console.log('No profile found, getting all open tasks')
        // If no profile, just get all open tasks
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'open')
          .order('created_at', { ascending: false })

        if (error) throw error

        // Get customer names and category names separately to avoid foreign key issues
        const customerIds = [...new Set(data.map(task => task.customer_id))];
        const categoryIds = [...new Set(data.map(task => task.category_id))];
        const customerMap = await this.getProfileNames(customerIds);
        const categoryMap = await this.getCategoryNames(categoryIds);

        return data.map(task => ({
          ...task,
          customer_name: customerMap.get(task.customer_id) || 'Unknown',
          category_name: categoryMap.get(task.category_id) || 'Other',
          applications_count: 0
        }))
      }
      
      console.log('Excluding tasks created by user_id:', userProfile.user_id)
      
      // Use direct query instead of fetching all tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .neq('user_id', userProfile.user_id) // Exclude tasks created by this user
        .order('created_at', { ascending: false })

      if (tasksError) {
        console.error('Error fetching available tasks:', tasksError)
        throw tasksError
      }

      console.log('Available tasks count:', tasks?.length || 0)
      console.log('Available tasks query result:', { data: tasks?.length || 0, error: null })

      if (!tasks || tasks.length === 0) {
        console.log('No available tasks found')
        return []
      }

      // Get customer names and category names separately to avoid foreign key issues
      const customerIds = [...new Set(tasks.map(task => task.customer_id))];
      const categoryIds = [...new Set(tasks.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      const mappedTasks = tasks.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        category_name: categoryMap.get(task.category_id) || 'Other',
        applications_count: 0
      }))

      console.log('Returning available tasks:', mappedTasks.length)
      return mappedTasks
    } catch (error) {
      const appError = handleError(error, 'getAvailableTasks')
      console.error('Error getting available tasks:', appError)
      return []
    }
  }

  // Get user's posted tasks - OPTIMIZED VERSION
  static async getMyTasks(userId: string): Promise<Task[]> {
    try {
      console.log('🚀 OPTIMIZED CODE RUNNING - Getting my tasks for user:', userId)
      
      // First get the profile ID for this user
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, full_name')
        .eq('user_id', userId)
        .maybeSingle()

      console.log('Profile lookup for my tasks:', { profile, profileError })

      if (!profile) {
        console.log('No profile found for my tasks')
        return []
      }

      console.log('Getting my tasks for user_id:', profile.user_id)
      console.log('Profile details:', { id: profile.id, user_id: profile.user_id, full_name: profile.full_name })

      // Use direct query instead of fetching all tasks
      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', profile.user_id)
        .order('created_at', { ascending: false })

      if (tasksError) {
        console.error('Error fetching my tasks:', tasksError)
        throw tasksError
      }

      console.log('My tasks count:', tasks?.length || 0)
      console.log('My tasks query result:', { data: tasks?.length || 0, error: null })

      if (!tasks || tasks.length === 0) {
        console.log('No tasks found for user')
        return []
      }

      // Get tasker names and category names separately if any tasks have taskers
      const taskerIds = tasks.filter(task => task.tasker_id).map(task => task.tasker_id);
      const categoryIds = [...new Set(tasks.map(task => task.category_id))];
      const taskerMap = await this.getProfileNames(taskerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      const mappedTasks = tasks.map(task => ({
        ...task,
        tasker_name: task.tasker_id ? taskerMap.get(task.tasker_id) || 'Unknown' : '',
        category_name: categoryMap.get(task.category_id) || 'Other',
        applications_count: 0 // Will be calculated separately
      }))

      console.log('Returning my tasks:', mappedTasks.length)
      return mappedTasks
    } catch (error) {
      const appError = handleError(error, 'getMyTasks')
      console.error('Error getting my tasks:', appError)
      return []
    }
  }

  // Get user's assigned tasks (as tasker)
  static async getMyAssignedTasks(userId: string): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('tasker_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get customer names and category names separately
      const customerIds = [...new Set(data.map(task => task.customer_id))];
      const categoryIds = [...new Set(data.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      return data.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        category_name: categoryMap.get(task.category_id) || 'Other',
        applications_count: 0 // Will be calculated separately
      }))
    } catch (error) {
      console.error('Error getting assigned tasks:', error)
      return []
    }
  }

  // Create a new task
  static async createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at' | 'applications_count'>): Promise<Task | null> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([taskData])
        .select('*')
        .single()

      if (error) throw error

      // Get customer name separately
      const customerResult = await supabase.from('profiles').select('full_name').eq('id', data.customer_id).maybeSingle()
      const customerName = customerResult.data?.full_name || 'Unknown'

      // Send notifications to relevant taskers
      try {
        // Get all active taskers (you might want to filter by location, category, etc.)
        const { data: taskers } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'tasker')
          .eq('is_active', true)

        if (taskers && taskers.length > 0) {
          const taskerIds = taskers.map(t => t.id)
          await UnifiedNotificationService.notifyNewTaskPosted(
            data.id,
            data.title,
            customerName,
            taskerIds
          )
          console.log('🚀 TASK SERVICE - Notifications sent to taskers for new task:', data.id)
        }
      } catch (notificationError) {
        console.error('Error sending task notifications:', notificationError)
        // Don't throw here - task creation should succeed even if notifications fail
      }

      // Get category name
      const categoryName = await this.getCategoryName(data.category_id)

      return {
        ...data,
        customer_name: customerName,
        category_name: categoryName,
        applications_count: 0
      }
    } catch (error) {
      console.error('Error creating task:', error)
      throw error
    }
  }

  // Apply to a task
  static async applyToTask(taskId: string, taskerId: string, proposedPrice: number, message: string, availabilityDate: string, userId: string): Promise<boolean> {
    try {
      // Check if already applied
      const { data: existingApplication } = await supabase
        .from('task_applications')
        .select('id')
        .eq('task_id', taskId)
        .eq('tasker_id', taskerId)
        .maybeSingle()

      if (existingApplication) {
        return false // Already applied
      }

      // Create application
      const { data: applicationData, error } = await supabase
        .from('task_applications')
        .insert([{
          task_id: taskId,
          tasker_id: taskerId,
          user_id: userId, // Add user_id field
          proposed_price: proposedPrice,
          estimated_time: 1, // Default to 1 hour
          message,
          availability_date: availabilityDate,
          status: 'pending'
        }])
        .select('id')
        .single()

      if (error) throw error

      // Send notification to customer
      try {
        // Get task details and customer info
        const { data: taskData } = await supabase
          .from('tasks')
          .select('title, customer_id')
          .eq('id', taskId)
          .single()

        // Get tasker name
        const { data: taskerData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', taskerId)
          .single()

        if (taskData && taskerData && applicationData) {
          await UnifiedNotificationService.notifyTaskApplication(
            taskId,
            taskData.title,
            taskData.customer_id,
            taskerData.full_name,
            applicationData.id
          )
          console.log('🚀 TASK SERVICE - Application notification sent for task:', taskId)
        }
      } catch (notificationError) {
        console.error('Error sending application notification:', notificationError)
        // Don't throw here - application should succeed even if notification fails
      }

      return true
    } catch (error) {
      console.error('Error applying to task:', error)
      return false
    }
  }

  // Get task applications
  static async getTaskApplications(taskId: string): Promise<TaskApplication[]> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get tasker names separately
      const taskerIds = data.map(app => app.tasker_id);
      const taskerMap = await this.getProfileNames(taskerIds);

      return data.map(app => ({
        ...app,
        tasker_name: taskerMap.get(app.tasker_id) || 'Unknown',
        tasker_rating: 0 // Will be calculated separately if needed
      }))
    } catch (error) {
      console.error('Error getting task applications:', error)
      return []
    }
  }

  // Get user's applications
  static async getMyApplications(userId: string): Promise<TaskApplication[]> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select(`
          *,
          task:tasks!task_id(title, status, budget)
        `)
        .eq('tasker_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data.map(app => ({
        ...app,
        tasker_name: '', // Not needed for my applications
        tasker_rating: 0
      }))
    } catch (error) {
      console.error('Error getting my applications:', error)
      return []
    }
  }

  // Search tasks
  static async searchTasks(query: string, category?: string): Promise<Task[]> {
    try {
      let queryBuilder = supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)

      if (category && category !== 'All') {
        queryBuilder = queryBuilder.eq('category', category)
      }

      const { data, error } = await queryBuilder.order('created_at', { ascending: false })

      if (error) throw error

      // Get customer names and category names separately
      const customerIds = [...new Set(data.map(task => task.customer_id))];
      const categoryIds = [...new Set(data.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      return data.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        category_name: categoryMap.get(task.category_id) || 'Other',
        applications_count: 0
      }))
    } catch (error) {
      console.error('Error searching tasks:', error)
      return []
    }
  }

  // Get task categories
  static async getTaskCategories(): Promise<{ id: string; name: string; slug: string }[]> {
    try {
      // Return hardcoded categories for now
      return [
        { id: '1', name: 'Cleaning', slug: 'cleaning' },
        { id: '2', name: 'Repairs', slug: 'repairs' },
        { id: '3', name: 'Moving', slug: 'moving' },
        { id: '4', name: 'Gardening', slug: 'gardening' },
        { id: '5', name: 'Delivery', slug: 'delivery' },
        { id: '6', name: 'Pet Care', slug: 'pet-care' },
        { id: '7', name: 'Tutoring', slug: 'tutoring' },
        { id: '8', name: 'Other', slug: 'other' }
      ]
    } catch (error) {
      console.error('Error getting task categories:', error)
      return []
    }
  }

  // Get featured tasks
  // Featured tasks: Budget > 5000 ETB OR General Category tasks
  static async getFeaturedTasks(): Promise<Task[]> {
    try {
      // First, get the General category ID
      const { data: generalCategory } = await supabase
        .from('task_categories')
        .select('id')
        .eq('name', 'General')
        .single()

      const generalCategoryId = generalCategory?.id

      // Build query: tasks with budget > 5000 ETB OR General category
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')

      // Build OR condition: budget > 5000 OR category = General
      if (generalCategoryId) {
        query = query.or(`budget.gt.5000,category_id.eq.${generalCategoryId}`)
      } else {
        // If General category not found, just filter by budget
        query = query.gt('budget', 5000)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error

      // Get customer names and category names separately
      const customerIds = [...new Set(data.map(task => task.customer_id))];
      const categoryIds = [...new Set(data.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      return data?.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        customer_avatar: '', // Will be added later if needed
        category_name: categoryMap.get(task.category_id) || 'Other',
      })) || []
    } catch (error) {
      console.error('Error getting featured tasks:', error)
      return []
    }
  }

  // Get recent tasks
  static async getRecentTasks(): Promise<Task[]> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      // Get customer names and category names separately
      const customerIds = [...new Set(data.map(task => task.customer_id))];
      const categoryIds = [...new Set(data.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      return data?.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        customer_avatar: '', // Will be added later if needed
        category_name: categoryMap.get(task.category_id) || 'Other',
      })) || []
    } catch (error) {
      console.error('Error getting recent tasks:', error)
      return []
    }
  }

  // Get a single task by ID with all details
  static async getTaskById(taskId: string): Promise<Task | null> {
    try {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .single()

      if (error) throw error
      if (!data) {
        return null
      }

      // Get customer name
      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.customer_id)
        .maybeSingle()

      // Get tasker name if assigned
      let taskerName = ''
      if (data.tasker_id) {
        const { data: tasker } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', data.tasker_id)
          .maybeSingle()
        taskerName = tasker?.full_name || ''
      }

      // Get category name from task_categories table
      let categoryName = 'Other'
      if (data.category_id) {
        const { data: category } = await supabase
          .from('task_categories')
          .select('name')
          .eq('id', data.category_id)
          .maybeSingle()
        categoryName = category?.name || 'Other'
      }

      return {
        ...data,
        customer_name: customer?.full_name || '',
        tasker_name: taskerName,
        category_name: categoryName,
        applications_count: 0 // Will be calculated separately if needed
      }
    } catch (error) {
      console.error('Error getting task by ID:', error)
      return null
    }
  }

  // Accept an application
  static async acceptApplication(taskId: string, applicationId: string): Promise<boolean> {
    try {
      // Get application details with task info
      const { data: application, error: appError } = await supabase
        .from('task_applications')
        .select(`
          tasker_id, 
          proposed_price,
          tasks!inner(
            id,
            title,
            customer_id,
            status
          )
        `)
        .eq('id', applicationId)
        .single()

      if (appError) throw appError

      // Update task status and assign tasker
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          status: 'assigned',
          tasker_id: application.tasker_id,
          final_price: application.proposed_price,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (taskError) throw taskError

      // Update application status
      const { error: appUpdateError } = await supabase
        .from('task_applications')
        .update({ 
          status: 'accepted',
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)

      if (appUpdateError) throw appUpdateError

      return true
    } catch (error) {
      console.error('Error accepting application:', error)
      return false
    }
  }

  // Update task status with proper workflow validation
  static async updateTaskStatus(taskId: string, status: Task['status'], updatedBy: string): Promise<boolean> {
    try {
      // Get current task details
      const { data: currentTask, error: fetchError } = await supabase
        .from('tasks')
        .select('id, status, customer_id, tasker_id, created_at, expires_at')
        .eq('id', taskId)
        .single()

      if (fetchError || !currentTask) {
        throw new Error('Task not found')
      }

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        'draft': ['open', 'cancelled'],
        'open': ['assigned', 'cancelled'],
        'assigned': ['in_progress', 'cancelled'],
        'in_progress': ['completed', 'cancelled'],
        'completed': [], // Terminal state
        'cancelled': [] // Terminal state
      }

      const currentStatus = currentTask.status as Task['status']
      if (!validTransitions[currentStatus]?.includes(status)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${status}`)
      }

      // Check permissions
      if (status === 'open' && currentTask.customer_id !== updatedBy) {
        throw new Error('Only task owner can open tasks')
      }
      if (status === 'assigned' && currentTask.customer_id !== updatedBy) {
        throw new Error('Only task owner can assign tasks')
      }
      if (status === 'in_progress' && currentTask.tasker_id !== updatedBy) {
        throw new Error('Only assigned tasker can start task')
      }
      if (status === 'completed' && currentTask.tasker_id !== updatedBy) {
        throw new Error('Only assigned tasker can complete task')
      }

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      }

      // Set specific timestamps based on status
      if (status === 'open') {
        updateData.published_at = new Date().toISOString()
        // Set expiration date (default 30 days from now)
        updateData.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      } else if (status === 'assigned') {
        updateData.assigned_at = new Date().toISOString()
      } else if (status === 'in_progress') {
        updateData.started_at = new Date().toISOString()
      } else if (status === 'completed') {
        updateData.completed_at = new Date().toISOString()
      } else if (status === 'cancelled') {
        updateData.cancelled_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error updating task status:', error)
      return false
    }
  }

  // Complete a task (OPTIMIZED VERSION)
  static async completeTask(taskId: string, completedBy: string, notes?: string): Promise<boolean> {
    try {
      console.log('🚀 OPTIMIZED TASK COMPLETION - Starting for task:', taskId)
      
      // Get task details in a single query
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, customer_id, tasker_id, status, final_price, budget')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        console.error('❌ Task not found:', taskError)
        throw new Error('Task not found')
      }

      // Check if task can be completed
      if (task.status !== 'in_progress' && task.status !== 'assigned') {
        console.error('❌ Task cannot be completed, current status:', task.status)
        throw new Error('Task must be in progress to be completed')
      }

      console.log('✅ Task validation passed, proceeding with completion')

      // 1. Update task status immediately (critical operation)
      const { error: updateError } = await supabase
          .from('tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        .eq('id', taskId)

      if (updateError) {
        console.error('❌ Failed to update task status:', updateError)
        throw updateError
      }

      console.log('✅ Task status updated successfully, returning immediately')

      // 2-4. Execute non-critical operations in background (fire-and-forget)
      Promise.allSettled([
        // Delete chat and messages (non-blocking)
        this.deleteChatForCompletedTask(taskId),
        // Create payment requirement if needed
        this.createPaymentForCompletedTask(task),
        // Send completion notifications
        this.sendCompletionNotifications(task, completedBy)
      ]).catch(error => {
        console.error('Error in background operations:', error)
        // Don't fail the main operation if background operations fail
      })

      // Return immediately after task status update
      return true

    } catch (error) {
      console.error('❌ Error completing task:', error)
      return false
    }
  }

  // Helper method to delete chat for completed task
  private static async deleteChatForCompletedTask(taskId: string): Promise<void> {
    try {
      console.log('🗑️ Deleting chat for completed task:', taskId)
      
      // Find chat for this task
      const { data: chat, error: findError } = await supabase
        .from('chats')
        .select('id')
        .eq('task_id', taskId)
        .maybeSingle()

      if (findError) {
        console.error('Error finding chat:', findError)
        return
      }

      if (!chat) {
        console.log('ℹ️ No chat found for task:', taskId)
        return
      }

      // Delete messages and chat in parallel
      const [messagesResult, chatResult] = await Promise.allSettled([
        supabase
          .from('messages_new')
          .delete()
          .eq('chat_id', chat.id),
        supabase
          .from('chats')
          .delete()
          .eq('id', chat.id)
      ])

      if (messagesResult.status === 'rejected') {
        console.error('Error deleting messages:', messagesResult.reason)
      }
      if (chatResult.status === 'rejected') {
        console.error('Error deleting chat:', chatResult.reason)
      }

      if (messagesResult.status === 'fulfilled' && chatResult.status === 'fulfilled') {
        console.log('✅ Chat and messages deleted successfully for task:', taskId)
      }

    } catch (error) {
      console.error('Error in deleteChatForCompletedTask:', error)
    }
  }

  // Helper method to create payment for completed task
  private static async createPaymentForCompletedTask(task: any): Promise<void> {
    try {
      if (!task.tasker_id) {
        console.log('ℹ️ No tasker assigned, skipping payment creation')
        return
      }

      const paymentAmount = task.final_price || task.budget
      if (!paymentAmount) {
        console.log('ℹ️ No payment amount, skipping payment creation')
        return
      }

      console.log('💰 Creating payment requirement for task:', task.id)

      // Import PaymentService dynamically to avoid circular dependencies
      const { PaymentService } = await import('./PaymentService')
      
      await PaymentService.createTaskPayment(
        task.id,
        task.customer_id,
        paymentAmount,
        `Payment for completed task: ${task.title}`
      )

      console.log('✅ Payment requirement created successfully')

    } catch (error) {
      console.error('Error creating payment for completed task:', error)
    }
  }

  // Helper method to send completion notifications
  private static async sendCompletionNotifications(task: any, completedBy: string): Promise<void> {
    try {
      console.log('📢 Sending completion notifications for task:', task.id)

      // Import notification services dynamically
      const { UnifiedNotificationService } = await import('./UnifiedNotificationService')

      // Notify customer
      if (task.customer_id !== completedBy) {
        await UnifiedNotificationService.createNotification(
          task.customer_id,
          'Task Completed',
          `Task "${task.title}" has been completed by the tasker.`,
          'task',
          { task_id: task.id, action: 'task_completed' }
        )
      }

      // Notify tasker
      if (task.tasker_id && task.tasker_id !== completedBy) {
        await UnifiedNotificationService.createNotification(
          task.tasker_id,
          'Task Completed',
          `You have successfully completed task "${task.title}".`,
          'task',
          { task_id: task.id, action: 'task_completed' }
        )
      }

      console.log('✅ Completion notifications sent successfully')

    } catch (error) {
      console.error('Error sending completion notifications:', error)
    }
  }

  // Cancel a task (with proper workflow)
  static async cancelTask(taskId: string, cancelledBy: string, reason: string): Promise<boolean> {
    try {
      // Get task details
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('id, title, customer_id, tasker_id, status')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        throw new Error('Task not found')
      }

      // Update task status
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (updateError) throw updateError

      return true
    } catch (error) {
      console.error('Error cancelling task:', error)
      return false
    }
  }

  // Handle expired tasks
  static async handleExpiredTasks(): Promise<{ expired: number; updated: number }> {
    try {
      const now = new Date().toISOString()
      
      // Find expired tasks that are still open
      const { data: expiredTasks, error: fetchError } = await supabase
        .from('tasks')
        .select('id, status')
        .eq('status', 'open')
        .lt('expires_at', now)

      if (fetchError) throw fetchError

      if (!expiredTasks || expiredTasks.length === 0) {
        return { expired: 0, updated: 0 }
      }

      // Update expired tasks to cancelled status
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: 'Task expired',
          updated_at: now
        })
        .in('id', expiredTasks.map(task => task.id))

      if (updateError) throw updateError

      return { expired: expiredTasks.length, updated: expiredTasks.length }
    } catch (error) {
      console.error('Error handling expired tasks:', error)
      return { expired: 0, updated: 0 }
    }
  }

  // Get tasks expiring soon (within specified days)
  static async getTasksExpiringSoon(days: number = 3): Promise<Task[]> {
    try {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + days)
      
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'open')
        .lte('expires_at', futureDate.toISOString())
        .gte('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true })

      if (error) throw error

      // Get customer names and category names
      const customerIds = [...new Set(data.map(task => task.customer_id))];
      const categoryIds = [...new Set(data.map(task => task.category_id))];
      const customerMap = await this.getProfileNames(customerIds);
      const categoryMap = await this.getCategoryNames(categoryIds);

      return data.map(task => ({
        ...task,
        customer_name: customerMap.get(task.customer_id) || 'Unknown',
        category_name: categoryMap.get(task.category_id) || 'Other',
        applications_count: 0
      }))
    } catch (error) {
      console.error('Error getting tasks expiring soon:', error)
      return []
    }
  }

  // Bulk operations
  static async bulkUpdateTaskStatus(taskIds: string[], status: Task['status'], updatedBy: string): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] }

    for (const taskId of taskIds) {
      try {
        const success = await this.updateTaskStatus(taskId, status, updatedBy)
        if (success) {
          results.success++
        } else {
          results.failed++
          results.errors.push(`Failed to update task ${taskId}`)
        }
      } catch (error) {
        results.failed++
        results.errors.push(`Error updating task ${taskId}: ${error}`)
      }
    }

    return results
  }

  // Bulk delete tasks (only for draft or cancelled tasks)
  static async bulkDeleteTasks(taskIds: string[], userId: string): Promise<{ success: number; failed: number; errors: string[] }> {
    const results = { success: 0, failed: 0, errors: [] as string[] }

    try {
      // First, verify all tasks belong to user and are in deletable status
      const { data: tasks, error: fetchError } = await supabase
        .from('tasks')
        .select('id, customer_id, status')
        .in('id', taskIds)

      if (fetchError) throw fetchError

      const deletableTasks = tasks.filter(task => 
        task.customer_id === userId && 
        (task.status === 'draft' || task.status === 'cancelled')
      )

      if (deletableTasks.length !== taskIds.length) {
        results.errors.push('Some tasks cannot be deleted (not owned by user or not in deletable status)')
      }

      if (deletableTasks.length > 0) {
        const { error: deleteError } = await supabase
          .from('tasks')
          .delete()
          .in('id', deletableTasks.map(task => task.id))

        if (deleteError) throw deleteError

        results.success = deletableTasks.length
        results.failed = taskIds.length - deletableTasks.length
      } else {
        results.failed = taskIds.length
      }

    } catch (error) {
      results.failed = taskIds.length
      results.errors.push(`Bulk delete error: ${error}`)
    }

    return results
  }

  // Update a task (only by owner)
  static async updateTask(taskId: string, userId: string, updates: Partial<Task>): Promise<Task | null> {
    try {
      // First, verify the task exists and belongs to the user
      const { data: existingTask, error: fetchError } = await supabase
        .from('tasks')
        .select('customer_id, status')
        .eq('id', taskId)
        .single()

      if (fetchError) {
        console.error('Error fetching task:', fetchError)
        throw new Error('Task not found')
      }

      if (existingTask.customer_id !== userId) {
        throw new Error('You do not have permission to update this task')
      }

      // Only allow updates for tasks that are in draft or open status
      if (!['draft', 'open'].includes(existingTask.status)) {
        throw new Error('Cannot update task that is already assigned or in progress')
      }

      // Update the task
      const { data, error } = await supabase
        .from('tasks')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data as Task
    } catch (error) {
      console.error('Error updating task:', error)
      throw error
    }
  }

  // Delete a task (only by owner)
  static async deleteTask(taskId: string, userId: string): Promise<boolean> {
    try {
      // First, verify the task exists and belongs to the user
      const { data: task, error: fetchError } = await supabase
        .from('tasks')
        .select('customer_id, status')
        .eq('id', taskId)
        .single()

      if (fetchError) {
        console.error('Error fetching task:', fetchError)
        throw new Error('Task not found')
      }

      if (task.customer_id !== userId) {
        throw new Error('You do not have permission to delete this task')
      }

      // Allow deletion of draft or open (not yet assigned) tasks
      if (!['draft', 'open', 'cancelled'].includes(task.status)) {
        throw new Error('Cannot delete task in its current status')
      }

      // Delete the task
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error deleting task:', error)
      throw error
    }
  }

  // Get task statistics for dashboard
  static async getTaskStatistics(userId: string): Promise<{
    totalTasks: number
    openTasks: number
    assignedTasks: number
    completedTasks: number
    cancelledTasks: number
    totalEarnings: number
    averageRating: number
  }> {
    try {
      // Get user's profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!profile) {
        return {
          totalTasks: 0,
          openTasks: 0,
          assignedTasks: 0,
          completedTasks: 0,
          cancelledTasks: 0,
          totalEarnings: 0,
          averageRating: 0
        }
      }

      // Get tasks as customer
      const { data: customerTasks } = await supabase
        .from('tasks')
        .select('status, budget, final_price, customer_rating')
        .eq('customer_id', profile.id)

      // Get tasks as tasker
      const { data: taskerTasks } = await supabase
        .from('tasks')
        .select('status, budget, final_price, tasker_rating')
        .eq('tasker_id', profile.id)

      const allTasks = [...(customerTasks || []), ...(taskerTasks || [])]

      const stats = {
        totalTasks: allTasks.length,
        openTasks: allTasks.filter(t => t.status === 'open').length,
        assignedTasks: allTasks.filter(t => t.status === 'assigned').length,
        completedTasks: allTasks.filter(t => t.status === 'completed').length,
        cancelledTasks: allTasks.filter(t => t.status === 'cancelled').length,
        totalEarnings: allTasks
          .filter(t => t.status === 'completed' && t.final_price)
          .reduce((sum, t) => sum + (t.final_price || 0), 0),
        averageRating: 0
      }

      // Calculate average rating
      const ratings = allTasks
        .map(t => {
          const customerTask = t as any
          const taskerTask = t as any
          return customerTask.customer_rating || taskerTask.tasker_rating || 0
        })
        .filter(r => r && r > 0)
      
      if (ratings.length > 0) {
        stats.averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      }

      return stats
    } catch (error) {
      console.error('Error getting task statistics:', error)
      return {
        totalTasks: 0,
        openTasks: 0,
        assignedTasks: 0,
        completedTasks: 0,
        cancelledTasks: 0,
        totalEarnings: 0,
        averageRating: 0
      }
    }
  }
}
