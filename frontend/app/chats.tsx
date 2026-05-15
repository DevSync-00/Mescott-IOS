import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  StatusBar,
  Dimensions,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { DeviceEventEmitter } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useFocusEffect } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { RealtimeChatService, Chat } from '../services/RealtimeChatService'
import { ChatService } from '../services/ChatService'
import Colors from '../constants/Colors'
import SkeletonLoader, { SkeletonList } from '../components/SkeletonLoader'

const { width } = Dimensions.get('window')

export default function Chats() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filteredChats, setFilteredChats] = useState<Chat[]>([])
  const [clearedChats, setClearedChats] = useState<Set<string>>(new Set())
  const CLEARED_KEY = user ? `cleared_unread_${user.id}` : 'cleared_unread'

  useFocusEffect(
    React.useCallback(() => {
      if (!isLoading && !isAuthenticated) {
        router.replace('/auth')
      }
    }, [isAuthenticated, isLoading])
  )

  useEffect(() => {
    if (isAuthenticated) {
      loadChats()
    }
  }, [isAuthenticated])

  // Load persisted cleared chats
  useEffect(() => {
    (async () => {
      if (!user?.id) return
      try {
        const stored = await AsyncStorage.getItem(`cleared_unread_${user.id}`)
        if (stored) {
          const ids: string[] = JSON.parse(stored)
          setClearedChats(new Set(ids))
        }
      } catch {}
    })()
  }, [user?.id])

  // React to read events from chat detail
  useEffect(() => {
    const readSub = DeviceEventEmitter.addListener('chat:read', (payload: any) => {
      const id = payload?.chatId
      if (!id) return
      setChats(prev => prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c))
      setFilteredChats(prev => prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c))
      setClearedChats(prev => new Set([...Array.from(prev), id]))
    })
    
    // React to chat deletion events
    const deletedSub = DeviceEventEmitter.addListener('chat:deleted', (payload: any) => {
      const id = payload?.chatId
      if (!id) return
      console.log('Chat deleted event received:', id)
      setChats(prev => prev.filter(c => c.id !== id))
      setFilteredChats(prev => prev.filter(c => c.id !== id))
      setClearedChats(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    })
    
    return () => {
      readSub.remove()
      deletedSub.remove()
    }
  }, [])

  // When cleared set changes, re-apply suppression to current lists
  useEffect(() => {
    if (clearedChats.size === 0) return
    setChats(prev => prev.map(c => clearedChats.has(c.id) ? { ...c, unread_count: 0 } : c))
    setFilteredChats(prev => prev.map(c => clearedChats.has(c.id) ? { ...c, unread_count: 0 } : c))
  }, [clearedChats])

  // Keep list fresh when returning from detail
  useFocusEffect(
    React.useCallback(() => {
      if (isAuthenticated) {
        loadChats()
      }
    }, [isAuthenticated])
  )

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = chats.filter(chat => {
        const otherParticipant = getOtherParticipant(chat)
        const participantName = otherParticipant?.full_name || 'Unknown User'
        const taskTitle = chat.task?.title || 'Task Discussion'
        
        return participantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
               taskTitle.toLowerCase().includes(searchQuery.toLowerCase())
      })
      setFilteredChats(filtered)
    } else {
      setFilteredChats(chats)
    }
  }, [searchQuery, chats])

  const loadChats = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      const userChats = await RealtimeChatService.getUserChats(user.id)
      // Sort by most recent activity (last_message_at desc)
      const sorted = [...userChats].sort((a, b) => {
        const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        return bt - at
      })
      // Apply client-side suppression for chats the user has opened
      const suppressed = sorted.map(c =>
        (clearedChats.has(c.id) ? { ...c, unread_count: 0 } : c)
      )
      setChats(suppressed)
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

  const handleChatSelect = async (chatId: string) => {
    // Optimistically clear unread badge for immediate feedback
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c))
    setFilteredChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c))
    setClearedChats(prev => {
      const next = new Set([...Array.from(prev), chatId])
      AsyncStorage.setItem(CLEARED_KEY, JSON.stringify(Array.from(next))).catch(() => {})
      return next
    })
    
    if (user?.id) {
      // Mark as read in background and refresh the chat list
      try {
        await RealtimeChatService.markMessagesAsRead(chatId, user.id)
        // Reload chats to get updated unread counts
        await loadChats()
      } catch (error) {
        console.error('Error marking messages as read:', error)
      }
    }
    
    router.push(`/chat-detail?chatId=${chatId}`)
  }

  const formatLastMessageTime = (timestamp: string | null) => {
    if (!timestamp) return ''
    
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    
    if (diffInHours < 1) {
      return 'Just now'
    } else if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffInHours < 168) { // 7 days
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  const getOtherParticipant = (chat: Chat) => {
    if (!user) return null
    
    if (chat.customer_id === user.id) {
      return chat.tasker
    } else {
      return chat.customer
    }
  }

  const getLastMessagePreview = (chat: Chat) => {
    if (chat.last_message && chat.last_message.trim()) {
      return chat.last_message.length > 50 
        ? chat.last_message.substring(0, 50) + '...'
        : chat.last_message
    }
    // If there are unread messages but no last_message text, show a generic message
    if ((chat.unread_count || 0) > 0) {
      return 'New message'
    }
    return 'Start a conversation'
  }

  const renderChat = ({ item }: { item: Chat }) => {
    const otherParticipant = getOtherParticipant(item)
    // Only show unread if it's not in cleared chats and has actual unread count
    const effectiveUnread = clearedChats.has(item.id) ? 0 : (item.unread_count || 0)
    const hasUnread = effectiveUnread > 0
    const lastMessage = getLastMessagePreview(item)

    return (
      <TouchableOpacity
        style={[styles.chatItem, hasUnread && styles.unreadChatItem]}
        onPress={() => handleChatSelect(item.id)}
        onLongPress={() => {
          Alert.alert(
            'Delete conversation',
            'This will delete all messages for this chat. Continue?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => {
                  try {
                    const ok = await ChatService.deleteChatAndMessages(item.id, user?.id || '')
                    if (ok) {
                      // Emit event to notify other components
                      DeviceEventEmitter.emit('chat:deleted', { chatId: item.id })
                      setChats(prev => prev.filter(c => c.id !== item.id))
                      setFilteredChats(prev => prev.filter(c => c.id !== item.id))
                      setClearedChats(prev => {
                        const next = new Set(prev)
                        next.delete(item.id)
                        return next
                      })
                    } else {
                      Alert.alert('Error', 'Failed to delete chat. Please try again.')
                    }
                  } catch (e) {
                    console.error('Delete chat failed', e)
                    Alert.alert('Error', 'Failed to delete chat. Please try again.')
                  }
                }
              }
            ]
          )
        }}
        activeOpacity={0.7}
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
            <Text style={[styles.participantName, hasUnread && styles.unreadText]}>
              {otherParticipant?.full_name || 'Unknown User'}
            </Text>
            <Text style={styles.lastMessageTime}>
              {formatLastMessageTime(item.last_message_at)}
            </Text>
          </View>
          
          <View style={styles.chatFooter}>
            <Text 
              style={[styles.lastMessage, hasUnread && styles.unreadText]} 
              numberOfLines={1}
            >
              {lastMessage}
            </Text>
            {hasUnread && (
              <View style={styles.unreadCount}>
                <Text style={styles.unreadCountText}>
                  {effectiveUnread}
                </Text>
              </View>
            )}
          </View>
          
          {item.task && (
            <View style={styles.taskInfo}>
              <Ionicons name="briefcase" size={12} color={Colors.neutral[500]} />
              <Text style={styles.taskTitle} numberOfLines={1}>
                {item.task.title}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.background.primary} />
        <View style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <View style={styles.loadingIcon}>
              <Ionicons name="chatbubbles" size={48} color={Colors.primary[500]} />
            </View>
            <Text style={styles.loadingTitle}>Loading Messages</Text>
            <Text style={styles.loadingSubtitle}>Fetching your conversations...</Text>
          </View>
        </View>
      </View>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background.primary} />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Messages</Text>
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={Colors.neutral[400]} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search conversations..."
            placeholderTextColor={Colors.neutral[400]}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.neutral[400]} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      
      {/* Chat List */}
      {loading ? (
        <SkeletonList count={5} />
      ) : filteredChats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color={Colors.neutral[300]} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No matching conversations' : 'No messages yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery 
              ? 'Try adjusting your search terms'
              : 'Start a conversation by accepting a task application'
            }
          </Text>
          {!searchQuery && (
            <TouchableOpacity style={styles.browseButton}>
              <Text style={styles.browseButtonText}>Browse Tasks</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredChats}
          keyExtractor={(item) => item.id}
          renderItem={renderChat}
          style={styles.chatsList}
          contentContainerStyle={styles.chatsListContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[Colors.primary[500]]}
              tintColor={Colors.primary[500]}
            />
          }
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
          overScrollMode="always"
          contentContainerStyle={{ ...styles.chatsListContent, paddingBottom: 120 }}
        />
      )}
    </View>
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
    backgroundColor: Colors.background.primary,
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary[50],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: Colors.neutral[600],
    textAlign: 'center',
  },
  header: {
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.neutral[900],
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginTop: 2,
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[100],
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
  },
  chatsList: {
    flex: 1,
  },
  chatsListContent: {
    paddingTop: 0,
    paddingBottom: 20, // Base padding, will be overridden to 120 in contentContainerStyle
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  unreadChatItem: {
    backgroundColor: Colors.primary[25],
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.neutral[200],
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.neutral[200],
  },
  unreadBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary[500],
    borderWidth: 2,
    borderColor: Colors.background.primary,
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    flex: 1,
  },
  unreadText: {
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  lastMessageTime: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontWeight: '500',
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.neutral[600],
    flex: 1,
    lineHeight: 20,
  },
  unreadCount: {
    backgroundColor: Colors.primary[500],
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskTitle: {
    fontSize: 12,
    color: Colors.neutral[500],
    flex: 1,
    fontStyle: 'italic',
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
  browseButton: {
    backgroundColor: Colors.primary[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})