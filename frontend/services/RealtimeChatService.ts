import { supabase } from '../lib/supabase'
import { RealtimeChannel } from '@supabase/supabase-js'
import { ChatService, Chat, Message } from './ChatService'

export interface RealtimeMessage extends Message {
  sender_name?: string
  sender_avatar?: string
}

export interface ChatSubscription {
  chatId: string
  onMessage: (message: RealtimeMessage) => void
  onUserOnline: (userId: string, isOnline: boolean) => void
}

export class RealtimeChatService {
  private static channels: Map<string, RealtimeChannel> = new Map()
  private static onlineUsers: Set<string> = new Set()
  private static profileCache: Map<string, { id: string; full_name: string; avatar_url: string | null; phone: string }> = new Map()

  private static async getSenderProfile(senderId: string) {
    if (this.profileCache.has(senderId)) return this.profileCache.get(senderId)!
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, phone')
      .eq('id', senderId)
      .single()
    if (data) this.profileCache.set(senderId, data)
    return data
  }

  // Subscribe to a chat for real-time updates
  static async subscribeToChat(chatId: string, callbacks: {
    onMessage: (message: RealtimeMessage) => void
    onMessageDeleted?: (messageId: string) => void
    onUserOnline?: (userId: string, isOnline: boolean) => void
  }): Promise<RealtimeChannel | null> {
    try {
      // Unsubscribe from existing channel if any
      this.unsubscribeFromChat(chatId)

      console.log('Setting up real-time subscription for chat:', chatId)
      
      const channel = supabase
        .channel(`chat:${chatId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages_new',
            filter: `chat_id=eq.${chatId}`
          },
          async (payload) => {
            // Use payload.new directly to remove redundant fetches
            const newMessage = payload.new as any
            if (!newMessage) return
            const sender = await this.getSenderProfile(newMessage.sender_id)
            const fullMessage = {
              ...newMessage,
              sender
            } as RealtimeMessage
            callbacks.onMessage(fullMessage)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages_new',
            filter: `chat_id=eq.${chatId}`
          },
          async (payload) => {
            // Use payload.new directly to remove redundant fetches
            const updatedMessage = payload.new as any
            if (!updatedMessage) return
            const sender = await this.getSenderProfile(updatedMessage.sender_id)
            const fullMessage = {
              ...updatedMessage,
              sender
            } as RealtimeMessage
            callbacks.onMessage(fullMessage)
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'messages_new',
            filter: `chat_id=eq.${chatId}`
          },
          (payload) => {
            // Handle message deletion
            const deletedMessageId = payload.old?.id as string
            if (deletedMessageId && callbacks.onMessageDeleted) {
              console.log('Real-time: Message deleted:', deletedMessageId)
              callbacks.onMessageDeleted(deletedMessageId)
            }
          }
        )
        .subscribe((status) => {
          console.log('Subscription status:', status)
        })

      this.channels.set(chatId, channel)
      console.log('Real-time subscription established for chat:', chatId)
      return channel
    } catch (error) {
      console.error('Error subscribing to chat:', error)
      return null
    }
  }

  // Unsubscribe from a chat
  static unsubscribeFromChat(chatId: string): void {
    const channel = this.channels.get(chatId)
    if (channel) {
      supabase.removeChannel(channel)
      this.channels.delete(chatId)
    }
  }

  // Unsubscribe from all chats
  static unsubscribeFromAllChats(): void {
    this.channels.forEach((channel) => {
      supabase.removeChannel(channel)
    })
    this.channels.clear()
  }

  // Send a message
  static async sendMessage(chatId: string, senderId: string, content: string, messageType: 'text' | 'image' | 'file' = 'text'): Promise<boolean> {
    try {
      const message = await ChatService.sendMessage(chatId, senderId, content, messageType)
      return message !== null
    } catch (error) {
      console.error('Error sending message:', error)
      return false
    }
  }

  // Mark messages as read
  static async markMessagesAsRead(chatId: string, userId: string): Promise<boolean> {
    try {
      return await ChatService.markMessagesAsRead(chatId, userId)
    } catch (error) {
      console.error('Error marking messages as read:', error)
      return false
    }
  }

  // Get unread count for a chat
  static async getUnreadCount(chatId: string, userId: string): Promise<number> {
    try {
      return await ChatService.getUnreadCount(chatId, userId)
    } catch (error) {
      console.error('Error getting unread count:', error)
      return 0
    }
  }

  // Get all unread counts for user's chats
  static async getAllUnreadCounts(userId: string): Promise<Map<string, number>> {
    try {
      return await ChatService.getAllUnreadCounts(userId)
    } catch (error) {
      console.error('Error getting all unread counts:', error)
      return new Map()
    }
  }

  // Get total unread count for user
  static async getTotalUnreadCount(userId: string): Promise<number> {
    try {
      return await ChatService.getTotalUnreadCount(userId)
    } catch (error) {
      console.error('Error getting total unread count:', error)
      return 0
    }
  }

  // Get chat messages
  static async getChatMessages(chatId: string, limit: number = 50, offset: number = 0): Promise<RealtimeMessage[]> {
    try {
      const messages = await ChatService.getChatMessages(chatId, limit, offset)
      return messages as RealtimeMessage[]
    } catch (error) {
      console.error('Error getting chat messages:', error)
      return []
    }
  }

  // Get user chats
  static async getUserChats(userId: string): Promise<Chat[]> {
    try {
      return await ChatService.getUserChats(userId)
    } catch (error) {
      console.error('Error getting user chats:', error)
      return []
    }
  }

  // Get or create chat
  static async getOrCreateChat(taskId: string, customerId: string, taskerId: string): Promise<Chat | null> {
    try {
      return await ChatService.getOrCreateChat(taskId, customerId, taskerId)
    } catch (error) {
      console.error('Error getting/creating chat:', error)
      return null
    }
  }

  // Update chat last message info
  static async updateChatLastMessage(chatId: string, messageText: string, senderId: string): Promise<boolean> {
    try {
      return await ChatService.updateChatLastMessage(chatId, messageText, senderId)
    } catch (error) {
      console.error('Error updating chat last message:', error)
      return false
    }
  }

  // Delete a message
  static async deleteMessage(messageId: string, senderId: string): Promise<boolean> {
    try {
      return await ChatService.deleteMessage(messageId, senderId)
    } catch (error) {
      console.error('Error deleting message:', error)
      return false
    }
  }

  // Get chat by ID
  static async getChatById(chatId: string): Promise<Chat | null> {
    try {
      return await ChatService.getChatById(chatId)
    } catch (error) {
      console.error('Error getting chat by ID:', error)
      return null
    }
  }
}