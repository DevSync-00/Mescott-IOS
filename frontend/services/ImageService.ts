import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { supabase } from '../lib/supabase'

export interface ImageUploadResult {
  url: string
  filename: string
  size: number
  type: string
}

export class ImageService {
  // Request camera permissions
  static async requestCameraPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      return status === 'granted'
    } catch (error) {
      console.error('Error requesting camera permissions:', error)
      return false
    }
  }

  // Request media library permissions
  static async requestMediaLibraryPermissions(): Promise<boolean> {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      return status === 'granted'
    } catch (error) {
      console.error('Error requesting media library permissions:', error)
      return false
    }
  }

  // Take photo with camera
  static async takePhoto(options?: {
    allowsEditing?: boolean
    aspect?: [number, number]
    quality?: number
  }): Promise<string | null> {
    try {
      const hasPermission = await this.requestCameraPermissions()
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please grant camera permissions to take photos.')
        return null
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options?.allowsEditing ?? true,
        aspect: options?.aspect ?? [4, 3],
        quality: options?.quality ?? 0.8,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets[0].uri
      }
      return null
    } catch (error) {
      console.error('Error taking photo:', error)
      Alert.alert('Error', 'Failed to take photo. Please try again.')
      return null
    }
  }

  // Pick image from library
  static async pickImage(options?: {
    allowsEditing?: boolean
    aspect?: [number, number]
    quality?: number
    allowsMultipleSelection?: boolean
    selectionLimit?: number
  }): Promise<string[] | null> {
    try {
      const hasPermission = await this.requestMediaLibraryPermissions()
      if (!hasPermission) {
        Alert.alert('Permission Required', 'Please grant photo library permissions to select images.')
        return null
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: options?.allowsMultipleSelection ? false : (options?.allowsEditing ?? true),
        aspect: options?.aspect ?? [4, 3],
        quality: options?.quality ?? 0.8,
        allowsMultipleSelection: options?.allowsMultipleSelection ?? false,
        selectionLimit: options?.selectionLimit ?? 1,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        return result.assets.map(asset => asset.uri)
      }
      return null
    } catch (error) {
      console.error('Error picking image:', error)
      Alert.alert('Error', 'Failed to pick image. Please try again.')
      return null
    }
  }

  // Show image picker with options (camera or library)
  static async showImagePicker(
    title: string = 'Select Image',
    options?: {
      allowsEditing?: boolean
      aspect?: [number, number]
      quality?: number
      allowsMultipleSelection?: boolean
      selectionLimit?: number
    }
  ): Promise<string[] | null> {
    return new Promise((resolve) => {
      Alert.alert(
        title,
        'Choose an option',
        [
          {
            text: 'Camera',
            onPress: async () => {
              const uri = await this.takePhoto(options)
              resolve(uri ? [uri] : null)
            }
          },
          {
            text: 'Photo Library',
            onPress: async () => {
              const uris = await this.pickImage(options)
              resolve(uris)
            }
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => resolve(null)
          }
        ]
      )
    })
  }

  // Simple image picker (just library)
  static async pickImageFromLibrary(options?: {
    allowsEditing?: boolean
    aspect?: [number, number]
    quality?: number
  }): Promise<string | null> {
    const uris = await this.pickImage({
      ...options,
      allowsMultipleSelection: false,
      selectionLimit: 1
    })
    return uris && uris.length > 0 ? uris[0] : null
  }

  // Simple camera picker
  static async pickImageFromCamera(options?: {
    allowsEditing?: boolean
    aspect?: [number, number]
    quality?: number
  }): Promise<string | null> {
    return await this.takePhoto(options)
  }

  // Upload image to Supabase Storage with retry logic
  static async uploadImage(fileUri: string, folder: string = 'images', maxRetries: number = 3): Promise<{ success: boolean; url?: string; error?: string }> {
    let lastError: any = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Upload attempt ${attempt}/${maxRetries} for ${fileUri}`)
        
        // Create a unique filename
        const timestamp = Date.now()
        const randomId = Math.random().toString(36).substring(2, 15)
        const fileExtension = fileUri.split('.').pop() || 'jpg'
        const fileName = `${timestamp}_${randomId}.${fileExtension}`
        const filePath = `${folder}/${fileName}`

        // Use FormData for React Native compatibility
        const formData = new FormData()
        formData.append('file', {
          uri: fileUri,
          type: 'image/jpeg',
          name: fileName,
        } as any)

        // Use tasker-documents bucket for all images (this bucket exists)
        // The folder parameter is used as the path prefix, not the bucket name
        const bucketName = 'tasker-documents'
        
        console.log(`📤 Uploading to bucket: ${bucketName}, path: ${filePath}`)
        
        // Upload to Supabase Storage with timeout
        const uploadPromise = supabase.storage
          .from(bucketName)
          .upload(filePath, formData, {
            contentType: 'image/jpeg',
            upsert: false
          })

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Upload timeout after 30 seconds')), 30000)
        })

        const { data, error } = await Promise.race([uploadPromise, timeoutPromise]) as any

        if (error) {
          // If bucket doesn't exist, try with a different approach
          if (error.message?.includes('Bucket not found') || error.message?.includes('not found')) {
            console.error(`❌ Bucket ${bucketName} not found. Please create the bucket in Supabase Storage.`)
            throw new Error(`Storage bucket not found. Please contact support or create the '${bucketName}' bucket in Supabase Storage.`)
          }
          throw error
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(filePath)

        console.log(`✅ Upload successful on attempt ${attempt}`)
        return {
          success: true,
          url: urlData.publicUrl
        }
      } catch (error) {
        lastError = error
        console.error(`❌ Upload attempt ${attempt} failed:`, error)
        
        // If it's a network timeout error and we have retries left, wait before retrying
        if (attempt < maxRetries && (
          error?.message?.includes('timeout') || 
          error?.message?.includes('Network request timed out') ||
          error?.code === 'StorageUnknownError' ||
          error?.message?.includes('Property') ||
          error?.message?.includes('blob')
        )) {
          const waitTime = Math.pow(2, attempt) * 1000 // Exponential backoff
          console.log(`⏳ Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }

    console.error('❌ All upload attempts failed')
    return {
      success: false,
      error: lastError instanceof Error ? lastError.message : 'Failed to upload image after multiple attempts'
    }
  }

  // Get file info
  static async getFileInfo(fileUri: string): Promise<{ type: string; size: number }> {
    try {
      // Basic file info - in a real app, you'd get this from the file system
      return {
        type: 'image/jpeg',
        size: 0
      }
    } catch (error) {
      console.error('Error getting file info:', error)
      return {
        type: 'image/jpeg',
        size: 0
      }
    }
  }
}