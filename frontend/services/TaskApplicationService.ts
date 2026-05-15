import { supabase } from '../lib/supabase'
import { SimpleNotificationService } from './SimpleNotificationService'
import { PushNotificationService } from './PushNotificationService'
import { UnifiedNotificationService } from './UnifiedNotificationService'

export interface TaskApplication {
  id: string
  task_id: string
  tasker_id: string
  proposed_price: number
  estimated_time: number
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  created_at: string
  updated_at: string
  // Additional fields for display
  tasker_name?: string
  tasker_avatar?: string
  task_title?: string
  customer_name?: string
}

export class TaskApplicationService {
  // Create a new application
  static async createApplication(applicationData: Omit<TaskApplication, 'id' | 'created_at' | 'updated_at' | 'tasker_name' | 'tasker_avatar' | 'task_title' | 'customer_name'> & { user_id: string }): Promise<TaskApplication | null> {
    try {
      // Add user_id field to match the database schema
      // user_id should reference auth.users.id, not profiles.id
      const applicationWithUserId = {
        ...applicationData,
        user_id: applicationData.user_id // This should be passed from the calling code
      }

      const { data, error } = await supabase
        .from('task_applications')
        .insert([applicationWithUserId])
        .select('*')
        .single()

      if (error) throw error

      // Get tasker and task details
      const [taskerResult, taskResult] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', data.tasker_id).maybeSingle(),
        supabase.from('tasks').select('title, customer_id').eq('id', data.task_id).maybeSingle()
      ])

      // Get customer name
      let customerName = ''
      if (taskResult.data?.customer_id) {
        const customerResult = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', taskResult.data.customer_id)
          .single()
        customerName = customerResult.data?.full_name || ''
      }

      const application = {
        ...data,
        tasker_name: taskerResult.data?.full_name,
        tasker_avatar: taskerResult.data?.avatar_url,
        task_title: taskResult.data?.title,
        customer_name: customerName
      }

      // Send notification to customer
      await SimpleNotificationService.notifyTaskApplication(
        data.task_id, 
        application.tasker_name || 'Tasker', 
        application.task_title || 'Task'
      )
      
      // Also send unified notification
      console.log('🚀 TASK APPLICATION SERVICE - Sending unified notification for application:', data.id)
      console.log('  - Task ID:', data.task_id)
      console.log('  - Task Title:', application.task_title || 'Task')
      console.log('  - Customer ID:', taskResult.data?.customer_id || '')
      console.log('  - Tasker Name:', application.tasker_name || 'Tasker')
      
      try {
        await UnifiedNotificationService.notifyTaskApplication(
          data.task_id,
          application.task_title || 'Task',
          taskResult.data?.customer_id || '',
          application.tasker_name || 'Tasker',
          data.id
        )
        console.log('✅ TASK APPLICATION SERVICE - Unified notification sent successfully')
      } catch (notificationError) {
        console.error('❌ TASK APPLICATION SERVICE - Error sending unified notification:', notificationError)
      }
      
      // Send push notification
      await PushNotificationService.createApplicationNotification(
        application.tasker_name || 'Tasker',
        application.task_title || 'Task',
        data.task_id
      )

      return application
    } catch (error) {
      console.error('Error creating application:', error)
      throw error
    }
  }

  // Get applications for a specific task
  static async getTaskApplications(taskId: string): Promise<TaskApplication[]> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get tasker names and avatars
      const taskerIds = [...new Set(data.map(app => app.tasker_id))]
      const { data: taskers } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', taskerIds)

      const taskerMap = new Map(taskers?.map(t => [t.id, t]) || [])

      return data.map(app => ({
        ...app,
        tasker_name: taskerMap.get(app.tasker_id)?.full_name,
        tasker_avatar: taskerMap.get(app.tasker_id)?.avatar_url,
        task_title: '', // Will be filled by caller if needed
        customer_name: '' // Will be filled by caller if needed
      }))
    } catch (error) {
      console.error('Error getting task applications:', error)
      return []
    }
  }

  // Check if user has already applied to a specific task
  static async hasUserAppliedToTask(userId: string, taskId: string): Promise<boolean> {
    try {
      console.log('TaskApplicationService: Checking if user', userId, 'has applied to task', taskId)
      
      // First get the profile ID for this user
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      console.log('TaskApplicationService: Profile lookup result:', profile)

      if (!profile) {
        console.log('TaskApplicationService: No profile found for user', userId)
        return false
      }

      const { data, error } = await supabase
        .from('task_applications')
        .select('id, tasker_id, user_id')
        .eq('tasker_id', profile.id)
        .eq('task_id', taskId)
        .limit(1)

      console.log('TaskApplicationService: Application lookup result:', { data, error })
      console.log('TaskApplicationService: Looking for tasker_id:', profile.id, 'task_id:', taskId)
      
      // Also check by user_id in case there's a mismatch
      if (!data || data.length === 0) {
        console.log('TaskApplicationService: No application found by tasker_id, checking by user_id')
        const { data: userData, error: userError } = await supabase
          .from('task_applications')
          .select('id, tasker_id, user_id')
          .eq('user_id', profile.id)
          .eq('task_id', taskId)
          .limit(1)
        
        console.log('TaskApplicationService: User_id lookup result:', { data: userData, error: userError })
        
        if (userData && userData.length > 0) {
          console.log('TaskApplicationService: Found application by user_id instead of tasker_id')
          return true
        }
      }

      if (error) throw error
      const hasApplied = data && data.length > 0
      console.log('TaskApplicationService: User has applied:', hasApplied)
      return hasApplied
    } catch (error) {
      console.error('Error checking if user has applied:', error)
      return false
    }
  }

  // Get applications by a specific tasker
  static async getUserApplications(userId: string): Promise<TaskApplication[]> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select('*')
        .eq('tasker_id', userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Get task details
      const taskIds = [...new Set(data.map(app => app.task_id))]
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, customer_id')
        .in('id', taskIds)

      // Get customer names
      const customerIds = [...new Set(tasks?.map(t => t.customer_id) || [])]
      const { data: customers } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', customerIds)

      const taskMap = new Map(tasks?.map(t => [t.id, t]) || [])
      const customerMap = new Map(customers?.map(c => [c.id, c.full_name]) || [])

      return data.map(app => {
        const task = taskMap.get(app.task_id)
        return {
          ...app,
          tasker_name: '', // Not needed for user's own applications
          tasker_avatar: '', // Not needed for user's own applications
          task_title: task?.title || '',
          customer_name: task?.customer_id ? customerMap.get(task.customer_id) || '' : ''
        }
      })
    } catch (error) {
      console.error('Error getting user applications:', error)
      return []
    }
  }

  // Update application status
  static async updateApplicationStatus(applicationId: string, status: TaskApplication['status']): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('task_applications')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error updating application status:', error)
      return false
    }
  }

  // Accept an application (and assign task to tasker) - OPTIMIZED VERSION
  static async acceptApplication(taskId: string, applicationId: string): Promise<boolean> {
    try {
      // Get application details with task info in one query
      const { data: application, error: fetchError } = await supabase
        .from('task_applications')
        .select(`
          tasker_id,
          proposed_price,
          task_id,
          tasks!inner(
            id,
            title,
            customer_id,
            status
          )
        `)
        .eq('id', applicationId)
        .single()

      if (fetchError) throw fetchError

      const taskData = application.tasks as any

      // Execute all database operations in parallel
      const [updateAppResult, updateTaskResult, rejectOthersResult] = await Promise.all([
        // Update application status
        supabase
          .from('task_applications')
          .update({
            status: 'accepted',
            updated_at: new Date().toISOString()
          })
          .eq('id', applicationId),
        
        // Update task with assigned tasker
        supabase
          .from('tasks')
          .update({
            tasker_id: application.tasker_id,
            status: 'assigned',
            final_price: application.proposed_price,
            updated_at: new Date().toISOString()
          })
          .eq('id', application.task_id),
        
        // Reject all other applications for this task
        supabase
          .from('task_applications')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('task_id', application.task_id)
          .neq('id', applicationId)
      ])

      // Check for errors
      if (updateAppResult.error) throw updateAppResult.error
      if (updateTaskResult.error) throw updateTaskResult.error
      if (rejectOthersResult.error) throw rejectOthersResult.error

      // Execute notifications and chat creation in parallel (non-blocking, fire-and-forget)
      // Pass task data we already have to avoid re-fetching
      Promise.all([
        // Create chat between customer and tasker (optimized - uses data we already have)
        this.createChatForAcceptedApplication(application.task_id, application.tasker_id, taskData.customer_id, taskData.title),
        
        // Send notifications
        this.sendAcceptanceNotifications(application.task_id, application.tasker_id, taskData.title, taskData.customer_id)
      ]).catch(error => {
        console.error('Error in background operations:', error)
        // Don't fail the main operation if notifications fail
      })

      // Return immediately - chat creation happens in background
      return true
    } catch (error) {
      console.error('Error accepting application:', error)
      return false
    }
  }

  // Helper method to send acceptance notifications
  private static async sendAcceptanceNotifications(taskId: string, taskerId: string, taskTitle: string, customerId: string): Promise<void> {
    try {
      // Get customer name
      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', customerId)
        .single()

      // Send notifications in parallel
      await Promise.all([
        SimpleNotificationService.notifyTaskAccepted(
          customer?.full_name || 'Customer',
          taskTitle,
          taskId
        ),
        UnifiedNotificationService.notifyApplicationAccepted(
          taskId,
          taskTitle,
          taskerId,
          customer?.full_name || 'Customer'
        )
      ])
    } catch (error) {
      console.error('Error sending acceptance notifications:', error)
    }
  }

  // Helper method to send rejection notifications
  private static async sendRejectionNotifications(taskId: string, taskerId: string, taskTitle: string, customerId: string): Promise<void> {
    try {
      // Get customer name
      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', customerId)
        .single()

      // Send notifications in parallel
      await Promise.all([
        SimpleNotificationService.notifyTaskRejected(
          customer?.full_name || 'Customer',
          taskTitle,
          taskId
        ),
        UnifiedNotificationService.notifyApplicationRejected(
          taskId,
          taskTitle,
          taskerId,
          customer?.full_name || 'Customer'
        )
      ])
    } catch (error) {
      console.error('Error sending rejection notifications:', error)
    }
  }

  // Create a chat when an application is accepted
  // Optimized: accepts customerId and title to avoid re-fetching task data
  static async createChatForAcceptedApplication(taskId: string, taskerId: string, customerId?: string, taskTitle?: string): Promise<void> {
    try {
      // If customerId not provided, fetch it (backward compatibility)
      let customer = customerId
      let title = taskTitle
      
      if (!customer || !title) {
        const { data: task, error: taskError } = await supabase
          .from('tasks')
          .select('customer_id, title')
          .eq('id', taskId)
          .single()

        if (taskError || !task) {
          console.error('Error getting task details:', taskError)
          return
        }
        
        customer = task.customer_id
        title = task.title
      }

      // Import ChatService dynamically to avoid circular imports
      const { ChatService } = await import('./ChatService')
      
      // Create chat between customer and tasker
      const chat = await ChatService.getOrCreateChat(taskId, customer, taskerId)
      
      if (chat) {
        console.log('Chat created successfully for accepted application')
        
        // Send initial welcome message (non-blocking)
        ChatService.sendMessage(
          chat.id,
          customer,
          `Great! I've accepted your application for "${title}". Let's discuss the details!`,
          'text'
        ).catch(error => {
          console.error('Error sending welcome message:', error)
          // Don't fail chat creation if message fails
        })
      } else {
        console.error('Failed to create chat for accepted application')
      }
    } catch (error) {
      console.error('Error creating chat for accepted application:', error)
    }
  }

  // Reject an application - OPTIMIZED VERSION
  static async rejectApplication(applicationId: string): Promise<boolean> {
    try {
      // Get application details with task info in one query
      const { data: application, error: fetchError } = await supabase
        .from('task_applications')
        .select(`
          tasker_id,
          task_id,
          tasks!inner(
            id,
            title,
            customer_id
          )
        `)
        .eq('id', applicationId)
        .single()

      if (fetchError) throw fetchError

      const taskData = application.tasks as any

      // Update application status
      const { error: updateError } = await supabase
        .from('task_applications')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)

      if (updateError) throw updateError

      // Send notifications in background (non-blocking)
      this.sendRejectionNotifications(
        application.task_id,
        application.tasker_id,
        taskData.title,
        taskData.customer_id
      ).catch(error => {
        console.error('Error sending rejection notifications:', error)
        // Don't fail the main operation if notifications fail
      })

      return true
    } catch (error) {
      console.error('Error rejecting application:', error)
      return false
    }
  }

  // Withdraw an application
  static async withdrawApplication(applicationId: string): Promise<boolean> {
    return await this.updateApplicationStatus(applicationId, 'withdrawn')
  }

  // Get application by ID
  static async getApplicationById(applicationId: string): Promise<TaskApplication | null> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select('*')
        .eq('id', applicationId)
        .single()

      if (error) throw error

      // Get tasker and task details
      const [taskerResult, taskResult] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url').eq('id', data.tasker_id).maybeSingle(),
        supabase.from('tasks').select('title, customer_id').eq('id', data.task_id).maybeSingle()
      ])

      // Get customer name
      let customerName = ''
      if (taskResult.data?.customer_id) {
        const customerResult = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', taskResult.data.customer_id)
          .single()
        customerName = customerResult.data?.full_name || ''
      }

      return {
        ...data,
        tasker_name: taskerResult.data?.full_name,
        tasker_avatar: taskerResult.data?.avatar_url,
        task_title: taskResult.data?.title,
        customer_name: customerName
      }
    } catch (error) {
      console.error('Error getting application by ID:', error)
      return null
    }
  }

  // Check if user has applied for a task
  static async hasUserApplied(taskId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('task_applications')
        .select('id')
        .eq('task_id', taskId)
        .eq('tasker_id', userId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error
      }

      return !!data
    } catch (error) {
      console.error('Error checking if user has applied:', error)
      return false
    }
  }

  // Get application statistics for a user
  static async getUserApplicationStats(userId: string): Promise<{
    total: number
    pending: number
    accepted: number
    rejected: number
    withdrawn: number
  }> {
    try {
      const applications = await this.getUserApplications(userId)
      
      return {
        total: applications.length,
        pending: applications.filter(app => app.status === 'pending').length,
        accepted: applications.filter(app => app.status === 'accepted').length,
        rejected: applications.filter(app => app.status === 'rejected').length,
        withdrawn: applications.filter(app => app.status === 'withdrawn').length,
      }
    } catch (error) {
      console.error('Error getting application stats:', error)
      return {
        total: 0,
        pending: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0,
      }
    }
  }

  // Notification helper methods
  private static async notifyTaskAccepted(taskId: string, taskerId: string): Promise<void> {
    try {
      // Get task and customer details
      const { data: task } = await supabase
        .from('tasks')
        .select('title, customer_id')
        .eq('id', taskId)
        .single()

      if (!task) return

      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', task.customer_id)
        .single()

      await SimpleNotificationService.notifyTaskAccepted(
        customer?.full_name || 'Customer',
        task.title,
        taskId
      )
    } catch (error) {
      console.error('Error sending task accepted notification:', error)
    }
  }

  private static async notifyTaskRejected(applicationId: string): Promise<void> {
    try {
      // Get application details
      const { data: application } = await supabase
        .from('task_applications')
        .select('task_id, tasker_id')
        .eq('id', applicationId)
        .single()

      if (!application) return

      // Get task and customer details
      const { data: task } = await supabase
        .from('tasks')
        .select('title, customer_id')
        .eq('id', application.task_id)
        .single()

      if (!task) return

      const { data: customer } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', task.customer_id)
        .single()

      await SimpleNotificationService.notifyTaskRejected(
        customer?.full_name || 'Customer',
        task.title,
        application.task_id
      )
    } catch (error) {
      console.error('Error sending task rejected notification:', error)
    }
  }
}
