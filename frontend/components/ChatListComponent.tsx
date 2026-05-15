import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { RealtimeChatService, Chat } from '../services/RealtimeChatService'
import { useAuth } from '../contexts/SimpleAuthContext'
import Colors from '../constants/Colors'

interface ChatListComponentProps {
  onChatSelect: (chatId: string) => void
}

export default function ChatListComponent({ onChatSelect }: ChatListComponentProps) {
  const { user } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    loadChats()
  }, [])

  const loadChats = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      console.log('🚀 CHAT LIST - Loading chats for user:', user.id)
      const userChats = await RealtimeChatService.getUserChats(user.id)
      console.log('🚀 CHAT LIST - Loaded chats:', userChats)
      setChats(userChats)
    } catch (error) {
      console.error('Error loading chats:', error)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadChats()
    setRefreshing(false)
  }

  const formatLastMessageTime = (timestamp: string | null) => {
    if (!timestamp) return ''
    
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const getOtherParticipant = (chat: Chat) => {
    if (!user) return null
    
    console.log('🚀 CHAT LIST - Getting other participant:', {
      chatCustomerId: chat.customer_id,
      chatTaskerId: chat.tasker_id,
      userId: user.id,
      userRole: user.role
    })
    
    if (chat.customer_id === user.id) {
      // User is the customer, show tasker
      console.log('🚀 CHAT LIST - User is customer, showing tasker:', chat.tasker)
      return chat.tasker
    } else {
      // User is the tasker, show customer
      console.log('🚀 CHAT LIST - User is tasker, showing customer:', chat.customer)
      return chat.customer
    }
  }

  const renderChat = ({ item }: { item: Chat }) => {
    const otherParticipant = getOtherParticipant(item)
    const hasUnread = (item.unread_count || 0) > 0

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => onChatSelect(item.id)}
      >
        <View style={styles.avatarContainer}>
          {otherParticipant?.avatar_url ? (
            <Image
              source={{ uri: otherParticipant.avatar_url }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={24} color={Colors.neutral[400]} />
            </View>
          )}
          {hasUnread && <View style={styles.unreadBadge} />}
        </View>
        
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.participantName}>
              {otherParticipant?.full_name || 'Unknown User'}
            </Text>
            <Text style={styles.lastMessageTime}>
              {formatLastMessageTime(item.last_message_at)}
            </Text>
          </View>
          
          <View style={styles.chatFooter}>
            <Text style={styles.taskTitle} numberOfLines={1}>
              {item.task?.title || 'Task Discussion'}
            </Text>
            {hasUnread && (
              <View style={styles.unreadCount}>
                <Text style={styles.unreadCountText}>
                  {item.unread_count}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary[500]} />
          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>
      
      {chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={Colors.neutral[300]} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>
            Start a conversation by accepting a task application
          </Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.id}
          renderItem={renderChat}
          style={styles.chatsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary[500]]}
            />
          }
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
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
  header: {
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.neutral[900],
  },
  chatsList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary[500],
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    flex: 1,
  },
  lastMessageTime: {
    fontSize: 12,
    color: Colors.neutral[500],
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskTitle: {
    fontSize: 14,
    color: Colors.neutral[600],
    flex: 1,
  },
  unreadCount: {
    backgroundColor: Colors.primary[500],
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
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
})
