import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { ImageService } from '../services/ImageService'
import Colors from '../constants/Colors'

interface ImageUploadProps {
  onImageUploaded: (url: string) => void
  onImageRemoved: () => void
  currentImage?: string
  placeholder?: string
}

export default function ImageUpload({
  onImageUploaded,
  onImageRemoved,
  currentImage,
  placeholder = "Tap to add image"
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [localImageUrl, setLocalImageUrl] = useState<string | undefined>(currentImage)
  
  // Update local image URL when currentImage prop changes
  useEffect(() => {
    setLocalImageUrl(currentImage)
  }, [currentImage])

  const handleImageSelection = async () => {
    try {
      setUploading(true)
      
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera roll permissions to upload images')
        return
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Square aspect ratio for profile photos
        quality: 0.8,
      })

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0]
        
        console.log('📸 Selected image URI:', asset.uri)
        
        // Upload to Supabase Storage
        const uploadResult = await ImageService.uploadImage(asset.uri, 'profile-images')
        
        console.log('📤 Upload result:', uploadResult)
        
        if (uploadResult.success && uploadResult.url) {
          console.log('✅ Image uploaded successfully, URL:', uploadResult.url)
          // Update local state immediately for instant feedback
          setLocalImageUrl(uploadResult.url)
          // Call callback to update parent state
          onImageUploaded(uploadResult.url)
        } else {
          console.error('❌ Upload failed:', uploadResult.error)
          Alert.alert('Upload Failed', uploadResult.error || 'Failed to upload image')
        }
      }
    } catch (error) {
      console.error('Error selecting image:', error)
      Alert.alert('Error', 'Failed to select image. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = () => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive', 
          onPress: () => {
            setLocalImageUrl(undefined)
            onImageRemoved()
          }
        }
      ]
    )
  }

  // Check if we have a valid image URL (use local state for immediate updates)
  const imageUrl = localImageUrl || currentImage
  const hasValidImage = imageUrl && imageUrl.trim().length > 0

  console.log('🖼️ ImageUpload render - hasValidImage:', hasValidImage, 'imageUrl:', imageUrl, 'localImageUrl:', localImageUrl, 'currentImage:', currentImage)

  // Always render the component - never hide it
  return (
    <View style={styles.container}>
      {hasValidImage ? (
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: imageUrl }} 
            style={styles.image}
            resizeMode="cover"
            onLoad={() => {
              console.log('✅ Image loaded successfully:', imageUrl)
            }}
            onError={(error) => {
              // If image fails to load, treat as no image
              console.error('❌ Image failed to load:', imageUrl, error)
              setLocalImageUrl(undefined)
            }}
          />
          <View style={styles.imageActions}>
            <TouchableOpacity style={styles.changeButton} onPress={handleImageSelection} disabled={uploading}>
              <Ionicons 
                name={uploading ? "hourglass" : "camera"} 
                size={20} 
                color={uploading ? Colors.neutral?.[400] || '#9ca3af' : '#ffffff'} 
              />
              <Text style={styles.changeButtonText}>
                {uploading ? 'Uploading...' : 'Change'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.removeButton} onPress={removeImage}>
              <Ionicons name="close-circle" size={24} color={Colors.error?.[500] || '#ef4444'} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity 
          style={[styles.uploadButton, uploading && styles.uploading]} 
          onPress={handleImageSelection}
          disabled={uploading}
        >
          <Ionicons 
            name={uploading ? "hourglass" : "camera"} 
            size={32} 
            color={uploading ? Colors.neutral?.[400] || '#9ca3af' : Colors.primary?.[500] || '#3b82f6'} 
          />
          <Text style={[styles.uploadText, uploading && styles.uploadingText]}>
            {uploading ? 'Uploading...' : placeholder}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    width: '100%',
    minHeight: 200,
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
    minHeight: 200,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
  },
  imageActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
  },
  changeButton: {
    backgroundColor: Colors.primary?.[500] || '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  removeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 2,
  },
  uploadButton: {
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9fafb',
    width: '100%',
    minHeight: 200,
  },
  uploading: {
    borderColor: '#9ca3af',
    backgroundColor: '#f3f4f6',
  },
  uploadText: {
    marginTop: 8,
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  uploadingText: {
    color: '#9ca3af',
  },
})