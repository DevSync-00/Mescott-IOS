import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  StatusBar,
  Image,
  FlatList,
  Modal,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { Ionicons } from '@expo/vector-icons'
import { DeviceEventEmitter } from 'react-native'
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { ChatService, Chat } from '../services/ChatService'
import { BookingService } from '../services/BookingService'
import { SimpleNotificationService } from '../services/SimpleNotificationService'
import { supabase } from '../lib/supabase'
import Colors from '../constants/Colors'
import SkeletonLoader from '../components/SkeletonLoader'
import { ImageService } from '../services/ImageService'

const { width: screenWidth, height: screenHeight } = Dimensions.get('window')

interface Message {
  id: string
  message: string
  sender_id: string
  created_at: string
  sender_name?: string
  is_read?: boolean
  message_type?: 'text' | 'image' | 'file' | 'system'
  status?: 'sending' | 'sent' | 'delivered' | 'read'
}

// Using Chat interface from ChatService

export default function ChatDetail() {
  const { user, isAuthenticated, loading: isLoading } = useAuth()
  const router = useRouter()
  const { chatId, taskId, taskTitle, otherUserName } = useLocalSearchParams<{ 
    chatId: string; 
    taskId: string; 
    taskTitle: string; 
    otherUserName: string;
  }>()
  const insets = useSafeAreaInsets()
  const [headerHeight, setHeaderHeight] = useState(0)
  
  const [chat, setChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [booking, setBooking] = useState<any>(null)
  const [participantName, setParticipantName] = useState<string>(otherUserName || 'Unknown')
  const [isOnline, setIsOnline] = useState(false)
  const [lastSeen, setLastSeen] = useState<string>('')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [otherUserOnline, setOtherUserOnline] = useState(false)
  const [imageModalVisible, setImageModalVisible] = useState(false)
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null)
  const [optionsVisible, setOptionsVisible] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  useEffect(() => {
    if (chatId && user?.id) {
      loadChatData()
    }
  }, [chatId, user?.id])

  // Mark messages as read on screen focus and when new messages arrive
  useEffect(() => {
    if (!chatId || !user?.id) return
    const markAsRead = async () => {
      try {
        await ChatService.markMessagesAsRead(chatId, user.id)
        DeviceEventEmitter.emit('chat:read', { chatId })
        // Trigger a refresh of chat list to update unread counts
        // This will be handled by the chats page's useFocusEffect
      } catch (error) {
        console.error('Error marking messages as read:', error)
      }
    }
    markAsRead()
  }, [chatId, user?.id, messages.length])

  // Refresh chat list when leaving this screen to update unread counts
  useFocusEffect(
    React.useCallback(() => {
      // Mark as read when screen is focused
      if (chatId && user?.id) {
        ChatService.markMessagesAsRead(chatId, user.id).catch(() => {})
      }
      
      return () => {
        // When screen loses focus, messages should already be marked as read
        // The chats page will refresh when we navigate back
      }
    }, [chatId, user?.id])
  )

  useEffect(() => {
    if (otherUserName && otherUserName !== 'Unknown') {
      setParticipantName(otherUserName)
    }
  }, [otherUserName])

  // Real-time chat subscription
  useEffect(() => {
    if (chat?.id && user?.id && !isSubscribed) {
      subscribeToRealtimeChat()
    }

    return () => {
      if (chat?.id) {
        ChatService.unsubscribeFromChat(chat.id)
      }
    }
  }, [chat?.id, user?.id, isSubscribed])

  const subscribeToRealtimeChat = async () => {
    if (!chat?.id) return

    try {
      await ChatService.subscribeToChat(chat.id, {
        onMessage: (message) => {
          setMessages(prev => {
            // Check if message already exists to avoid duplicates
            if (prev.some(m => m.id === message.id)) {
              return prev
            }
            const next = [...prev, {
              id: message.id,
              message: message.message,
              sender_id: message.sender_id,
              created_at: message.created_at,
              sender_name: message.sender?.full_name || 'Unknown',
              is_read: false,
              message_type: message.message_type || 'text',
              status: 'delivered' as const
            }]
            return next.sort((m1, m2) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime())
          })
          // Mark as read if the new message is from the other user
          if (chatId && user?.id && message.sender_id !== user.id) {
            ChatService.markMessagesAsRead(chatId, user.id)
              .then(() => DeviceEventEmitter.emit('chat:read', { chatId }))
              .catch(() => {})
          }
          
          // Scroll to bottom (not needed for inverted FlatList)
        },
        onMessageDeleted: (messageId) => {
          console.log('Real-time: Removing deleted message from UI:', messageId)
          setMessages(prev => prev.filter(m => m.id !== messageId))
        },
        onUserOnline: (userId, online) => {
          if (userId !== user?.id) {
            setOtherUserOnline(online)
          }
        }
      })
      setIsSubscribed(true)
    } catch (error) {
      console.error('Error subscribing to real-time chat:', error)
    }
  }

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <SkeletonLoader width={60} height={60} borderRadius={30} style={{ marginBottom: 16 }} />
          <SkeletonLoader width={200} height={20} style={{ marginBottom: 8 }} />
          <SkeletonLoader width={150} height={16} />
        </View>
      </SafeAreaView>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const loadParticipantName = async (chatData: Chat) => {
    if (!user?.id || !chatData) return


    try {
      // Use the names from chatData if available
      if (chatData.customer?.full_name && chatData.tasker?.full_name) {
        const otherName = user.id === chatData.customer_id ? chatData.tasker.full_name : chatData.customer.full_name
        if (otherName && otherName !== 'Unknown') {
          setParticipantName(otherName)
          return
        }
      }

      // Fallback: Determine the other participant's ID and fetch name
      const otherParticipantId = user.id === chatData.customer_id ? chatData.tasker_id : chatData.customer_id
      
      if (otherParticipantId) {
        // Fetch the participant's name from profiles
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', otherParticipantId)
          .single()

        if (!error && profile?.full_name) {
          setParticipantName(profile.full_name)
        } else {
          // Fallback based on user mode
          setParticipantName(user.current_mode === 'customer' ? 'Tasker' : 'Customer')
        }
      } else {
        // Final fallback
        setParticipantName(user.current_mode === 'customer' ? 'Tasker' : 'Customer')
      }
    } catch (error) {
      console.error('Error loading participant name:', error)
      setParticipantName(user.current_mode === 'customer' ? 'Tasker' : 'Customer')
    }
  }

  const loadChatData = async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      
      let chatData = null
      
      if (chatId) {
        // Load chat details by chatId (which is actually taskId)
        chatData = await ChatService.getChatById(chatId)
        if (!chatData) throw new Error('Chat not found')
      } else if (taskId) {
        // Create or get chat by taskId
        chatData = await ChatService.getOrCreateChat(taskId, user.id, 'temp-tasker-id')
        if (!chatData) throw new Error('Failed to create chat')
      } else {
        throw new Error('No chat or task ID provided')
      }
      
      setChat(chatData)

      // Load participant name
      await loadParticipantName(chatData)

      // Fetch cached messages immediately, start fresh fetch and subscription in parallel
      const targetChatId = chatId || chatData.id
      const { cached, fresh } = await ChatService.getChatMessagesFast(targetChatId)
      if (cached && cached.length > 0) {
        const orderedCached = [...cached].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        setMessages(orderedCached)
      }

      // Kick off subscription without blocking render
      subscribeToRealtimeChat().catch(() => {})

      // In parallel: fetch fresh messages and mark as read
      fresh
        .then((freshMsgs) => {
          const orderedFresh = [...(freshMsgs || [])].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          setMessages(orderedFresh)
        })
        .catch(() => {})

      if (chatData.id && user?.id) {
        ChatService.markMessagesAsRead(chatData.id, user.id)
          .then(() => DeviceEventEmitter.emit('chat:read', { chatId: chatData.id }))
          .catch(() => {})
      }

    } catch (error) {
      console.error('Error loading chat data:', error)
      Alert.alert('Error', 'Failed to load chat')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user?.id || sending) return

    const messageText = newMessage.trim()
    setNewMessage('')

    // Add message optimistically to UI
    const tempMessage: Message = {
      id: `temp_${Date.now()}`,
      message: messageText,
      sender_id: user.id,
      created_at: new Date().toISOString(),
      sender_name: user.name || 'You',
      status: 'sending'
    }
    
    setMessages(prev => {
      const next = [...prev, tempMessage]
      return next.sort((m1, m2) => new Date(m1.created_at).getTime() - new Date(m2.created_at).getTime())
    })
    // Auto-scroll handled by inverted FlatList

    try {
      setSending(true)
      
      let success = false
      
      if (chatId) {
        const result = await ChatService.sendMessage(chatId, user.id, messageText)
        success = result !== null
      } else if (chat?.id) {
        success = await ChatService.sendMessageToChat(chat.id, messageText, user.id)
      }
      
      if (success) {
        // Update message status to sent
        setMessages(prev => prev.map(msg => 
          msg.id === tempMessage.id 
            ? { ...msg, id: `real_${Date.now()}`, status: 'sent' as const }
            : msg
        ))
        
      // Reload messages to get the real message with proper ID
      setTimeout(async () => {
        let messagesData = chatId
          ? await ChatService.getChatMessagesByChatId(chatId)
          : await ChatService.getChatMessages(chat?.id || '')
        messagesData = (messagesData || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        setMessages(messagesData)
        
        // Mark the new message as read
        if (taskId && messagesData.length > 0) {
          const latestMessage = messagesData[messagesData.length - 1]
          await SimpleNotificationService.markMessageAsRead(taskId, latestMessage.id)
        }
      }, 500)
      } else {
        // Remove failed message
        setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
        Alert.alert('Error', 'Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== tempMessage.id))
      Alert.alert('Error', 'Failed to send message')
    } finally {
      setSending(false)
    }
  }


  // Auto-scroll handled by inverted FlatList automatically

  const handleFileUpload = async () => {
    Alert.alert(
      'Upload File',
      'Choose what you want to upload',
      [
        {
          text: 'Camera',
          onPress: () => openCamera(),
        },
        {
          text: 'Photo Library',
          onPress: () => openImageLibrary(),
        },
        {
          text: 'Documents',
          onPress: () => openDocumentPicker(),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    )
  }

  const openCamera = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync()
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Camera permission is required to take photos')
        return
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        await sendFileMessage(result.assets[0].uri, 'image')
      }
    } catch (error) {
      console.error('Error taking photo:', error)
      Alert.alert('Error', 'Failed to take photo')
    }
  }

  const openImageLibrary = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Photo library permission is required')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        await sendFileMessage(result.assets[0].uri, 'image')
      }
    } catch (error) {
      console.error('Error picking image:', error)
      Alert.alert('Error', 'Failed to pick image')
    }
  }

  const openDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      })

      if (!result.canceled && result.assets[0]) {
        await sendFileMessage(result.assets[0].uri, 'document')
      }
    } catch (error) {
      console.error('Error picking document:', error)
      Alert.alert('Error', 'Failed to pick document')
    }
  }

  const sendFileMessage = async (fileUri: string, fileType: 'image' | 'document') => {
    if (!user?.id || sending) return

    try {
      setSending(true)
      
      if (fileType === 'image') {
        // Upload image to Supabase storage first
        const uploadResult = await ImageService.uploadImage(fileUri, 'chat-images')
        
        if (!uploadResult.success || !uploadResult.url) {
          Alert.alert('Error', 'Failed to upload image. Please try again.')
          return
        }
        
        // Send image URL with message_type='image'
        let success = false
        if (chatId) {
          const result = await ChatService.sendMessage(chatId, user.id, uploadResult.url, 'image')
          success = result !== null
        } else if (chat?.id) {
          const result = await ChatService.sendMessage(chat.id, user.id, uploadResult.url, 'image')
          success = result !== null
        }
        
        if (success) {
          // Reload messages to show the new image
          setTimeout(async () => {
            const messagesData = chatId
              ? await ChatService.getChatMessagesByChatId(chatId)
              : await ChatService.getChatMessages(chat?.id || '')
            setMessages(messagesData)
          }, 500)
        } else {
          Alert.alert('Error', 'Failed to send image')
        }
      } else {
        // For documents, send as file type
        const fileMessage = `📄 Document: ${fileUri}`
      let success = false
      
      if (chatId) {
          const result = await ChatService.sendMessage(chatId, user.id, fileMessage, 'file')
        success = result !== null
      } else if (chat?.id) {
          const result = await ChatService.sendMessage(chat.id, user.id, fileMessage, 'file')
          success = result !== null
      }
      
      if (success) {
        setTimeout(async () => {
          const messagesData = chatId
            ? await ChatService.getChatMessagesByChatId(chatId)
            : await ChatService.getChatMessages(chat?.id || '')
          setMessages(messagesData)
        }, 500)
      } else {
        Alert.alert('Error', 'Failed to send file')
        }
      }
    } catch (error) {
      console.error('Error sending file:', error)
      Alert.alert('Error', 'Failed to send file')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      })
    }
  }

  const isMyMessage = (message: Message | undefined | null) => {
    return message?.sender_id === user?.id
  }

  const getOtherParticipantName = () => {
    // Use the fetched participant name
    return participantName
  }

  // Memoized message item component - must be defined before conditional returns
  // Note: With inverted FlatList, index is still the array index (0 = oldest, length-1 = newest)
  const MessageItem = memo(({ message, index }: { message: Message; index: number }) => {
    if (!message) return null
    
    // Show date if it's the newest message or date differs from next message in time
    const nextMessage = messages[index + 1]
    const showDate = index === messages.length - 1 || (nextMessage && formatDate(message.created_at) !== formatDate(nextMessage.created_at))
    
              const isMyMsg = isMyMessage(message)
    
    // Show avatar if it's the newest message (last chronologically) or if next message is from different sender
    const showAvatar = !isMyMsg && (index === messages.length - 1 || (nextMessage?.sender_id && nextMessage.sender_id !== message.sender_id))
              
              return (
      <View>
                  {showDate && (
                    <View style={styles.dateSeparator}>
                      <Text style={styles.dateSeparatorText}>{formatDate(message.created_at)}</Text>
                    </View>
                  )}
                  
                   <View style={[
                     styles.messageRow,
                     isMyMsg ? styles.myMessageRow : styles.otherMessageRow
                   ]}>
                    {showAvatar && (
                      <View style={styles.messageAvatar}>
                        <Text style={styles.messageAvatarText}>
                          {getOtherParticipantName().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    {isMyMsg ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onLongPress={() => {
                          if (!message?.id || !user?.id) return
                          Alert.alert(
                            'Delete message',
                            'Are you sure you want to delete this message?',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: async () => {
                                  try {
                                    const ok = await ChatService.deleteMessage(message.id, user.id)
                                    if (ok) {
                                      setMessages(prev => prev.filter(m => m.id !== message.id))
                                    } else {
                                      Alert.alert('Error', 'Failed to delete message. Please try again.')
                                    }
                                  } catch (error) {
                                    console.error('Error deleting message:', error)
                                    Alert.alert('Error', 'Failed to delete message. Please try again.')
                                  }
                                }
                              }
                            ]
                          )
                        }}
                        style={[styles.messageBubble, styles.myMessageBubble]}
                      >
                        {message.message_type === 'image' ? (
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedImageUri(message.message)
                              setImageModalVisible(true)
                            }}
                            activeOpacity={0.9}
                          >
                            <Image
                              source={{ uri: message.message }}
                              style={styles.messageImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        ) : (
                        <Text style={[styles.messageText, styles.myMessageText]}>
                          {message.message}
                        </Text>
                        )}
                        <View style={styles.messageFooter}>
                          <Text style={[styles.messageTime, styles.myMessageTime]}>
                            {formatTime(message.created_at)}
                          </Text>
                          <View style={styles.messageStatus}>
                            {message.status === 'sending' && (
              <SkeletonLoader width={16} height={16} borderRadius={8} animated={true} />
                            )}
                            {message.status === 'sent' && (
                              <Ionicons name="checkmark" size={16} color={Colors.neutral[400]} />
                            )}
                            {message.status === 'delivered' && (
                              <Ionicons name="checkmark-done" size={16} color={Colors.neutral[400]} />
                            )}
                            {message.status === 'read' && (
                              <Ionicons name="checkmark-done" size={16} color={Colors.primary[500]} />
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.messageBubble, styles.otherMessageBubble]}>
                        {message.message_type === 'image' ? (
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedImageUri(message.message)
                              setImageModalVisible(true)
                            }}
                            activeOpacity={0.9}
                          >
                            <Image
                              source={{ uri: message.message }}
                              style={styles.messageImage}
                              resizeMode="cover"
                            />
                          </TouchableOpacity>
                        ) : (
                        <Text style={[styles.messageText, styles.otherMessageText]}>
                          {message.message}
                        </Text>
                        )}
                        <View style={styles.messageFooter}>
                          <Text style={[styles.messageTime, styles.otherMessageTime]}>
                            {formatTime(message.created_at)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )
            })

  // Memoized callbacks - must be defined before conditional returns
  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => (
    <MessageItem message={item} index={index} />
  ), [participantName])

  const keyExtractor = useCallback((item: Message) => item.id, [])

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <SkeletonLoader width={60} height={60} borderRadius={30} style={{ marginBottom: 16 }} />
          <SkeletonLoader width={200} height={20} style={{ marginBottom: 8 }} />
          <SkeletonLoader width={150} height={16} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background.primary} />
      
      {/* Modern Header */}
      <View style={styles.modernHeader} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
            <TouchableOpacity onPress={() => router.push('/chats')} style={styles.headerBackButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.neutral[800]} />
            </TouchableOpacity>
        
        <View style={styles.headerUserInfo}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>
              {getOtherParticipantName().charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerName}>{getOtherParticipantName()}</Text>
            {!!(chat?.task?.title) && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {chat.task.title}
              </Text>
            )}
          </View>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerActionButton} onPress={() => setOptionsVisible(true)}>
            <Ionicons name="ellipsis-vertical" size={24} color={Colors.neutral[800]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Area */}
      <KeyboardAvoidingView 
        style={styles.messagesArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          inverted={false}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          style={styles.messagesScrollView}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
          getItemLayout={undefined}
          bounces={true}
          alwaysBounceVertical={true}
          onEndReachedThreshold={0.5}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Modern Input Area */}
        <View style={styles.inputArea}>
          <View style={styles.inputContainer}>
            <TouchableOpacity 
              style={styles.inputActionButton}
              onPress={handleFileUpload}
            >
              <Ionicons name="attach" size={24} color={Colors.primary[500]} />
            </TouchableOpacity>
            
            <View style={styles.messageInputContainer}>
              <TextInput
                style={styles.messageInput}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Message"
                placeholderTextColor={Colors.neutral[400]}
                multiline
                maxLength={1000}
                textAlignVertical="center"
              />
              
              {newMessage.length > 0 && (
                <TouchableOpacity style={styles.emojiButton}>
                  <Ionicons name="happy-outline" size={24} color={Colors.neutral[500]} />
                </TouchableOpacity>
              )}
            </View>
            
            {newMessage.trim() ? (
              <TouchableOpacity
                style={styles.sendButton}
                onPress={sendMessage}
                disabled={sending}
              >
                {sending ? (
                  <SkeletonLoader width={20} height={20} borderRadius={10} animated={true} />
                ) : (
                  <Ionicons name="send" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Image Viewer Modal for Chat Images */}
      <Modal
        visible={imageModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setImageModalVisible(false)
          setSelectedImageUri(null)
        }}
      >
        <View style={styles.modalContainer}>
          <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
          
          {/* Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity 
              onPress={() => {
                setImageModalVisible(false)
                setSelectedImageUri(null)
              }} 
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.placeholder} />
          </View>

          {/* Image */}
          {selectedImageUri && (
            <View style={styles.modalImageContainer}>
              <Image
                source={{ uri: selectedImageUri }}
                style={styles.modalImage}
                resizeMode="contain"
              />
            </View>
          )}
        </View>
      </Modal>
      
      {/* Options Bottom Sheet */}
      <Modal
        visible={optionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOptionsVisible(false)}
      >
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} activeOpacity={1} onPress={() => setOptionsVisible(false)}>
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 }}>
            <TouchableOpacity
              style={{ paddingVertical: 14 }}
              disabled={deleting}
              onPress={() => {
                if (!chat?.id) return
                Alert.alert('Delete chat', 'This will delete the entire conversation for you. Continue?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                      try {
                        setDeleting(true)
                        const ok = await ChatService.deleteChatAndMessages(chat.id, user?.id || '')
                        setDeleting(false)
                        setOptionsVisible(false)
                        if (ok) {
                          // Emit event to notify chats list that chat was deleted
                          DeviceEventEmitter.emit('chat:deleted', { chatId: chat.id })
                          router.push('/chats')
                        } else {
                          Alert.alert('Error', 'Failed to delete chat. Please try again.')
                        }
                      } catch (error) {
                        console.error('Error deleting chat:', error)
                        setDeleting(false)
                        setOptionsVisible(false)
                        Alert.alert('Error', 'Failed to delete chat. Please try again.')
                      }
                    }
                  }
                ])
              }}
            >
              <Text style={{ color: Colors.primary[600], fontWeight: '600', fontSize: 16 }}>Delete chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14 }} onPress={() => setOptionsVisible(false)}>
              <Text style={{ color: Colors.neutral[700], fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: Colors.neutral[600],
  },
  
  // Modern Header Styles
  modernHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingTop: Platform.OS === 'ios' ? 8 : 8,
    backgroundColor: Colors.background.primary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  headerBackButton: {
    padding: 8,
    marginRight: 8,
  },
  headerUserInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.neutral[200],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[800],
  },
  headerTextContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
  },
  headerStatus: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.neutral[500],
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerActionButton: {
    padding: 8,
    marginLeft: 8,
  },
  
  // Messages Area Styles
  messagesArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  messagesScrollView: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 8, // Small padding to prevent dragging from top safe area
    paddingBottom: 20,
  },
  
  // Empty State Styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateIcon: {
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 16,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 22,
  },
  
  // Date Separator Styles
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: Colors.neutral[500],
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  
  // Message Row Styles
  messageRow: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  
  // Message Avatar Styles
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  messageAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  
  // Message Bubble Styles - Modern Design
  messageBubble: {
    maxWidth: screenWidth * 0.75,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  myMessageBubble: {
    backgroundColor: Colors.primary[500],
    borderBottomRightRadius: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
  },
  otherMessageBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 0.5,
    borderColor: Colors.neutral[200],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  
  // Message Text Styles - Modern Typography
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  myMessageText: {
    color: '#ffffff',
    fontWeight: '400',
  },
  otherMessageText: {
    color: Colors.neutral[900],
    fontWeight: '400',
  },
  
  // Message Footer Styles
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    marginRight: 4,
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  otherMessageTime: {
    color: Colors.neutral[500],
  },
  messageStatus: {
    marginLeft: 4,
  },
  messageImage: {
    width: screenWidth * 0.65,
    height: 200,
    borderRadius: 12,
    marginBottom: 4,
  },
  
  // Input Area Styles - Modern Design
  inputArea: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.neutral[50],
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 52,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  inputActionButton: {
    padding: 8,
    marginRight: 4,
  },
  messageInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 6,
    minHeight: 42,
  },
  messageInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
    maxHeight: 100,
    textAlignVertical: 'center',
  },
  emojiButton: {
    padding: 4,
    marginLeft: 8,
  },
  sendButton: {
    backgroundColor: Colors.primary[500],
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: Colors.primary[500],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  uploadButton: {
    padding: 8,
  },
  // Modal Styles for Image Viewer
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 1,
  },
  closeButton: {
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
  },
  modalImageContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalImage: {
    width: '100%',
    height: '80%',
    borderRadius: 8,
  },
  placeholder: {
    width: 40,
  },
})
