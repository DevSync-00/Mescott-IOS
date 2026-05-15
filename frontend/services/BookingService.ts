import { supabase } from '../lib/supabase'
import { UnifiedNotificationService } from './UnifiedNotificationService'

export interface Booking {
  id: string
  customer_id: string
  technician_id: string
  service_name: string
  service_description?: string
  base_price: number
  agreed_price: number
  price_type: 'hourly' | 'fixed' | 'negotiable'
  booking_date: string
  start_time: string
  end_time?: string
  estimated_duration_hours?: number
  city?: string
  state?: string
  address?: string
  zip_code?: string
  latitude?: number
  longitude?: number
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  total_amount?: number
  payment_status: 'pending' | 'paid' | 'refunded'
  customer_notes?: string
  technician_notes?: string
  special_instructions?: string
  created_at: string
  updated_at: string
  // Additional fields for display
  customer_name?: string
  technician_name?: string
  task_title?: string
  // Task-specific fields
  task_id?: string
  task_user_id?: string // For customer lookup
  task_status?: 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  task_category?: string
  is_task_based?: boolean
  chat_id?: string
}

export class BookingService {
  // Get all bookings for a user (as customer or technician)
  static async getUserBookings(userId: string): Promise<Booking[]> {
    try {
      // Get user's profile to determine if they're a customer or tasker
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('user_id', userId)
        .maybeSingle()

      if (profileError) {
        throw profileError
      }

      if (!profile) {
        return []
      }

      const profileId = profile.id

      // Get task applications as bookings
      // Show tasks where user is assigned to work on as a tasker
      // Include all statuses to show completed tasks
      const { data: taskerApplications, error: taskerError } = await supabase
        .from('task_applications')
        .select(`
          id,
          task_id,
          tasker_id,
          proposed_price,
          status,
          created_at,
          updated_at,
           tasks!inner(
             id,
             title,
             description,
             budget,
             task_date,
             task_time,
             address,
             city,
             state,
             zip_code,
             customer_id,
             user_id,
             estimated_hours,
             estimated_duration_hours,
             latitude,
             longitude,
             payment_status,
             special_instructions,
             status,
             category
           )
        `)
        // Remove status filter to get all applications for this tasker
        .eq('tasker_id', profileId)
        .neq('tasks.customer_id', profileId) // Exclude tasks created by the user
        .order('created_at', { ascending: false })

      if (taskerError) throw taskerError

      // Only use tasker applications (tasks assigned to the user)
      const taskApplications = taskerApplications || []
      
      // Filter applications to only show accepted and completed ones
      const filteredApplications = taskApplications.filter(app => {
        const isNotCustomer = (app.tasks as any)?.customer_id !== profileId
        const isAcceptedOrCompleted = ['accepted', 'completed'].includes(app.status)
        return isNotCustomer && isAcceptedOrCompleted
      })

      // Convert task applications to booking format
      const taskBookings: Booking[] = (filteredApplications || []).map(app => {
        const task = app.tasks as any // tasks is an object, not an array
        
        // Map task status to booking status
        // Pending = tasks that haven't been completed (open, assigned, in_progress, etc.)
        let bookingStatus: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
        if (task?.status === 'completed') {
          bookingStatus = 'completed'
        } else if (task?.status === 'cancelled') {
          bookingStatus = 'cancelled'
        } else {
          // All other statuses (open, assigned, in_progress, etc.) are pending
          bookingStatus = 'pending'
        }
        
        return {
          id: `task_${app.id}`,
          customer_id: task?.customer_id,
          technician_id: app.tasker_id,
          service_name: task?.title,
          service_description: task?.description,
          base_price: task?.budget,
          agreed_price: app.proposed_price || task?.budget,
          price_type: 'fixed' as const,
          booking_date: task?.task_date || new Date().toISOString().split('T')[0],
          start_time: task?.task_time || '09:00',
          end_time: undefined,
          estimated_duration_hours: task?.estimated_hours || task?.estimated_duration_hours,
          city: task?.city,
          state: task?.state,
          address: task?.address,
          zip_code: task?.zip_code,
          latitude: task?.latitude,
          longitude: task?.longitude,
          status: bookingStatus,
          total_amount: app.proposed_price || task?.budget,
          payment_status: task?.payment_status as 'pending' | 'paid' | 'refunded' || 'pending',
          customer_notes: task?.special_instructions,
          technician_notes: undefined,
          special_instructions: task?.special_instructions,
          created_at: app.created_at,
          updated_at: app.updated_at,
          technician_name: undefined,
          task_title: task?.title,
          // Task-specific fields
          task_id: task?.id,
          task_user_id: task?.user_id, // Add this for customer lookup
          task_status: task?.status as 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled' || 'assigned',
          task_category: task?.category || 'Task',
          is_task_based: true,
          chat_id: undefined // Will be populated later
        }
      })

      // Get all unique user IDs for name lookup
      const allCustomerIds = [...new Set(taskBookings.map(b => b.customer_id).filter(Boolean))]
      const allTechnicianIds = [...new Set(taskBookings.map(b => b.technician_id).filter(Boolean))]
      const allCustomerUserIds = [...new Set(taskBookings.map(b => b.task_user_id).filter(Boolean))]

      // Get names for all users - try both customer_id and user_id lookups
      const [customerResults, technicianResults, customerByUserIdResults] = await Promise.all([
        allCustomerIds.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', allCustomerIds) : { data: [], error: null },
        allTechnicianIds.length > 0 ? supabase.from('profiles').select('id, full_name').in('id', allTechnicianIds) : { data: [], error: null },
        // Also try to find customers by user_id from tasks
        allCustomerUserIds.length > 0 ? supabase.from('profiles').select('id, user_id, full_name').in('user_id', allCustomerUserIds) : { data: [], error: null }
      ])

      const customerMap = new Map(customerResults.data?.map(p => [p.id, p.full_name]) || [])
      const technicianMap = new Map(technicianResults.data?.map(p => [p.id, p.full_name]) || [])
      
      // Add customers found by user_id
      customerByUserIdResults.data?.forEach(profile => {
        customerMap.set(profile.id, profile.full_name)
      })

      // Format all bookings with names
      const allBookings = taskBookings.map(booking => {
        // Try to find customer name by customer_id first, then by user_id
        let customerName = customerMap.get(booking.customer_id)
        if (!customerName && booking.task_user_id) {
          // Try to find by user_id
          const customerByUserId = customerByUserIdResults.data?.find(p => p.user_id === booking.task_user_id)
          customerName = customerByUserId?.full_name
        }
        
        return {
          ...booking,
          customer_name: customerName || 'Unknown Customer',
          technician_name: technicianMap.get(booking.technician_id) || 'Unknown Technician'
        }
      })

      // Sort by creation date
      return allBookings.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    } catch (error) {
      console.error('Error getting user bookings:', error)
      return []
    }
  }

  // Get bookings by status
  static async getBookingsByStatus(userId: string, status: Booking['status']): Promise<Booking[]> {
    try {
      const bookings = await this.getUserBookings(userId)
      return bookings.filter(booking => booking.status === status)
    } catch (error) {
      console.error('Error getting bookings by status:', error)
      return []
    }
  }

  // Create a new booking
  static async createBooking(bookingData: Omit<Booking, 'id' | 'created_at' | 'updated_at' | 'customer_name' | 'technician_name' | 'task_title'>): Promise<Booking | null> {
    try {
      const { data, error } = await supabase
        .from('direct_bookings')
        .insert([bookingData])
        .select('*')
        .single()

      if (error) throw error

      // Get customer and technician names
      const [customerResult, technicianResult] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', data.customer_id).single(),
        supabase.from('profiles').select('full_name').eq('id', data.technician_id).single()
      ])

      const customerName = customerResult.data?.full_name || 'Unknown'
      const technicianName = technicianResult.data?.full_name || 'Unknown'

      // Send notifications
      try {
        await UnifiedNotificationService.notifyBookingCreated(
          data.id,
          data.service_name,
          data.customer_id,
          data.technician_id,
          customerName,
          technicianName
        )
      } catch (notificationError) {
        console.error('Error sending booking notifications:', notificationError)
        // Don't throw here - booking should succeed even if notifications fail
      }

      return {
        ...data,
        customer_name: customerName,
        technician_name: technicianName,
        task_title: data.service_name
      }
    } catch (error) {
      console.error('Error creating booking:', error)
      throw error
    }
  }

  // Update booking status
  static async updateBookingStatus(bookingId: string, status: Booking['status']): Promise<boolean> {
    try {
      // Check if this is a task-based booking
      if (bookingId.startsWith('task_')) {
        const taskApplicationId = bookingId.replace('task_', '')
        
        // Map booking status to task application status
        let taskStatus: string
        switch (status) {
          case 'confirmed':
            taskStatus = 'accepted'
            break
          case 'cancelled':
            taskStatus = 'rejected'
            break
          case 'completed':
            taskStatus = 'completed'
            break
          default:
            taskStatus = 'accepted'
        }

        const { error } = await supabase
          .from('task_applications')
          .update({
            status: taskStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskApplicationId)

        if (error) throw error

        // Send notifications for task application status change
        try {
          const { data: applicationData } = await supabase
            .from('task_applications')
            .select('task_id, tasker_id, user_id')
            .eq('id', taskApplicationId)
            .single()

          if (applicationData) {
            const { data: taskData } = await supabase
              .from('tasks')
              .select('title, customer_id')
              .eq('id', applicationData.task_id)
              .single()

            if (taskData) {
              // Get names for notifications
              const [customerResult, taskerResult] = await Promise.all([
                supabase.from('profiles').select('full_name').eq('id', taskData.customer_id).single(),
                supabase.from('profiles').select('full_name').eq('id', applicationData.tasker_id).single()
              ])

              const customerName = customerResult.data?.full_name || 'Unknown'
              const taskerName = taskerResult.data?.full_name || 'Unknown'

              if (status === 'confirmed') {
                await UnifiedNotificationService.notifyApplicationAccepted(
                  applicationData.task_id,
                  taskData.title,
                  applicationData.tasker_id,
                  customerName
                )
              } else if (status === 'cancelled') {
                await UnifiedNotificationService.notifyApplicationRejected(
                  applicationData.task_id,
                  taskData.title,
                  applicationData.tasker_id,
                  customerName
                )
              }
            }
          }
        } catch (notificationError) {
          console.error('Error sending application status notification:', notificationError)
        }

        return true
      } else {
        // Handle direct bookings
        const updateData: any = {
          status,
          updated_at: new Date().toISOString()
        }

        const { error } = await supabase
          .from('direct_bookings')
          .update(updateData)
          .eq('id', bookingId)

        if (error) throw error

        // Send notifications for direct booking status change
        try {
          const { data: bookingData } = await supabase
            .from('direct_bookings')
            .select('service_name, customer_id, technician_id')
            .eq('id', bookingId)
            .single()

          if (bookingData) {
            // Get names for notifications
            const [customerResult, technicianResult] = await Promise.all([
              supabase.from('profiles').select('full_name').eq('id', bookingData.customer_id).single(),
              supabase.from('profiles').select('full_name').eq('id', bookingData.technician_id).single()
            ])

            const customerName = customerResult.data?.full_name || 'Unknown'
            const technicianName = technicianResult.data?.full_name || 'Unknown'

            await UnifiedNotificationService.notifyBookingStatusChange(
              bookingId,
              bookingData.service_name,
              bookingData.customer_id,
              bookingData.technician_id,
              status,
              customerName,
              technicianName
            )
          }
        } catch (notificationError) {
          console.error('Error sending direct booking status notification:', notificationError)
        }

        return true
      }
    } catch (error) {
      console.error('Error updating booking status:', error)
      return false
    }
  }

  // Update booking details
  static async updateBooking(bookingId: string, updates: Partial<Booking>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('direct_bookings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error updating booking:', error)
      return false
    }
  }

  // Cancel booking
  static async cancelBooking(bookingId: string, reason?: string): Promise<boolean> {
    try {
      const success = await this.updateBookingStatus(bookingId, 'cancelled')
      if (success && reason) {
        await this.updateBooking(bookingId, { special_instructions: reason })
      }
      return success
    } catch (error) {
      console.error('Error cancelling booking:', error)
      return false
    }
  }

  // Complete booking
  static async completeBooking(bookingId: string, notes?: string): Promise<boolean> {
    try {
      const success = await this.updateBookingStatus(bookingId, 'completed')
      if (success && notes) {
        await this.updateBooking(bookingId, { technician_notes: notes })
      }
      return success
    } catch (error) {
      console.error('Error completing booking:', error)
      return false
    }
  }

  // Get booking by ID
  static async getBookingById(bookingId: string): Promise<Booking | null> {
    try {
      // Check if this is a task-based booking
      if (bookingId.startsWith('task_')) {
        const taskApplicationId = bookingId.replace('task_', '')
        
        const { data, error } = await supabase
          .from('task_applications')
          .select(`
            id,
            task_id,
            tasker_id,
            proposed_price,
            status,
            created_at,
            updated_at,
            tasks!inner(
              id,
              title,
              description,
              budget,
              task_date,
              task_time,
              address,
              city,
              state,
              zip_code,
              customer_id
            )
          `)
          .eq('id', taskApplicationId)
          .single()

        if (error) throw error

        const task = data.tasks[0] // Get the first (and only) task
        
        // Fetch customer and technician names
        const [customerProfile, technicianProfile] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name')
            .eq('id', task?.customer_id)
            .single(),
          supabase
            .from('profiles')
            .select('full_name')
            .eq('id', data.tasker_id)
            .single()
        ])

        // Convert to booking format
        const booking: Booking = {
          id: `task_${data.id}`,
          customer_id: task?.customer_id,
          technician_id: data.tasker_id,
          service_name: task?.title,
          service_description: task?.description,
          base_price: task?.budget,
          agreed_price: data.proposed_price || task?.budget,
          price_type: 'fixed' as const,
          booking_date: task?.task_date || new Date().toISOString().split('T')[0],
          start_time: task?.task_time || '09:00',
          end_time: undefined,
          estimated_duration_hours: undefined,
          city: task?.city,
          state: task?.state,
          address: task?.address,
          zip_code: task?.zip_code,
          latitude: undefined,
          longitude: undefined,
          status: 'confirmed' as const,
          total_amount: data.proposed_price || task?.budget,
          payment_status: 'pending' as const,
          customer_notes: undefined,
          technician_notes: undefined,
          special_instructions: undefined,
          created_at: data.created_at,
          updated_at: data.updated_at,
          customer_name: customerProfile.data?.full_name || 'Customer',
          technician_name: technicianProfile.data?.full_name || 'Tasker',
          task_title: task?.title
        }

        return booking
      } else {
        // Handle direct bookings
        const { data, error } = await supabase
          .from('direct_bookings')
          .select('*')
          .eq('id', bookingId)
          .single()

        if (error) throw error

        // Get customer and technician names
        const [customerResult, technicianResult] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', data.customer_id).single(),
          supabase.from('profiles').select('full_name').eq('id', data.technician_id).single()
        ])

        return {
          ...data,
          customer_name: customerResult.data?.full_name,
          technician_name: technicianResult.data?.full_name,
          task_title: data.service_name
        }
      }
    } catch (error) {
      console.error('Error getting booking by ID:', error)
      return null
    }
  }

  // Search bookings
  static async searchBookings(userId: string, query: string): Promise<Booking[]> {
    try {
      // Get all bookings first
      const allBookings = await this.getUserBookings(userId)
      
      // Filter by search query
      const filteredBookings = allBookings.filter(booking => 
        booking.service_name.toLowerCase().includes(query.toLowerCase()) ||
        booking.service_description?.toLowerCase().includes(query.toLowerCase()) ||
        booking.address?.toLowerCase().includes(query.toLowerCase()) ||
        booking.customer_name?.toLowerCase().includes(query.toLowerCase()) ||
        booking.technician_name?.toLowerCase().includes(query.toLowerCase())
      )

      return filteredBookings
    } catch (error) {
      console.error('Error searching bookings:', error)
      return []
    }
  }

  // Get upcoming bookings
  static async getUpcomingBookings(userId: string): Promise<Booking[]> {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      // Get all bookings first
      const allBookings = await this.getUserBookings(userId)
      
      // Filter for upcoming bookings
      const upcomingBookings = allBookings.filter(booking => {
        const bookingDate = booking.booking_date
        return bookingDate >= today && 
               (booking.status === 'confirmed' || booking.status === 'in_progress')
      })

      // Sort by date and time
      return upcomingBookings.sort((a, b) => {
        const dateCompare = a.booking_date.localeCompare(b.booking_date)
        if (dateCompare !== 0) return dateCompare
        return a.start_time.localeCompare(b.start_time)
      })
    } catch (error) {
      console.error('Error getting upcoming bookings:', error)
      return []
    }
  }

  // Get booking statistics
  static async getBookingStats(userId: string): Promise<{
    total: number
    pending: number
    confirmed: number
    in_progress: number
    completed: number
    cancelled: number
  }> {
    try {
      const bookings = await this.getUserBookings(userId)
      
      return {
        total: bookings.length,
        pending: bookings.filter(b => b.status === 'pending').length,
        confirmed: bookings.filter(b => b.status === 'confirmed').length,
        in_progress: bookings.filter(b => b.status === 'in_progress').length,
        completed: bookings.filter(b => b.status === 'completed').length,
        cancelled: bookings.filter(b => b.status === 'cancelled').length,
      }
    } catch (error) {
      console.error('Error getting booking stats:', error)
      return {
        total: 0,
        pending: 0,
        confirmed: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
      }
    }
  }

  // Get or create chat for a booking
  static async getOrCreateChatForBooking(bookingId: string, customerId: string, technicianId: string): Promise<string | null> {
    try {
      // For task-based bookings, extract task_id from bookingId
      let taskId: string | null = null
      
      if (bookingId.startsWith('task_')) {
        const taskApplicationId = bookingId.replace('task_', '')
        
        // Get task_id from task_applications
        const { data: application, error: appError } = await supabase
          .from('task_applications')
          .select('task_id')
          .eq('id', taskApplicationId)
          .single()

        if (appError || !application) {
          return null
        }
        
        taskId = application.task_id
      } else {
        return null
      }

      if (!taskId) {
        return null
      }

      // Import ChatService dynamically to avoid circular imports
      const { ChatService } = await import('./ChatService')
      
      // Create chat between customer and technician
      const chat = await ChatService.getOrCreateChat(taskId, customerId, technicianId)
      
      if (chat) {
        return chat.id
      } else {
        return null
      }
    } catch (error) {
      console.error('Error getting/creating chat for booking:', error)
      return null
    }
  }

  // Update booking status and sync with task status
  static async updateBookingAndTaskStatus(bookingId: string, status: Booking['status'], updatedByUserId?: string): Promise<boolean> {
    try {
      // Check if this is a task-based booking
      if (bookingId.startsWith('task_')) {
        const taskApplicationId = bookingId.replace('task_', '')
        
        // Get the task application to find the task_id and current status
        const { data: application, error: appError } = await supabase
          .from('task_applications')
          .select(`
            task_id,
            status,
            tasks!inner(
              id,
              status,
              customer_id,
              tasker_id,
              title
            )
          `)
          .eq('id', taskApplicationId)
          .single()

        if (appError) {
          throw appError
        }

        // Map booking status to task application and task status
        let taskAppStatus: string
        let taskStatus: string

        switch (status) {
          case 'pending':
            taskAppStatus = 'pending'
            taskStatus = 'open'
            break
          case 'confirmed':
            taskAppStatus = 'accepted'
            taskStatus = 'assigned'
            break
          case 'in_progress':
            taskAppStatus = 'accepted'
            taskStatus = 'in_progress'
            break
          case 'completed':
            taskAppStatus = 'completed'
            taskStatus = 'completed'
            break
          case 'cancelled':
            taskAppStatus = 'rejected'
            taskStatus = 'cancelled'
            break
          default:
            taskAppStatus = 'accepted'
            taskStatus = 'assigned'
        }

        // Update task application status
        const { error: appUpdateError } = await supabase
          .from('task_applications')
          .update({
            status: taskAppStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskApplicationId)

        if (appUpdateError) {
          throw appUpdateError
        }

        // Update task status with proper validation
        const { error: taskUpdateError } = await supabase
          .from('tasks')
          .update({
            status: taskStatus,
            updated_at: new Date().toISOString(),
            // Set completion/cancellation timestamps
            ...(status === 'completed' && { completed_at: new Date().toISOString() }),
            ...(status === 'cancelled' && { cancelled_at: new Date().toISOString() })
          })
          .eq('id', application.task_id)

        if (taskUpdateError) {
          throw taskUpdateError
        }

        // If task is completed, create payment requirement for customer and delete chat
        if (status === 'completed') {
          try {
            const { PaymentService } = await import('./PaymentService')
            const { ChatService } = await import('./ChatService')
            
            // Get task details for payment
            const { data: taskDetails } = await supabase
              .from('tasks')
              .select('title, final_price, budget, customer_id, tasker_id')
              .eq('id', application.task_id)
              .single()

            if (taskDetails) {
              const paymentAmount = taskDetails.final_price || taskDetails.budget
              
              // Run payment creation and notifications in parallel (non-blocking)
              const operationsPromise = Promise.allSettled([
                // Create payment requirement
                PaymentService.createTaskPayment(
                  application.task_id,
                  taskDetails.customer_id,
                  paymentAmount,
                  `Payment for completed task: ${taskDetails.title}`
                ),
                // Notify tasker that payment is ready (if exists)
                taskDetails.tasker_id ? UnifiedNotificationService.notifyTaskerPaymentReady(
                  application.task_id,
                  taskDetails.title,
                  taskDetails.tasker_id,
                  paymentAmount
                ) : Promise.resolve()
              ])
              
              // Don't await - let it run in background
              operationsPromise.catch(err => console.error('Background payment/notification error:', err))
            }

            // Delete chat and all messages for this task when completed
            try {
              console.log('🗑️ Deleting chat for completed booking task:', application.task_id)
              
              // Find chat for this task
              const { data: chat, error: findError } = await supabase
                .from('chats')
                .select('id')
                .eq('task_id', application.task_id)
                .maybeSingle()

              if (!findError && chat) {
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

                if (messagesResult.status === 'fulfilled' && chatResult.status === 'fulfilled') {
                  console.log('✅ Chat and messages deleted successfully for completed booking task:', application.task_id)
                } else {
                  console.error('Error deleting chat for completed booking task:', { messagesResult, chatResult })
                }
              } else {
                console.log('ℹ️ No chat found for completed booking task:', application.task_id)
              }
            } catch (chatError) {
              console.error('Error deleting chat for completed booking task:', chatError)
              // Don't fail the main operation
            }
          } catch (paymentError) {
            console.error('Error creating payment requirement:', paymentError)
            // Don't fail the main operation
          }
        }

        // Send notifications
        await this.sendBookingStatusNotifications(application.tasks, status, application.task_id)

        return true
      } else {
        // Handle direct bookings
        const updateData: any = {
          status,
          updated_at: new Date().toISOString()
        }

        const { error } = await supabase
          .from('direct_bookings')
          .update(updateData)
          .eq('id', bookingId)

        if (error) throw error
        return true
      }
    } catch (error) {
      console.error('Error updating booking and task status:', error)
      return false
    }
  }

  // Send notifications when booking status changes
  private static async sendBookingStatusNotifications(
    task: any,
    bookingStatus: Booking['status'],
    taskId: string
  ): Promise<void> {
    try {
      const { PushNotificationService } = await import('./PushNotificationService')
      const { SimpleNotificationService } = await import('./SimpleNotificationService')

      const statusMessages = {
        'pending': 'Your booking is pending approval',
        'confirmed': 'Your booking has been confirmed',
        'in_progress': 'Your booking is now in progress',
        'completed': 'Your booking has been completed',
        'cancelled': 'Your booking has been cancelled'
      }

      const message = statusMessages[bookingStatus]
      if (message) {
        // TODO: Fix notification service calls with correct parameters
        // Notify customer
        // await SimpleNotificationService.createTaskNotification(
        //   task.title,
        //   bookingStatus === 'completed' ? 'completed' : 'updated',
        //   message
        // )
        
        // await PushNotificationService.createTaskNotification(
        //   task.title,
        //   taskId,
        //   'System',
        //   message
        // )

        // Notify tasker if assigned
        if (task.tasker_id) {
          // await SimpleNotificationService.createTaskNotification(
          //   task.title,
          //   bookingStatus === 'completed' ? 'completed' : 'updated',
          //   message
          // )
          
          // await PushNotificationService.createTaskNotification(
          //   task.title,
          //   taskId,
          //   'System',
          //   message
          // )
        }
      }
    } catch (error) {
      console.error('Error sending booking status notifications:', error)
    }
  }
}