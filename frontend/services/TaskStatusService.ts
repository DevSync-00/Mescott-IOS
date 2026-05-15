import { supabase } from '../lib/supabase'
import { SimpleNotificationService } from './SimpleNotificationService'
import { PushNotificationService } from './PushNotificationService'

export type TaskStatus = 
  | 'open'           // Task is open for applications
  | 'assigned'       // Task has been assigned to a tasker
  | 'in_progress'    // Task is currently being worked on
  | 'completed'      // Task has been completed
  | 'cancelled'      // Task has been cancelled
  | 'disputed'       // Task is in dispute
  | 'closed'         // Task is closed (final state)

export interface TaskStatusUpdate {
  id: string
  task_id: string
  status: TaskStatus
  updated_by: string
  reason?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface TaskWorkflowStep {
  status: TaskStatus
  title: string
  description: string
  icon: string
  color: string
  canTransition: boolean
  nextStatuses: TaskStatus[]
}

export class TaskStatusService {
  // Define the task workflow steps
  static readonly WORKFLOW_STEPS: TaskWorkflowStep[] = [
    {
      status: 'open',
      title: 'Open for Applications',
      description: 'Task is available for taskers to apply',
      icon: 'briefcase-outline',
      color: '#10B981',
      canTransition: true,
      nextStatuses: ['assigned', 'cancelled']
    },
    {
      status: 'assigned',
      title: 'Assigned',
      description: 'Task has been assigned to a tasker',
      icon: 'person-add',
      color: '#3B82F6',
      canTransition: true,
      nextStatuses: ['in_progress', 'cancelled']
    },
    {
      status: 'in_progress',
      title: 'In Progress',
      description: 'Tasker is currently working on the task',
      icon: 'construct',
      color: '#F59E0B',
      canTransition: true,
      nextStatuses: ['completed', 'disputed']
    },
    {
      status: 'completed',
      title: 'Completed',
      description: 'Task has been completed successfully',
      icon: 'checkmark-circle',
      color: '#10B981',
      canTransition: false,
      nextStatuses: ['closed']
    },
    {
      status: 'cancelled',
      title: 'Cancelled',
      description: 'Task has been cancelled',
      icon: 'close-circle',
      color: '#EF4444',
      canTransition: false,
      nextStatuses: []
    },
    {
      status: 'disputed',
      title: 'In Dispute',
      description: 'Task is under dispute resolution',
      icon: 'warning',
      color: '#F59E0B',
      canTransition: true,
      nextStatuses: ['completed', 'cancelled']
    },
    {
      status: 'closed',
      title: 'Closed',
      description: 'Task is closed and finalized',
      icon: 'lock-closed',
      color: '#6B7280',
      canTransition: false,
      nextStatuses: []
    }
  ]

  // Get workflow step by status
  static getWorkflowStep(status: TaskStatus): TaskWorkflowStep | undefined {
    return this.WORKFLOW_STEPS.find(step => step.status === status)
  }

  // Get all possible next statuses for a given status
  static getNextStatuses(currentStatus: TaskStatus): TaskStatus[] {
    const step = this.getWorkflowStep(currentStatus)
    return step?.nextStatuses || []
  }

  // Check if a status transition is valid
  static canTransitionTo(fromStatus: TaskStatus, toStatus: TaskStatus): boolean {
    const nextStatuses = this.getNextStatuses(fromStatus)
    return nextStatuses.includes(toStatus)
  }

  // Update task status
  static async updateTaskStatus(
    taskId: string,
    newStatus: TaskStatus,
    updatedBy: string,
    reason?: string,
    notes?: string
  ): Promise<boolean> {
    try {
      // Get current task status
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .select('status, customer_id, tasker_id, title')
        .eq('id', taskId)
        .single()

      if (taskError || !task) {
        throw new Error('Task not found')
      }

      // Check if transition is valid
      if (!this.canTransitionTo(task.status as TaskStatus, newStatus)) {
        throw new Error(`Invalid status transition from ${task.status} to ${newStatus}`)
      }

      // Update task status
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId)

      if (updateError) {
        throw updateError
      }

      // Create status update record (table doesn't exist yet)
      // const { error: statusError } = await supabase
      //   .from('task_status_updates')
      //   .insert({
      //     task_id: taskId,
      //     status: newStatus,
      //     updated_by: updatedBy,
      //     reason,
      //     notes
      //   })

      // if (statusError) {
      //   console.error('Error creating status update record:', statusError)
      //   // Don't throw here as the main update succeeded
      // }

      // Send notifications based on status change
      await this.sendStatusNotifications(task, newStatus, updatedBy)

      return true
    } catch (error) {
      console.error('Error updating task status:', error)
      return false
    }
  }

  // Send notifications based on status change (NON-BLOCKING & PARALLEL)
  private static async sendStatusNotifications(
    task: any,
    newStatus: TaskStatus,
    updatedBy: string
  ): Promise<void> {
    // Run notifications in background without blocking
    const notificationPromise = (async () => {
      try {
        const statusMessages = {
          'assigned': 'Your task has been assigned to a tasker',
          'in_progress': 'Your task is now in progress',
          'completed': 'Your task has been completed',
          'cancelled': 'Your task has been cancelled',
          'disputed': 'Your task is under dispute'
        }

        const message = statusMessages[newStatus]
        if (!message) return

        const notifications: Promise<any>[] = []

        // Collect all notification promises to run in parallel
        if (task.customer_id !== updatedBy) {
          notifications.push(
            SimpleNotificationService.createTaskNotification(task.title, newStatus, message),
            PushNotificationService.createTaskNotification(task.title, task.id, 'System', message)
          )
        }

        if (task.tasker_id && task.tasker_id !== updatedBy) {
          notifications.push(
            SimpleNotificationService.createTaskNotification(task.title, newStatus, message),
            PushNotificationService.createTaskNotification(task.title, task.id, 'System', message)
          )
        }

        // Run all notifications in parallel and don't wait for them
        if (notifications.length > 0) {
          await Promise.allSettled(notifications)
          console.log('✅ Status notifications sent in parallel')
        }
      } catch (error) {
        console.error('Error sending status notifications:', error)
      }
    })()

    // Don't await - let it run in background
    notificationPromise.catch(err => console.error('Background notification error:', err))
  }

  // Get task status history (table doesn't exist yet)
  static async getTaskStatusHistory(taskId: string): Promise<TaskStatusUpdate[]> {
    try {
      // Return empty array since table doesn't exist
      console.log('Task status history table not implemented yet')
      return []
      
      // const { data, error } = await supabase
      //   .from('task_status_updates')
      //   .select(`
      //     *,
      //     profiles!task_status_updates_updated_by_fkey(full_name, avatar_url)
      //   `)
      //   .eq('task_id', taskId)
      //   .order('created_at', { ascending: false })

      // if (error) {
      //   throw error
      // }

      // return data?.map(update => ({
      //   ...update,
      //   updated_by_name: update.profiles?.full_name,
      //   updated_by_avatar: update.profiles?.avatar_url
      // })) || []
    } catch (error) {
      console.error('Error getting task status history:', error)
      return []
    }
  }

  // Get tasks by status for a user
  static async getTasksByStatus(
    userId: string,
    status: TaskStatus,
    userRole: 'customer' | 'tasker'
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('tasks')
        .select(`
          *,
          profiles!tasks_customer_id_fkey(full_name, avatar_url),
          tasker:profiles!tasks_tasker_id_fkey(full_name, avatar_url),
          category:categories(name)
        `)
        .eq('status', status)

      if (userRole === 'customer') {
        query = query.eq('customer_id', userId)
      } else {
        query = query.eq('tasker_id', userId)
      }

      const { data, error } = await query.order('updated_at', { ascending: false })

      if (error) {
        throw error
      }

      return data?.map(task => ({
        ...task,
        customer_name: task.profiles?.full_name,
        customer_avatar: task.profiles?.avatar_url,
        tasker_name: task.tasker?.full_name,
        tasker_avatar: task.tasker?.avatar_url,
        category_name: task.category?.name
      })) || []
    } catch (error) {
      console.error('Error getting tasks by status:', error)
      return []
    }
  }

  // Get task workflow progress
  static getTaskWorkflowProgress(currentStatus: TaskStatus): {
    currentStep: number
    totalSteps: number
    progress: number
    steps: TaskWorkflowStep[]
  } {
    const currentStepIndex = this.WORKFLOW_STEPS.findIndex(step => step.status === currentStatus)
    const totalSteps = this.WORKFLOW_STEPS.length
    const progress = currentStepIndex >= 0 ? (currentStepIndex + 1) / totalSteps : 0

    return {
      currentStep: currentStepIndex + 1,
      totalSteps,
      progress,
      steps: this.WORKFLOW_STEPS
    }
  }

  // Check if user can update task status
  static canUserUpdateStatus(
    task: any,
    userId: string,
    newStatus: TaskStatus
  ): boolean {
    // Customer can cancel or dispute
    if (task.customer_id === userId) {
      return ['cancelled', 'disputed'].includes(newStatus)
    }

    // Tasker can mark as in progress or completed
    if (task.tasker_id === userId) {
      return ['in_progress', 'completed'].includes(newStatus)
    }

    // Admin can do anything (would need admin check)
    return false
  }

  // Get status statistics for dashboard
  static async getStatusStatistics(userId: string, userRole: 'customer' | 'tasker'): Promise<{
    [key in TaskStatus]: number
  }> {
    try {
      const statuses: TaskStatus[] = ['open', 'assigned', 'in_progress', 'completed', 'cancelled', 'disputed', 'closed']
      const stats: { [key in TaskStatus]: number } = {} as any

      for (const status of statuses) {
        const tasks = await this.getTasksByStatus(userId, status, userRole)
        stats[status] = tasks.length
      }

      return stats
    } catch (error) {
      console.error('Error getting status statistics:', error)
      return {} as any
    }
  }
}
