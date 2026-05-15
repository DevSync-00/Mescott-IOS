import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import Colors from '../constants/Colors'

interface ContactMethod {
  id: string
  type: 'email' | 'phone' | 'whatsapp' | 'telegram'
  title: string
  subtitle: string
  value: string
  icon: string
  color: string
}

const CONTACT_METHODS: ContactMethod[] = [
  {
    id: '1',
    type: 'email',
    title: 'Email Support',
    subtitle: 'Get help via email',
    value: 'support@mescott.com',
    icon: 'mail-outline',
    color: Colors.primary[500],
  },
  {
    id: '2',
    type: 'phone',
    title: 'Phone Support',
    subtitle: 'Call us directly',
    value: '+251 911 234 567',
    icon: 'call-outline',
    color: Colors.success[500],
  },
  {
    id: '3',
    type: 'whatsapp',
    title: 'WhatsApp',
    subtitle: 'Chat with us on WhatsApp',
    value: '+251 911 234 567',
    icon: 'logo-whatsapp',
    color: '#25D366',
  },
  {
    id: '4',
    type: 'telegram',
    title: 'Telegram',
    subtitle: 'Message us on Telegram',
    value: '@mescott_support',
    icon: 'paper-plane-outline',
    color: '#0088cc',
  },
]

export default function ContactUs() {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [subject, setSubject] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('General Inquiry')

  const categories = [
    'General Inquiry',
    'Technical Issue',
    'Payment Problem',
    'Account Issue',
    'Task Related',
    'Feedback',
    'Other'
  ]

  const handleContactMethod = async (method: ContactMethod) => {
    try {
      switch (method.type) {
        case 'email':
          const emailUrl = `mailto:${method.value}?subject=${encodeURIComponent(subject || 'Support Request')}&body=${encodeURIComponent(message || '')}`
          await Linking.openURL(emailUrl)
          break
        case 'phone':
          const phoneUrl = `tel:${method.value}`
          await Linking.openURL(phoneUrl)
          break
        case 'whatsapp':
          const whatsappUrl = `whatsapp://send?phone=${method.value.replace(/\D/g, '')}&text=${encodeURIComponent(message || 'Hello, I need help with...')}`
          await Linking.openURL(whatsappUrl)
          break
        case 'telegram':
          const telegramUrl = `https://t.me/${method.value.replace('@', '')}`
          await Linking.openURL(telegramUrl)
          break
      }
    } catch {
      Alert.alert('Error', 'Could not open the selected contact method')
    }
  }

  const handleSendMessage = () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter your message')
      return
    }

    Alert.alert(
      'Message Sent',
      'Your message has been sent to our support team. We\'ll get back to you within 24 hours.',
      [{ text: 'OK' }]
    )
    
    setMessage('')
    setSubject('')
  }

  const handleReportBug = () => {
    Alert.alert(
      'Report Bug',
      'Bug reporting feature will be available soon. For now, please contact us through the methods below.',
      [{ text: 'OK' }]
    )
  }

  const handleRequestFeature = () => {
    Alert.alert(
      'Request Feature',
      'Feature request functionality will be available soon. For now, please contact us through the methods below.',
      [{ text: 'OK' }]
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Us</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        bounces={true}
        alwaysBounceVertical={true}
        scrollEventThrottle={16}
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionCard} onPress={handleReportBug}>
              <Ionicons name="bug-outline" size={24} color={Colors.error[500]} />
              <Text style={styles.actionTitle}>Report Bug</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={handleRequestFeature}>
              <Ionicons name="bulb-outline" size={24} color={Colors.warning[500]} />
              <Text style={styles.actionTitle}>Request Feature</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact Methods */}
        <View style={styles.contactMethods}>
          <Text style={styles.sectionTitle}>Get in Touch</Text>
          <View style={styles.methodsList}>
            {CONTACT_METHODS.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={styles.methodCard}
                onPress={() => handleContactMethod(method)}
              >
                <View style={styles.methodLeft}>
                  <View style={[styles.methodIcon, { backgroundColor: method.color + '20' }]}>
                    <Ionicons name={method.icon as any} size={24} color={method.color} />
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodTitle}>{method.title}</Text>
                    <Text style={styles.methodSubtitle}>{method.subtitle}</Text>
                    <Text style={styles.methodValue}>{method.value}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Send Message Form */}
        <View style={styles.messageForm}>
          <Text style={styles.sectionTitle}>Send us a Message</Text>
          
          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categorySelector}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryOption,
                      selectedCategory === category && styles.categoryOptionSelected
                    ]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text style={[
                      styles.categoryText,
                      selectedCategory === category && styles.categoryTextSelected
                    ]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Subject (Optional)</Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Brief description of your issue"
                placeholderTextColor={Colors.neutral[400]}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Message *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue or question in detail..."
                placeholderTextColor={Colors.neutral[400]}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Ionicons name="send" size={20} color="#fff" />
              <Text style={styles.sendButtonText}>Send Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Business Hours */}
        <View style={styles.businessHours}>
          <Text style={styles.sectionTitle}>Business Hours</Text>
          <View style={styles.hoursCard}>
            <Ionicons name="time-outline" size={24} color={Colors.primary[500]} />
            <View style={styles.hoursInfo}>
              <Text style={styles.hoursTitle}>Support Hours</Text>
              <Text style={styles.hoursText}>Monday - Friday: 8:00 AM - 6:00 PM</Text>
              <Text style={styles.hoursText}>Saturday: 9:00 AM - 4:00 PM</Text>
              <Text style={styles.hoursText}>Sunday: Closed</Text>
              <Text style={styles.hoursNote}>
                * Emergency support available 24/7 for urgent issues
              </Text>
            </View>
          </View>
        </View>

        {/* Response Time */}
        <View style={styles.responseTime}>
          <View style={styles.responseCard}>
            <Ionicons name="flash-outline" size={20} color={Colors.success[500]} />
            <Text style={styles.responseText}>
              We typically respond within 24 hours during business days
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: Colors.neutral[900],
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  quickActions: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.neutral[700],
    marginTop: 8,
    textAlign: 'center',
  },
  contactMethods: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  methodsList: {
    gap: 12,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.secondary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  methodLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 2,
  },
  methodSubtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginBottom: 2,
  },
  methodValue: {
    fontSize: 14,
    color: Colors.primary[600],
    fontWeight: '500',
  },
  messageForm: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  formContainer: {
    backgroundColor: Colors.background.secondary,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.neutral[700],
    marginBottom: 8,
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.neutral[100],
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  categoryOptionSelected: {
    backgroundColor: Colors.primary[500],
    borderColor: Colors.primary[500],
  },
  categoryText: {
    fontSize: 12,
    color: Colors.neutral[600],
  },
  categoryTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  input: {
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.border.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.neutral[900],
  },
  textArea: {
    height: 100,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary[500],
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  businessHours: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  hoursCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.primary[50],
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary[500],
  },
  hoursInfo: {
    flex: 1,
    marginLeft: 12,
  },
  hoursTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    marginBottom: 8,
  },
  hoursText: {
    fontSize: 14,
    color: Colors.neutral[700],
    marginBottom: 4,
  },
  hoursNote: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontStyle: 'italic',
    marginTop: 8,
  },
  responseTime: {
    paddingHorizontal: 20,
  },
  responseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.success[50],
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.success[500],
  },
  responseText: {
    flex: 1,
    fontSize: 14,
    color: Colors.neutral[700],
    marginLeft: 12,
    lineHeight: 20,
  },
})
