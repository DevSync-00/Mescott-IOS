import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import Colors from '../constants/Colors'
import { SettingsService } from '../services/SettingsService'

export default function PrivacySecurity() {
  const { user } = useAuth()
  const router = useRouter()
  const [settings, setSettings] = useState({
    showLocation: true,
    showPhoneNumber: false,
    showEmail: false,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const currentSettings = await SettingsService.getSettings()
      if (currentSettings) {
        setSettings({
          showLocation: currentSettings.privacy?.showLocation ?? true,
          showPhoneNumber: currentSettings.privacy?.showPhoneNumber ?? false,
          showEmail: currentSettings.privacy?.showEmail ?? false,
        })
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async (key: string, value: boolean) => {
    try {
      const success = await SettingsService.updatePrivacySettings({ [key]: value })
      if (success) {
        setSettings(prev => ({ ...prev, [key]: value }))
      } else {
        Alert.alert('Error', 'Failed to update setting')
      }
    } catch (error) {
      console.error('Error updating setting:', error)
      Alert.alert('Error', 'Failed to update setting')
    }
  }

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'Password change functionality will be implemented with email verification.',
      [{ text: 'OK' }]
    )
  }

  const handleTwoFactorAuth = () => {
    Alert.alert(
      'Two-Factor Authentication',
      'Two-factor authentication setup will be available soon.',
      [{ text: 'OK' }]
    )
  }

  const handleDataExport = () => {
    Alert.alert(
      'Export Data',
      'Your data export request has been submitted. You will receive an email with your data within 24 hours.',
      [{ text: 'OK' }]
    )
  }

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Account Deletion',
              'To delete your account, please contact our support team at support@mescott.com',
              [{ text: 'OK' }]
            )
          }
        }
      ]
    )
  }

  interface SettingItem {
    icon: string
    title: string
    subtitle: string
    key?: string
    value?: boolean
    onPress?: () => void
    showArrow?: boolean
    color?: string
    switch?: boolean
  }

  interface PrivacySection {
    title: string
    items: SettingItem[]
  }

  const privacySettings: PrivacySection[] = [
    // Temporarily hidden for v1.0 - Profile Visibility toggles (not functional)
    // {
    //   title: 'Profile Visibility',
    //   items: [
    //     {
    //       icon: 'location-outline',
    //       title: 'Show Location',
    //       subtitle: 'Allow others to see your general location',
    //       key: 'showLocation',
    //       value: settings.showLocation,
    //       switch: true,
    //     },
    //     {
    //       icon: 'call-outline',
    //       title: 'Show Phone Number',
    //       subtitle: 'Display your phone number to other users',
    //       key: 'showPhoneNumber',
    //       value: settings.showPhoneNumber,
    //       switch: true,
    //     },
    //     {
    //       icon: 'mail-outline',
    //       title: 'Show Email',
    //       subtitle: 'Display your email address to other users',
    //       key: 'showEmail',
    //       value: settings.showEmail,
    //       switch: true,
    //     },
    //   ]
    // },
    // Temporarily hidden for v1.0 - Communication toggles (not functional)
    // {
    //   title: 'Communication',
    //   items: [
    //     {
    //       icon: 'chatbubble-outline',
    //       title: 'Allow Messages',
    //       subtitle: 'Let other users send you messages',
    //       key: 'allowMessages',
    //       value: settings.allowMessages,
    //       switch: true,
    //     },
    //     {
    //       icon: 'call-outline',
    //       title: 'Allow Calls',
    //       subtitle: 'Let other users call you directly',
    //       key: 'allowCalls',
    //       value: settings.allowCalls,
    //       switch: true,
    //     },
    //   ]
    // },
    // Temporarily hidden for v1.0 - Data & Analytics toggles (not functional)
    // {
    //   title: 'Data & Analytics',
    //   items: [
    //     {
    //       icon: 'share-outline',
    //       title: 'Data Sharing',
    //       subtitle: 'Share anonymous data to improve our services',
    //       key: 'dataSharing',
    //       value: settings.dataSharing,
    //       switch: true,
    //     },
    //     {
    //       icon: 'analytics-outline',
    //       title: 'Analytics',
    //       subtitle: 'Help us improve the app with usage analytics',
    //       key: 'analytics',
    //       value: settings.analytics,
    //       switch: true,
    //     },
    //   ]
    // },
    // Temporarily hidden for v1.0 - Account Security (not functional)
    // {
    //   title: 'Account Security',
    //   items: [
    //     {
    //       icon: 'key-outline',
    //       title: 'Change Password',
    //       subtitle: 'Update your account password',
    //       onPress: handleChangePassword,
    //       showArrow: true,
    //     },
    //     {
    //       icon: 'shield-checkmark-outline',
    //       title: 'Two-Factor Authentication',
    //       subtitle: 'Add an extra layer of security',
    //       onPress: handleTwoFactorAuth,
    //       showArrow: true,
    //     },
    //   ]
    // },
    // Temporarily hidden for v1.0 - Data Management (not functional)
    // {
    //   title: 'Data Management',
    //   items: [
    //     {
    //       icon: 'download-outline',
    //       title: 'Export Data',
    //       subtitle: 'Download a copy of your data',
    //       onPress: handleDataExport,
    //       showArrow: true,
    //     },
    //     {
    //       icon: 'trash-outline',
    //       title: 'Delete Account',
    //       subtitle: 'Permanently delete your account',
    //       onPress: handleDeleteAccount,
    //       showArrow: true,
    //       color: Colors.error[500],
    //     },
    //   ]
    // }
  ]

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading privacy settings...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.scrollContent}
        bounces={true}
        alwaysBounceVertical={true}
        overScrollMode="always"
        scrollEventThrottle={16}
      >
        {privacySettings
          .filter(section => section.items.length > 0) // Hide empty sections
          .length > 0 ? (
          privacySettings
            .filter(section => section.items.length > 0)
            .map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionContent}>
              {section.items.map((item, itemIndex) => (
                <TouchableOpacity
                  key={itemIndex}
                  style={[
                    styles.settingItem,
                    itemIndex === section.items.length - 1 && styles.lastItem
                  ]}
                  onPress={item.onPress}
                >
                  <View style={styles.settingLeft}>
                    <View style={styles.iconContainer}>
                      <Ionicons 
                        name={item.icon as any} 
                        size={20} 
                        color={item.color || Colors.neutral[600]} 
                      />
                    </View>
                    <View style={styles.settingText}>
                      <Text style={[styles.settingTitle, item.color && { color: item.color }]}>
                        {item.title}
                      </Text>
                      <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.settingRight}>
                    {item.switch !== undefined && item.switch ? (
                      <Switch
                        value={item.value ?? false}
                        onValueChange={(value) => {
                          if (item.key) {
                            updateSetting(item.key, value)
                          }
                        }}
                        trackColor={{ false: Colors.neutral[300], true: Colors.primary[200] }}
                        thumbColor={item.value ? Colors.primary[500] : Colors.neutral[400]}
                      />
                    ) : item.showArrow ? (
                      <Ionicons name="chevron-forward" size={20} color={Colors.neutral[400]} />
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={64} color={Colors.neutral[300]} />
            <Text style={styles.emptyTitle}>Privacy & Security Settings</Text>
            <Text style={styles.emptySubtitle}>
              Privacy and security features will be available in a future update.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.neutral[600],
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
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  sectionContent: {
    backgroundColor: Colors.background.secondary,
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.primary,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  settingLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.neutral[900],
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
  },
  settingRight: {
    marginLeft: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginTop: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 24,
  },
})
