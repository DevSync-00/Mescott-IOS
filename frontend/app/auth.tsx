import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import Colors from '../constants/Colors'


export default function Auth() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [isCodeSent, setIsCodeSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const { sendVerificationCode, verifyPhoneCode, isAuthenticated } = useAuth()

  // Redirect away if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/')
    }
  }, [isAuthenticated])

  // Reset auth state when user logs out
  React.useEffect(() => {
    if (!isAuthenticated) {
      setVerificationCode('')
      setIsCodeSent(false)
      setLoading(false)
      setCountdown(0)
    }
  }, [isAuthenticated])

  const startCountdown = () => {
    setCountdown(60)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const cleanPhoneNumber = (phone: string) => {
    let cleaned = phone.replace(/\D/g, '')
    if (cleaned.startsWith('0')) {
      cleaned = '251' + cleaned.substring(1)
    }
    if (!cleaned.startsWith('251')) {
      cleaned = '251' + cleaned
    }
    return '+' + cleaned
  }

  const handleSendCode = async () => {
    if (isSignUp) {
      if (!fullName.trim()) {
        Alert.alert('Error', 'Please enter your full name')
        return
      }

      if (!username.trim()) {
        Alert.alert('Error', 'Please enter a username')
        return
      }
    }

    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number')
      return
    }

    const formattedPhone = cleanPhoneNumber(phoneNumber)
    
    if (formattedPhone.length !== 13) {
      Alert.alert('Error', 'Please enter a valid 9-digit phone number (e.g., 0912345678)')
      return
    }

    console.log('📲 AUTH SCREEN - Requesting OTP for:', formattedPhone, 'at', new Date().toISOString())
    setLoading(true)
    
    try {
      const result = await sendVerificationCode(formattedPhone, isSignUp, fullName, username)
      
      if (result.success) {
        console.log('✅ AUTH SCREEN - OTP sent successfully at', new Date().toISOString())
        Alert.alert('Success', result.message)
        setIsCodeSent(true)
        startCountdown()
      } else {
        console.error('❌ AUTH SCREEN - Failed to send OTP:', result.message)
        Alert.alert('Error', result.message)
      }
    } catch (error: any) {
      console.error('❌ AUTH SCREEN - Exception in handleSendCode:', error);
      Alert.alert('Error', error.message || 'Failed to send verification code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit verification code')
      return
    }

    const formattedPhone = cleanPhoneNumber(phoneNumber)
    console.log('🔍 AUTH SCREEN - Attempting verification:', {
      phone: formattedPhone,
      code: verificationCode,
      codeLength: verificationCode.length,
      timestamp: new Date().toISOString(),
      countdownRemaining: countdown
    })

    setLoading(true)
    try {
      const result = await verifyPhoneCode(formattedPhone, verificationCode)
      
      if (result.success) {
        console.log('✅ AUTH SCREEN - Verification successful at', new Date().toISOString())
        Alert.alert('Success', result.message)
        
        // Reset form state
        setVerificationCode('')
        setIsCodeSent(false)
        setPhoneNumber('')
        setFullName('')
        setUsername('')
        // Navigation will be handled by the layout redirect
      } else {
        console.error('❌ AUTH SCREEN - Verification failed:', result.message)
        Alert.alert('Error', result.message)
      }
    } catch (error: any) {
      console.error('❌ AUTH SCREEN - Exception in handleVerifyCode:', error)
      Alert.alert('Error', error.message || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendCode = async () => {
    if (countdown === 0) {
      setLoading(true)
      try {
        const formattedPhone = cleanPhoneNumber(phoneNumber)
        const result = await sendVerificationCode(formattedPhone, isSignUp, fullName, username)
        
        if (result.success) {
          setVerificationCode('')
          setIsCodeSent(false)
          Alert.alert('Success', 'New verification code sent')
          startCountdown()
        } else {
          Alert.alert('Error', result.message)
        }
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to resend verification code')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.background}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <Ionicons name="phone-portrait" size={40} color="#FFFFFF" />
                </View>
                <Text style={styles.title}>
                  {isSignUp ? 'Create Account' : 'Welcome Back'}
                </Text>
                <Text style={styles.subtitle}>
                  {isCodeSent
                    ? `Enter the 6-digit code sent to ${phoneNumber}`
                    : isSignUp 
                      ? 'Enter your details to get started'
                      : 'Sign in to continue to your account'}
                </Text>
              </View>

              {/* Auth Mode Toggle */}
              {!isCodeSent && (
                <View style={styles.authToggle}>
                  <TouchableOpacity
                    style={[styles.toggleButton, !isSignUp && styles.toggleButtonActive]}
                    onPress={() => setIsSignUp(false)}
                  >
                    <Text style={[styles.toggleText, !isSignUp && styles.toggleTextActive]}>
                      Sign In
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, isSignUp && styles.toggleButtonActive]}
                    onPress={() => setIsSignUp(true)}
                  >
                    <Text style={[styles.toggleText, isSignUp && styles.toggleTextActive]}>
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>
              )}


              {/* Form */}
              <View style={styles.form}>
                {!isCodeSent ? (
                  <>
                    {isSignUp && (
                      <>
                        <View style={styles.inputContainer}>
                          <Ionicons name="person-outline" size={20} color="#6F4685" />
                          <TextInput
                            style={styles.input}
                            placeholder="Full name"
                            placeholderTextColor="#AAAAAA"
                            value={fullName}
                            onChangeText={setFullName}
                            autoFocus
                            returnKeyType="next"
                          />
                        </View>

                        <View style={styles.inputContainer}>
                          <Ionicons name="at" size={20} color="#6F4685" />
                          <TextInput
                            style={styles.input}
                            placeholder="Username"
                            placeholderTextColor="#AAAAAA"
                            value={username}
                            onChangeText={setUsername}
                            returnKeyType="next"
                          />
                        </View>
                      </>
                    )}

                    <View style={styles.inputContainer}>
                      <Ionicons name="call-outline" size={20} color="#6F4685" />
                      <TextInput
                        style={styles.input}
                        placeholder="Phone number"
                        placeholderTextColor="#AAAAAA"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        keyboardType="phone-pad"
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                        editable={true}
                        selectTextOnFocus={true}
                        autoFocus={!isSignUp}
                      />
                    </View>
                    
                    <TouchableOpacity
                      style={[styles.button, loading && styles.buttonDisabled]}
                      onPress={handleSendCode}
                      disabled={loading}
                    >
                      <Text style={styles.buttonText}>
                        {loading 
                          ? 'Sending...' 
                          : isSignUp 
                            ? 'Continue' 
                            : 'Continue'
                        }
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.backToPhoneButton}
                      onPress={() => {
                        setIsCodeSent(false)
                        setVerificationCode('')
                      }}
                    >
                      <Ionicons name="arrow-back" size={20} color="#6F4685" />
                      <Text style={styles.backToPhoneText}>Change phone number</Text>
                    </TouchableOpacity>

                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={20} color="#6F4685" />
                      <TextInput
                        style={styles.input}
                        placeholder="6-digit code"
                        placeholderTextColor="#AAAAAA"
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                    
                    <TouchableOpacity
                      style={[styles.button, loading && styles.buttonDisabled]}
                      onPress={handleVerifyCode}
                      disabled={loading}
                    >
                      <Text style={styles.buttonText}>
                        {loading ? 'Verifying...' : 'Verify & Continue'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.doneButton}
                      onPress={Keyboard.dismiss}
                    >
                      <Text style={styles.doneButtonText}>Done</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.resendButton, countdown > 0 && styles.resendButtonDisabled]}
                      onPress={handleResendCode}
                      disabled={countdown > 0}
                    >
                      <Text style={[styles.resendText, countdown > 0 && styles.resendTextDisabled]}>
                        {countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  By continuing, you agree to our Terms of Service and Privacy Policy
                </Text>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  )
}

const SECONDARY_COLOR = '#6F4685'

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: SECONDARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  devCodeContainer: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  devCodeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: SECONDARY_COLOR,
    marginBottom: 8,
    textAlign: 'center',
  },
  devCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: SECONDARY_COLOR,
    textAlign: 'center',
    letterSpacing: 4,
  },
  form: {
    width: '100%',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 54,
    borderWidth: 1.5,
    borderColor: '#E5E5E5',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    marginLeft: 12,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SECONDARY_COLOR,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  resendButton: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 8,
  },
  resendButtonDisabled: {
    opacity: 0.5,
  },
  resendText: {
    color: SECONDARY_COLOR,
    fontSize: 15,
    fontWeight: '500',
  },
  resendTextDisabled: {
    color: '#999999',
  },
  doneButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 8,
  },
  doneButtonText: {
    color: '#666666',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
  },
  footerText: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
  authToggle: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
    borderRadius: 10,
    padding: 4,
    marginBottom: 32,
    width: '100%',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#999999',
  },
  toggleTextActive: {
    color: SECONDARY_COLOR,
  },
  backToPhoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 24,
    gap: 6,
  },
  backToPhoneText: {
    color: SECONDARY_COLOR,
    fontSize: 15,
    fontWeight: '500',
  },
})