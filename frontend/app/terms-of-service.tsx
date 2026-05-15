import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import Colors from '../constants/Colors'

export default function TermsOfService() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        bounces={true}
        alwaysBounceVertical={true}
        scrollEventThrottle={16}
      >
        <View style={styles.contentContainer}>
          <Text style={styles.lastUpdated}>Last updated: October 2025</Text>
          
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.sectionText}>
            By accessing and using Mescott, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
          </Text>

          <Text style={styles.sectionTitle}>2. Description of Service</Text>
          <Text style={styles.sectionText}>
            Mescott is a platform that connects customers with taskers for various services. We provide a marketplace where users can post tasks and find qualified individuals to complete them.
          </Text>

          <Text style={styles.sectionTitle}>3. User Responsibilities</Text>
          <Text style={styles.sectionText}>
            • You must be at least 18 years old to use this service{'\n'}
            • You are responsible for maintaining the confidentiality of your account{'\n'}
            • You agree to provide accurate and complete information{'\n'}
            • You will not use the service for any illegal or unauthorized purpose{'\n'}
            • You will not interfere with or disrupt the service or servers
          </Text>

          <Text style={styles.sectionTitle}>4. Tasker Responsibilities</Text>
          <Text style={styles.sectionText}>
            • Taskers must provide accurate information about their skills and experience{'\n'}
            • Taskers are responsible for completing tasks to the best of their ability{'\n'}
            • Taskers must maintain professional conduct and communication{'\n'}
            • Taskers are responsible for their own taxes and business registration
          </Text>

          <Text style={styles.sectionTitle}>5. Customer Responsibilities</Text>
          <Text style={styles.sectionText}>
            • Customers must provide clear and accurate task descriptions{'\n'}
            • Customers must pay for completed tasks as agreed{'\n'}
            • Customers must treat taskers with respect and professionalism{'\n'}
            • Customers are responsible for providing necessary materials and access
          </Text>

          <Text style={styles.sectionTitle}>6. Payment Terms</Text>
          <Text style={styles.sectionText}>
            • All payments are processed securely through our platform{'\n'}
            • Payment is required upon task completion{'\n'}
            • Refunds are subject to our refund policy{'\n'}
            • We may charge service fees as disclosed in our pricing
          </Text>

          <Text style={styles.sectionTitle}>7. Prohibited Activities</Text>
          <Text style={styles.sectionText}>
            You may not use our service to:{'\n'}
            • Post illegal, harmful, or inappropriate content{'\n'}
            • Harass, abuse, or harm other users{'\n'}
            • Violate any applicable laws or regulations{'\n'}
            • Attempt to gain unauthorized access to our systems{'\n'}
            • Use automated systems to access the service
          </Text>

          <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
          <Text style={styles.sectionText}>
            The service and its original content, features, and functionality are and will remain the exclusive property of Mescott and its licensors. The service is protected by copyright, trademark, and other laws.
          </Text>

          <Text style={styles.sectionTitle}>9. Limitation of Liability</Text>
          <Text style={styles.sectionText}>
            In no event shall Mescott, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses.
          </Text>

          <Text style={styles.sectionTitle}>10. Termination</Text>
          <Text style={styles.sectionText}>
            We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
          </Text>

          <Text style={styles.sectionTitle}>11. Changes to Terms</Text>
          <Text style={styles.sectionText}>
            We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
          </Text>

          <Text style={styles.sectionTitle}>12. Contact Information</Text>
          <Text style={styles.sectionText}>
            If you have any questions about these Terms of Service, please contact us at:{'\n'}
            Email: support@mescott.com{'\n'}
            Phone: +251-911-234-567{'\n'}
            Website: https://mescott.com{'\n'}
            Address: Addis Ababa, Ethiopia
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.secondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.background.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.neutral[900],
  },
  headerRight: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  contentContainer: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontStyle: 'italic',
    marginBottom: 24,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginTop: 24,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    color: Colors.neutral[700],
    lineHeight: 22,
    marginBottom: 8,
  },
})
