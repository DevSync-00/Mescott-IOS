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
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import { ProfileService } from '../services/ProfileService'
import ImageUpload from '../components/ImageUpload'
import Colors from '../constants/Colors'
import SkeletonLoader from '../components/SkeletonLoader'


export default function EditProfile() {
  const { user, refreshUserProfile } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    phone: '',
    bio: '',
    location: '',
    avatarUrl: ''
  })

  useEffect(() => {
    if (user?.profile || user) {
      setFormData({
        fullName: user.profile?.full_name || (user as any).full_name || '',
        username: user.profile?.username || (user as any).username || '',
        phone: user.profile?.phone || (user as any).phone || '',
        bio: (user.profile as any)?.bio || '',
        location: (user.profile as any)?.location || '',
        avatarUrl: user.profile?.avatar_url || (user as any).avatar_url || ''
      })
    }
  }, [user])

  const handleSave = async () => {
    if (!user) return

    if (!formData.fullName.trim()) {
      Alert.alert('Error', 'Please enter your full name')
      return
    }

    setSaving(true)
    try {
      const updates = {
        full_name: formData.fullName,
        username: formData.username,
        phone: formData.phone,
        bio: formData.bio,
        location: formData.location,
        avatar_url: formData.avatarUrl,
      }

      await ProfileService.updateProfile(user.id, updates)
      
      // Refresh user profile in auth context so changes appear everywhere
      await refreshUserProfile()
      
      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => router.push('/profile') }
      ])
    } catch (error) {
      console.error('Error updating profile:', error)
      Alert.alert('Error', 'Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // Advanced list handlers removed in minimal flow

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.push('/profile')}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.neutral[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <SkeletonLoader width={20} height={20} borderRadius={10} />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
      >
        {/* Profile Photo */}
        <View style={styles.photoSection}>
          <Text style={styles.photoSectionTitle}>Profile Photo</Text>
          <ImageUpload
            onImageUploaded={(url: string) => {
              console.log('📸 Image uploaded callback received:', url)
              setFormData(prev => {
                const updated = { ...prev, avatarUrl: url }
                console.log('📸 Updated formData:', updated)
                return updated
              })
            }}
            onImageRemoved={() => {
              setFormData(prev => ({ ...prev, avatarUrl: '' }))
            }}
            currentImage={formData.avatarUrl && formData.avatarUrl.trim().length > 0 ? formData.avatarUrl : undefined}
            placeholder="Tap to add profile photo"
          />
        </View>

        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={formData.fullName}
              onChangeText={(text) => setFormData(prev => ({ ...prev, fullName: text }))}
              placeholder="Enter your full name"
              placeholderTextColor={Colors.neutral[400]}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={formData.username}
              onChangeText={(text) => setFormData(prev => ({ ...prev, username: text }))}
              placeholder="Enter your username"
              placeholderTextColor={Colors.neutral[400]}
            />
          </View>

          {/* Email removed for now - not part of minimal profile update */}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
              placeholder="Enter your phone number"
              placeholderTextColor={Colors.neutral[400]}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.bio}
              onChangeText={(text) => setFormData(prev => ({ ...prev, bio: text }))}
              placeholder="Tell us about yourself"
              placeholderTextColor={Colors.neutral[400]}
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={formData.location}
              onChangeText={(text) => setFormData(prev => ({ ...prev, location: text }))}
              placeholder="City, Area (optional)"
              placeholderTextColor={Colors.neutral[400]}
            />
          </View>
          {/* City/State/ZIP removed for minimal edit flow */}
        </View>
        {/* Advanced fields removed for initial launch */}
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
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.neutral[900],
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    color: Colors.primary[500],
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  photoSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingTop: 20,
    paddingBottom: 32,
    minHeight: 250,
    width: '100%',
  },
  photoSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  changePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.primary[50],
    gap: 6,
  },
  changePhotoText: {
    color: Colors.primary[500],
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.neutral[900],
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.background.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.neutral[900],
    borderWidth: 1,
    borderColor: Colors.border.primary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary[100],
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  skillText: {
    fontSize: 14,
    color: Colors.primary[600],
    fontWeight: '500',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: Colors.background.primary,
    borderWidth: 1,
    borderColor: Colors.primary[500],
    borderStyle: 'dashed',
    gap: 6,
  },
  addButtonText: {
    fontSize: 14,
    color: Colors.primary[500],
    fontWeight: '500',
  },
})
