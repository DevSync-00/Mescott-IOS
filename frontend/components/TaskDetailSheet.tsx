import React, { useEffect, useState } from 'react'
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Colors from '../constants/Colors'
import { TaskService, Task } from '../services/TaskService'
import { TaskApplicationService } from '../services/TaskApplicationService'
import { PaymentService } from '../services/PaymentService'
import { useAuth } from '../contexts/SimpleAuthContext'
import { router } from 'expo-router'

const { width } = Dimensions.get('window')

interface TaskDetailSheetProps {
  taskId?: string | null
  visible: boolean
  onClose: () => void
}

export default function TaskDetailSheet({ taskId, visible, onClose }: TaskDetailSheetProps) {
  const { user } = useAuth()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [hasPendingPayment, setHasPendingPayment] = useState(false)
  const [imageModalVisible, setImageModalVisible] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  useEffect(() => {
    if (visible && taskId) {
      ;(async () => {
        try {
          setLoading(true)
          const t = await TaskService.getTaskById(taskId)
          setTask(t)
          
          // Check if user has applied (only for non-customers)
          if (user && t && user.id !== t.customer_id && (user.role === 'tasker' || user.role === 'both')) {
            const applied = await TaskApplicationService.hasUserAppliedToTask(user.user_id, taskId)
            setHasApplied(applied)
          } else {
            setHasApplied(false)
          }
          
          // Check if there's a pending payment (only for customers with completed tasks)
          if (user && t && user.id === t.customer_id && t.status === 'completed') {
            try {
              const payments = await PaymentService.getPendingPayments(user.user_id)
              const hasPayment = payments.some(p => p.task_id === taskId)
              setHasPendingPayment(hasPayment)
            } catch (e) {
              console.error('Error loading pending payments:', e)
              setHasPendingPayment(false)
            }
          } else {
            setHasPendingPayment(false)
          }
        } catch (e) {
          console.error('Error loading task:', e)
        } finally {
          setLoading(false)
        }
      })()
    }
  }, [visible, taskId, user])

  if (!visible) return null

  const handleEdit = () => {
    if (!task) return
    onClose()
    router.push({ pathname: '/post-task', params: { taskId: task.id, editMode: 'true' } })
  }

  const handleDelete = async () => {
    if (!task || !user) return
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await TaskService.deleteTask(task.id, user.id)
              onClose()
            } catch (error: any) {
              // Fallback cancel
              try {
                await TaskService.updateTask(task.id, user.id, { status: 'cancelled' } as any)
                onClose()
              } catch (e) {
                Alert.alert('Error', error?.message || 'Failed to delete or cancel task')
              }
            }
          }
        }
      ]
    )
  }

  const handleApply = () => {
    if (!task || !user) return
    
    if (hasApplied) {
      Alert.alert('Already Applied', 'You have already applied to this task.')
      return
    }
    
    onClose()
    router.push({ pathname: '/apply-task', params: { taskId: task.id } })
  }

  const handleViewApplications = () => {
    if (!task) return
    onClose()
    router.push({ pathname: '/task-applications', params: { taskId: task.id } })
  }

  const handlePayNow = () => {
    if (!task || !user) return
    onClose()
    router.push({ pathname: '/task-detail', params: { taskId: task.id } })
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.neutral[600]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Task Details</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 24 }}>
          {task?.photos && task.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {task.photos.map((uri, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.9}
                  onPress={() => { setSelectedImageIndex(idx); setImageModalVisible(true) }}
                >
                  <Image source={{ uri }} style={styles.image} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.section}>
            <View style={styles.titleRow}>
              <Text style={styles.title} numberOfLines={2}>{task?.title}</Text>
            </View>
            {typeof task?.budget === 'number' && (
              <Text style={styles.price}>{task?.budget} ETB</Text>
            )}
            <Text style={styles.meta}>{task?.category_name || 'Task'} • {task?.city || 'Location'}</Text>
            {!!task?.customer_name && (
              <View style={[styles.detailRow, { marginTop: 8 }]}>
                <Ionicons name="person-circle-outline" size={18} color={Colors.neutral[500]} />
                <Text style={styles.detailText}>Posted by {task.customer_name}</Text>
              </View>
            )}
          </View>

          {!!task?.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.description}>{task.description}</Text>
            </View>
          )}

          {/* Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task?.task_date ? new Date(task.task_date).toLocaleDateString() : 'N/A'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={16} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task?.task_time || 'N/A'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={Colors.neutral[500]} />
              <Text style={styles.detailText}>{task?.address || task?.city || 'N/A'}</Text>
            </View>
            {/* Size and urgency intentionally omitted */}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {task && user?.id === task.customer_id && (task.status === 'open' || task.status === 'draft') && (
            <View style={styles.actionsRow}>
              <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={handleEdit}>
                <Ionicons name="pencil" size={18} color="#fff" />
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={handleDelete}>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.actionText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}
          {task && (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                hasApplied && user?.id !== task.customer_id && styles.appliedButton
              ]}
              onPress={
                user?.id === task.customer_id 
                  ? (task.status === 'completed' ? handlePayNow : handleViewApplications)
                  : handleApply
              }
            >
              <Text style={[
                styles.primaryText,
                hasApplied && user?.id !== task.customer_id && styles.appliedButtonText
              ]}>
                {user?.id === task.customer_id 
                  ? (task.status === 'completed' ? 'Pay Now' : 'View Applications')
                  : (hasApplied ? 'Already Applied' : 'Apply')
                }
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Fullscreen Image Modal */}
        <Modal
          visible={imageModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setImageModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalTopBar}>
              <TouchableOpacity onPress={() => setImageModalVisible(false)} style={styles.modalClose}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: width * selectedImageIndex, y: 0 }}
              style={styles.fullscreenScroll}
            >
              {(task?.photos || []).map((uri, i) => (
                <View key={i} style={{ width, alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={{ uri }} style={styles.fullscreenImage} resizeMode="contain" />
                </View>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background.secondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.border.primary,
    backgroundColor: Colors.background.primary,
  },
  closeButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: Colors.neutral[800] },
  content: { flex: 1 },
  imagesRow: { paddingHorizontal: 16, paddingTop: 12 },
  image: { width: width * 0.7, height: 180, borderRadius: 12, marginRight: 12 },
  section: { backgroundColor: Colors.background.primary, marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.border.primary },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: Colors.neutral[900], marginRight: 8 },
  urgentBadge: { backgroundColor: Colors.error[500], paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  urgentText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  price: { fontSize: 22, fontWeight: '800', color: Colors.primary[600], marginBottom: 4 },
  meta: { fontSize: 12, color: Colors.neutral[600] },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: Colors.neutral[900], marginBottom: 8 },
  description: { fontSize: 14, color: Colors.neutral[700], lineHeight: 20 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  detailText: { fontSize: 14, color: Colors.neutral[700] },
  footer: { backgroundColor: Colors.background.primary, padding: 12, borderTopWidth: 1, borderTopColor: Colors.border.primary },
  actionsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  editButton: { backgroundColor: Colors.primary[500] },
  deleteButton: { backgroundColor: Colors.error[500] },
  actionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  primaryButton: { backgroundColor: Colors.primary[600], paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  appliedButton: { backgroundColor: Colors.neutral[300] },
  appliedButtonText: { color: Colors.neutral[600] },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  modalTopBar: { position: 'absolute', top: 40, left: 0, right: 0, zIndex: 2, alignItems: 'flex-end', paddingHorizontal: 16 },
  modalClose: { padding: 8 },
  fullscreenScroll: { flexGrow: 0 },
  fullscreenImage: { width: width, height: '80%' },
})


