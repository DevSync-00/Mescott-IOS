import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { TaskApplicationService } from '../services/TaskApplicationService'
import Colors from '../constants/Colors'

export default function ApplyTask() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const { taskId, taskTitle, customerName, budget } = useLocalSearchParams()
  const [proposedPrice, setProposedPrice] = useState('')
  const [estimatedTime, setEstimatedTime] = useState('')
  const [coverLetter, setCoverLetter] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/auth')
    }
  }, [isAuthenticated, isLoading])

  // Show loading while auth is being determined
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const handleSubmitApplication = async () => {
    if (!user || !taskId) {
      Alert.alert('Error', 'Missing required information')
      return
    }

    // Validation
    if (!proposedPrice.trim()) {
      Alert.alert('Error', 'Please enter your proposed price')
      return
    }
    if (!estimatedTime.trim()) {
      Alert.alert('Error', 'Please enter estimated time')
      return
    }
    if (!coverLetter.trim()) {
      Alert.alert('Error', 'Please write a cover letter')
      return
    }

    const price = parseFloat(proposedPrice)
    if (isNaN(price) || price <= 0) {
      Alert.alert('Error', 'Please enter a valid price')
      return
    }

    const time = parseInt(estimatedTime)
    if (isNaN(time) || time <= 0) {
      Alert.alert('Error', 'Please enter a valid estimated time')
      return
    }

    setLoading(true)
    try {
      const applicationData = {
        task_id: taskId as string,
        tasker_id: user.id, // This is the profile ID
        user_id: user.user_id, // This is the auth.users.id
        proposed_price: price,
        estimated_time: time,
        message: coverLetter.trim(),
        status: 'pending' as const
      }

      await TaskApplicationService.createApplication(applicationData)
      
      Alert.alert(
        'Application Submitted!', 
        'Your application has been sent to the customer. You will be notified when they respond.',
        [
          {
            text: 'OK',
            onPress: () => router.push('/jobs')
          }
        ]
      )
    } catch (error) {
      console.error('Error submitting application:', error)
      Alert.alert('Error', 'Failed to submit application. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.content}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => router.push({
                  pathname: '/task-detail',
                  params: { taskId: taskId as string }
                })}
              >
                <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
              </TouchableOpacity>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>Apply for Task</Text>
                <Text style={styles.headerSubtitle}>{taskTitle}</Text>
              </View>
              <View style={styles.placeholder} />
            </View>

            <ScrollView 
              style={styles.form} 
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.scrollContent}
              bounces={true}
              alwaysBounceVertical={true}
              scrollEventThrottle={16}
            >
              {/* Task Info */}
              <View style={styles.taskInfo}>
                <Text style={styles.taskTitle}>{taskTitle}</Text>
                <Text style={styles.customerName}>Posted by {customerName}</Text>
                <Text style={styles.budget}>Budget: {budget} ETB</Text>
              </View>

              {/* Proposed Price */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Your Proposed Price *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="cash-outline" size={20} color={Colors.neutral[400]} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your price"
                    placeholderTextColor={Colors.neutral[400]}
                    value={proposedPrice}
                    onChangeText={setProposedPrice}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>Make sure your price is competitive</Text>
              </View>

              {/* Estimated Time */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Estimated Time (hours) *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="time-outline" size={20} color={Colors.neutral[400]} />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 2, 4, 8"
                    placeholderTextColor={Colors.neutral[400]}
                    value={estimatedTime}
                    onChangeText={setEstimatedTime}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.helperText}>How long do you think this will take?</Text>
              </View>



              {/* Cover Letter */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Cover Letter *</Text>
                <Text style={styles.helperText}>
                  Tell the customer why you&apos;re the right person for this task
                </Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="document-text-outline" size={20} color={Colors.neutral[400]} />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Write your cover letter here..."
                    placeholderTextColor={Colors.neutral[400]}
                    value={coverLetter}
                    onChangeText={setCoverLetter}
                    multiline
                    numberOfLines={6}
                    maxLength={500}
                  />
                </View>
                <Text style={styles.characterCount}>{coverLetter.length}/500</Text>
              </View>

              {/* Guidelines */}
              <View style={styles.guidelines}>
                <Text style={styles.guidelinesTitle}>Application Guidelines</Text>
                <Text style={styles.guidelinesText}>
                  • Be professional and honest{'\n'}
                  • Explain your relevant experience{'\n'}
                  • Mention any special skills or tools{'\n'}
                  • Ask questions if you need clarification
                </Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmitApplication}
                disabled={loading}
              >
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>
                  {loading ? 'Submitting...' : 'Submit Application'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  placeholder: {
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
  },
  form: {
    flex: 1,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  taskInfo: {
    backgroundColor: Colors.background.primary,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 4,
  },
  customerName: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginBottom: 4,
  },
  budget: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary[600],
  },
  inputGroup: {
    marginTop: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: Colors.neutral[500],
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Colors.neutral[900],
    marginLeft: 12,
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: Colors.neutral[500],
    textAlign: 'right',
    marginTop: 4,
  },
  guidelines: {
    backgroundColor: Colors.primary[50],
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: Colors.primary[200],
  },
  guidelinesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary[700],
    marginBottom: 8,
  },
  guidelinesText: {
    fontSize: 12,
    color: Colors.primary[600],
    lineHeight: 18,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary[500],
    paddingVertical: 16,
    borderRadius: 12,
    marginVertical: 32,
    marginBottom: 40,
    gap: 8,
    shadowColor: Colors.primary[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.neutral[300],
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.neutral[600],
    marginTop: 10,
  },
})
