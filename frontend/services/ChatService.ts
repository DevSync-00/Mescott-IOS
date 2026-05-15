import { supabase } from '../lib/supabase'
import { UnifiedNotificationService } from './UnifiedNotificationService'

export interface Chat {
  id: string
  task_id: string
  customer_id: string
  tasker_id: string
  last_message_at: string | null
  last_message_text: string | null
  last_message_sender_id: string | null
  created_at: string
  updated_at: string
  // Populated fields
  task?: {
    id: string
    title: string
    status: string
  }
  customer?: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string
  }
  tasker?: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string
  }
  last_message?: Message
  unread_count?: number
}

export interface Message {
  id: string
  chat_id: string
  sender_id: string
  message: string
  message_type: 'text' | 'image' | 'file' | 'system'
  is_read: boolean
  created_at: string
  updated_at: string
  // Populated fields
  sender?: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string
  }
}

export class ChatService {
  // In-memory caches to avoid redundant network calls.
  // NOTE: This resets on app restart; for persistence, consider MMKV/AsyncStorage.
  private static profileCache: Map<string, { id: string; full_name: string; avatar_url: string | null; phone: string }> = new Map()
  private static messageCache: Map<string, Message[]> = new Map()

  // Get all chats for a user
  static async getUserChats(userId: string): Promise<Chat[]> {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          task:task_id (
            id,
            title,
            status
          ),
          customer:customer_id (
            id,
            full_name,
            avatar_url,
            phone
          ),
          tasker:tasker_id (
            id,
            full_name,
            avatar_url,
            phone
          )
        `)
        .or(`customer_id.eq.${userId},tasker_id.eq.${userId}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (error) {
        throw error
      }

      const chats = data || []

      // Fetch all unread counts in a single, batched query via RPC for performance
      // Falls back to per-chat count if the RPC is not available.
      const unreadMap = await this.getAllUnreadCounts(userId)

      return chats.map(c => ({ ...c, unread_count: unreadMap.get(c.id) || 0 }))
    } catch (error) {
      console.error('Error getting user chats:', error)
      return []
    }
  }

  // Get or create a chat for a task
  static async getOrCreateChat(taskId: string, customerId: string, taskerId: string): Promise<Chat | null> {
    try {
      // First, try to find existing chat
      const { data: existingChat, error: findError } = await supabase
        .from('chats')
        .select(`
          *,
          task:task_id (
            id,
            title,
            status
          ),
          customer:customer_id (
            id,
            full_name,
            avatar_url,
            phone
          ),
          tasker:tasker_id (
            id,
            full_name,
            avatar_url,
            phone
          )
        `)
        .eq('task_id', taskId)
        .eq('customer_id', customerId)
        .eq('tasker_id', taskerId)
        .single()


      if (existingChat && !findError) {
        return existingChat
      }

      // Create new chat if it doesn't exist
      const { data: newChat, error: createError } = await supabase
        .from('chats')
        .insert({
          task_id: taskId,
          customer_id: customerId,
          tasker_id: taskerId
        })
        .select(`
          *,
          task:task_id (
            id,
            title,
            status
          ),
          customer:customer_id (
            id,
            full_name,
            avatar_url,
            phone
          ),
          tasker:tasker_id (
            id,
            full_name,
            avatar_url,
            phone
          )
        `)
        .single()

      if (createError) {
        throw createError
      }
      
      return newChat
    } catch (error) {
      console.error('Error in getOrCreateChat:', error)
      return null
    }
  }

  // Get messages for a chat
  static async getChatMessages(chatId: string, limit: number = 50, offset: number = 0): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('messages_new')
        // Select only message fields; we'll batch-fetch senders to avoid N+1.
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error
      
      const messages = (data || []) as Message[]

      // Attach sender details using profile cache with a single fetch for missing profiles
      const uniqueSenderIds = Array.from(new Set(messages.map(m => m.sender_id)))
      const missingSenderIds = uniqueSenderIds.filter(id => !this.profileCache.has(id))

      if (missingSenderIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .in('id', missingSenderIds)

        for (const p of (profilesData || [])) {
          this.profileCache.set(p.id, p)
        }
      }

      const messagesWithSenders = messages.map((m) => ({
        ...m,
        sender: this.profileCache.get(m.sender_id) || undefined
      }))

      // Update cache (store oldest-first for render ordering)
      const ordered = [...messagesWithSenders].reverse()
      this.messageCache.set(chatId, ordered)
      return ordered
    } catch (error) {
      console.error('Error getting chat messages:', error)
      return []
    }
  }

  // Return cached messages instantly if available; network refresh runs in background.
  static async getChatMessagesFast(chatId: string, limit: number = 50, offset: number = 0): Promise<{ cached: Message[]; fresh: Promise<Message[]> }> {
    const cached = this.messageCache.get(chatId) || []
    const fresh = this.getChatMessages(chatId, limit, offset)
    return { cached, fresh }
  }

  // Send a message
  static async sendMessage(chatId: string, senderId: string, content: string, messageType: 'text' | 'image' | 'file' = 'text'): Promise<Message | null> {
    try {
      // Enforce sender from active auth session to satisfy RLS policies on messages_new.
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user) {
        console.error('Error resolving authenticated user for sendMessage:', authError)
        return null
      }

      const effectiveSenderId = authData.user.id
      if (senderId !== effectiveSenderId) {
        console.warn('sendMessage senderId mismatch; using authenticated user id instead', {
          passedSenderId: senderId,
          effectiveSenderId
        })
      }

      const { data, error } = await supabase
        .from('messages_new')
        .insert({
          chat_id: chatId,
          sender_id: effectiveSenderId,
          message: content,
          message_type: messageType
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      // Attach sender from cache or fetch once and cache
      let senderData = this.profileCache.get(effectiveSenderId)
      if (!senderData) {
        const { data: fetched } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, phone')
          .eq('id', effectiveSenderId)
          .single()
        if (fetched) {
          this.profileCache.set(fetched.id, fetched)
          senderData = fetched
        }
      }
      
      const messageWithSender = {
        ...data,
        sender: senderData
      }
      
      // Update chat's last message info
      await this.updateChatLastMessage(chatId, content, effectiveSenderId)
      
      // Send notification to the other participant
      try {
        // Get chat details to find the other participant
        const { data: chatData } = await supabase
          .from('chats')
          .select('customer_id, tasker_id, task_id')
          .eq('id', chatId)
          .single()

        if (chatData) {
          const receiverId = chatData.customer_id === effectiveSenderId ? chatData.tasker_id : chatData.customer_id
          
          if (receiverId) {
            // Get sender name for notification
            const senderName = messageWithSender.sender?.full_name || 'Unknown'
            
            await UnifiedNotificationService.notifyNewMessage(
              chatId,
              effectiveSenderId,
              receiverId,
              content,
              senderName
            )
          }
        }
      } catch (notificationError) {
        console.error('Error sending message notification:', notificationError)
        // Don't throw here - message should be sent even if notification fails
      }
      
      return messageWithSender
    } catch (error) {
      console.error('Error sending message:', error)
      return null
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('messages_new')
        .update({
          is_read: true
        })
        .eq('chat_id', chatId)
        .eq('is_read', false)
        .neq('sender_id', userId) // Don't mark own messages as read

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error marking messages as read:', error)
      return false
    }
  }

  // Get unread count for a chat
  static async getUnreadCount(chatId: string, userId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('messages_new')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chatId)
        .eq('is_read', false)
        .neq('sender_id', userId)

      if (error) throw error
      return count || 0
    } catch (error) {
      console.error('Error getting unread count:', error)
      return 0
    }
  }

  // Batched unread counts for all chats the user is part of.
  static async getAllUnreadCounts(userId: string): Promise<Map<string, number>> {
    try {
      // Prefer server-side aggregation via RPC for performance on large datasets
      const { data, error } = await supabase.rpc('get_unread_counts', { in_user_id: userId })
      if (!error && Array.isArray(data)) {
        const map = new Map<string, number>()
        for (const row of data as Array<{ chat_id: string; unread_count: number }>) {
          map.set(row.chat_id, row.unread_count)
        }
        return map
      }
    } catch (e) {
      // Fallback below
    }

    // Fallback: fetch chat ids then one grouped query (less optimal, but keeps correctness)
    try {
      const { data: chats } = await supabase
        .from('chats')
        .select('id')
        .or(`customer_id.eq.${userId},tasker_id.eq.${userId}`)

      const chatIds = (chats || []).map(c => c.id)
      const result = new Map<string, number>()
      if (chatIds.length === 0) return result

      // Query unread messages for these chats; client-group since PostgREST group-by aliases are limited
      const { data: unread } = await supabase
        .from('messages_new')
        .select('chat_id')
        .in('chat_id', chatIds)
        .eq('is_read', false)
        .neq('sender_id', userId)

      for (const row of (unread || [])) {
        result.set(row.chat_id, (result.get(row.chat_id) || 0) + 1)
      }
      return result
    } catch (error) {
      console.error('Error getting all unread counts (fallback):', error)
      return new Map()
    }
  }

  // Get total unread count for user
  static async getTotalUnreadCount(userId: string): Promise<number> {
    try {
      const unreadMap = await this.getAllUnreadCounts(userId)
      let total = 0
      unreadMap.forEach(v => { total += v })
      return total
    } catch (error) {
      console.error('Error getting total unread count:', error)
      return 0
    }
  }

  // Update chat last message info
  static async updateChatLastMessage(chatId: string, messageText: string, senderId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chats')
        .update({ 
          last_message_at: new Date().toISOString(),
          last_message_text: messageText,
          last_message_sender_id: senderId
        })
        .eq('id', chatId)

      if (error) throw error
      return true
    } catch (error) {
      console.error('Error updating chat last message:', error)
      return false
    }
  }

  // Delete a message (only sender can delete)
  static async deleteMessage(messageId: string, senderId: string): Promise<boolean> {
    try {
      console.log('🗑️ Attempting to delete message:', messageId, 'for sender:', senderId)
      
      // First, get the chat_id before deletion for cache cleanup
      const { data: messageData } = await supabase
        .from('messages_new')
        .select('chat_id')
        .eq('id', messageId)
        .eq('sender_id', senderId)
        .single()
      
      // Use RPC function to delete message (bypasses RLS)
      const { data, error } = await supabase.rpc('delete_message', {
        in_message_id: messageId,
        in_sender_id: senderId
      })

      if (error) {
        console.error('❌ Error deleting message:', error)
        throw error
      }
      
      const deleted = data === true
      
      if (deleted) {
        console.log('✅ Message deleted successfully:', messageId)
        // Clear from cache if it exists
        if (messageData?.chat_id) {
          const cachedMessages = this.messageCache.get(messageData.chat_id)
          if (cachedMessages) {
            this.messageCache.set(
              messageData.chat_id,
              cachedMessages.filter(m => m.id !== messageId)
            )
          }
        }
      } else {
        console.warn('⚠️ Message deletion failed - message not found or user not authorized:', messageId)
      }
      
      return deleted
    } catch (error) {
      console.error('❌ Error deleting message:', error)
      return false
    }
  }

  // Get chat by ID
  static async getChatById(chatId: string): Promise<Chat | null> {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          *,
          task:task_id (
            id,
            title,
            status
          ),
          customer:customer_id (
            id,
            full_name,
            avatar_url,
            phone
          ),
          tasker:tasker_id (
            id,
            full_name,
            avatar_url,
            phone
          )
        `)
        .eq('id', chatId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error getting chat by ID:', error)
      return null
    }
  }

  // Get chat messages by chat ID (alias for getChatMessages)
  static async getChatMessagesByChatId(chatId: string, limit: number = 50, offset: number = 0): Promise<Message[]> {
    return this.getChatMessages(chatId, limit, offset)
  }

  // Subscribe to chat for real-time updates (delegate to RealtimeChatService)
  static async subscribeToChat(chatId: string, callbacks: {
    onMessage: (message: any) => void
    onMessageDeleted?: (messageId: string) => void
    onTyping?: (userId: string, isTyping: boolean) => void
    onUserOnline?: (userId: string, isOnline: boolean) => void
  }): Promise<any> {
    const { RealtimeChatService } = await import('./RealtimeChatService')
    return RealtimeChatService.subscribeToChat(chatId, callbacks)
  }

  // Unsubscribe from chat (delegate to RealtimeChatService)
  static unsubscribeFromChat(chatId: string): void {
    // This will be handled by RealtimeChatService
    const { RealtimeChatService } = require('./RealtimeChatService')
    RealtimeChatService.unsubscribeFromChat(chatId)
  }


  // Send message to chat (alias for sendMessage)
  static async sendMessageToChat(chatId: string, messageText: string, senderId: string): Promise<boolean> {
    const message = await this.sendMessage(chatId, senderId, messageText)
    return message !== null
  }

  // Delete chat and all messages (used when task is completed)
  static async deleteChatAndMessages(chatId: string, userId?: string): Promise<boolean> {
    try {
      console.log('🗑️ Attempting to delete chat and messages:', chatId, 'for user:', userId)
      
      if (!userId) {
        console.error('❌ User ID is required to delete chat')
        return false
      }

      // Use RPC function to delete chat and messages (bypasses RLS, verifies user is participant)
      const { data, error } = await supabase.rpc('delete_chat_and_messages', {
        in_chat_id: chatId,
        in_user_id: userId
      })

      if (error) {
        console.error('❌ Error deleting chat and messages:', error)
        throw error
      }

      const success = data === true
      
      if (success) {
        console.log('✅ Chat and messages deleted successfully')
        // Clear messages from cache
        this.messageCache.delete(chatId)
      } else {
        console.warn('⚠️ Chat deletion failed - user not authorized or chat not found:', chatId)
      }

      return success
    } catch (error) {
      console.error('❌ Error deleting chat and messages:', error)
      return false
    }
  }

  // Delete chat by task ID (used when task is completed)
  static async deleteChatByTaskId(taskId: string): Promise<boolean> {
    try {
      // First, find the chat for this task
      const { data: chat, error: findError } = await supabase
        .from('chats')
        .select('id')
        .eq('task_id', taskId)
        .single()

      if (findError) {
        return true // No chat to delete, consider it successful
      }

      if (!chat) {
        return true // No chat to delete, consider it successful
      }

      // Delete the chat and all its messages
      return await this.deleteChatAndMessages(chat.id)
    } catch (error) {
      console.error('Error deleting chat by task ID:', error)
      return false
    }
  }
}
