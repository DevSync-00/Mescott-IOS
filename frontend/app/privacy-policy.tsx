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

export default function PrivacyPolicy() {
  const router = useRouter()

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
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
          
          <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          <Text style={styles.sectionText}>
            We collect information you provide directly to us, such as when you create an account, post a task, or communicate with us. This may include:{'\n'}
            • Personal information (name, email, phone number){'\n'}
            • Profile information and photos{'\n'}
            • Task descriptions and requirements{'\n'}
            • Payment information{'\n'}
            • Communication records
          </Text>

          <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.sectionText}>
            We use the information we collect to:{'\n'}
            • Provide, maintain, and improve our services{'\n'}
            • Process transactions and send related information{'\n'}
            • Send technical notices and support messages{'\n'}
            • Communicate with you about products, services, and promotions{'\n'}
            • Monitor and analyze trends and usage{'\n'}
            • Personalize and improve your experience
          </Text>

          <Text style={styles.sectionTitle}>3. Information Sharing</Text>
          <Text style={styles.sectionText}>
            We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except:{'\n'}
            • To facilitate task completion between customers and taskers{'\n'}
            • With service providers who assist us in operating our platform{'\n'}
            • When required by law or to protect our rights{'\n'}
            • In connection with a business transfer or acquisition
          </Text>

          <Text style={styles.sectionTitle}>4. Data Security</Text>
          <Text style={styles.sectionText}>
            We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.
          </Text>

          <Text style={styles.sectionTitle}>5. Location Information</Text>
          <Text style={styles.sectionText}>
            We may collect and use location information to:{'\n'}
            • Help you find nearby taskers or tasks{'\n'}
            • Improve our matching algorithms{'\n'}
            • Provide location-based services{'\n'}
            • Ensure safety and security
          </Text>

          <Text style={styles.sectionTitle}>6. Cookies and Tracking</Text>
          <Text style={styles.sectionText}>
            We use cookies and similar tracking technologies to:{'\n'}
            • Remember your preferences and settings{'\n'}
            • Analyze how you use our service{'\n'}
            • Provide personalized content{'\n'}
            • Improve our service performance
          </Text>

          <Text style={styles.sectionTitle}>7. Data Retention</Text>
          <Text style={styles.sectionText}>
            We retain your personal information for as long as necessary to provide our services and fulfill the purposes outlined in this privacy policy, unless a longer retention period is required by law.
          </Text>

          <Text style={styles.sectionTitle}>8. Your Rights</Text>
          <Text style={styles.sectionText}>
            You have the right to:{'\n'}
            • Access your personal information{'\n'}
            • Correct inaccurate or incomplete data{'\n'}
            • Delete your personal information{'\n'}
            • Object to processing of your data{'\n'}
            • Data portability{'\n'}
            • Withdraw consent at any time
          </Text>

          <Text style={styles.sectionTitle}>9. Children's Privacy</Text>
          <Text style={styles.sectionText}>
            Our service is not intended for children under 18 years of age. We do not knowingly collect personal information from children under 18. If we become aware that we have collected personal information from a child under 18, we will take steps to delete such information.
          </Text>

          <Text style={styles.sectionTitle}>10. Third-Party Services</Text>
          <Text style={styles.sectionText}>
            Our service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to read their privacy policies before providing any personal information.
          </Text>

          <Text style={styles.sectionTitle}>11. International Transfers</Text>
          <Text style={styles.sectionText}>
            Your information may be transferred to and processed in countries other than your country of residence. We ensure that such transfers are subject to appropriate safeguards and comply with applicable data protection laws.
          </Text>

          <Text style={styles.sectionTitle}>12. Changes to This Policy</Text>
          <Text style={styles.sectionText}>
            We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Last updated" date. We encourage you to review this privacy policy periodically.
          </Text>

          <Text style={styles.sectionTitle}>13. Contact Us</Text>
          <Text style={styles.sectionText}>
            If you have any questions about this privacy policy or our data practices, please contact us at:{'\n'}
            Email: privacy@mescott.com{'\n'}
            Phone: +251-911-234-567{'\n'}
            Address: Addis Ababa, Ethiopia{'\n'}
            Website: https://mescott.com
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
