import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  Animated,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons, FontAwesome } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useAuth } from '../contexts/SimpleAuthContext'
import Colors from '../constants/Colors'
import * as WebBrowser from 'expo-web-browser'
import { Linking } from 'react-native'
import { TelegramAuthService } from '../services/TelegramAuthService'

const { width } = Dimensions.get('window')

export default function Auth() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [awaitingAuth, setAwaitingAuth] = useState(false)
  const [telegramLinks, setTelegramLinks] = useState<{
    session_token: string;
    telegram_link: string;
    fallback_link: string;
  } | null>(null)
  const [unsubscribeFn, setUnsubscribeFn] = useState<(() => void) | null>(null)
  
  const [pulseAnim] = useState(new Animated.Value(1))
  const { initiateTelegramAuth, handleTelegramLogin, isAuthenticated } = useAuth()

  // Redirect away if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/')
    }
  }, [isAuthenticated])

  // Clean up subscriptions and animations on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeFn) {
        unsubscribeFn()
      }
    }
  }, [unsubscribeFn])

  // Logo Pulse animation during awaiting verification state
  useEffect(() => {
    let pulseAnimation: Animated.CompositeAnimation | null = null

    if (awaitingAuth) {
      pulseAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      )
      pulseAnimation.start()
    } else {
      pulseAnim.setValue(1)
    }

    return () => {
      if (pulseAnimation) {
        pulseAnimation.stop()
      }
    }
  }, [awaitingAuth])

  const handleTelegramAuth = async () => {
    setLoading(true)
    try {
      // 1. Call backend API to initiate session token and get deep links
      const result = await initiateTelegramAuth({
        platform: Platform.OS,
        version: Platform.Version,
        timestamp: new Date().toISOString()
      })

      if (!result || !result.success) {
        Alert.alert('Error', 'Failed to initiate Telegram login. Please try again.')
        return
      }

      setTelegramLinks(result)
      setAwaitingAuth(true)

      // 2. Setup Realtime listener for the generated session token
      const unsubscribe = TelegramAuthService.subscribeToAuthStatus(
        result.session_token,
        async (payload) => {
          console.log('🎉 AUTH SUCCESS - Received JWT session tokens')
          
          // Clean up subscription & close modal
          if (unsubscribe) unsubscribe()
          setAwaitingAuth(false)
          setLoading(false)

          try {
            await handleTelegramLogin(payload)
            // Navigation automatically triggered by isAuthenticated useEffect
          } catch (loginErr: any) {
            Alert.alert('Login Error', loginErr.message || 'Failed to establish session.')
          }
        }
      )
      setUnsubscribeFn(() => unsubscribe)

      // Set timeout for 5 minutes (300 seconds)
      const timeoutId = setTimeout(() => {
        Alert.alert('Session Expired', 'Verification session expired. Please try again.')
        unsubscribe()
        setAwaitingAuth(false)
        setTelegramLinks(null)
      }, 300000)

      // 3. Trigger OS intent to open native Telegram App
      const canOpen = await Linking.canOpenURL(result.telegram_link)
      if (canOpen) {
        await Linking.openURL(result.telegram_link)
      } else {
        // Fallback Scenario 1: Telegram App is not installed, open web link in-app
        console.log('Telegram native link failed, opening web fallback link in-app WebBrowser')
        await WebBrowser.openBrowserAsync(result.fallback_link)
      }

    } catch (err: any) {
      console.error('Error in handleTelegramAuth:', err)
      Alert.alert('Error', err.message || 'An unexpected error occurred.')
      setAwaitingAuth(false)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelAuth = () => {
    if (unsubscribeFn) {
      unsubscribeFn()
      setUnsubscribeFn(null)
    }
    setAwaitingAuth(false)
    setTelegramLinks(null)
    setLoading(false)
  }

  const handleOpenTelegramWeb = async () => {
    if (telegramLinks?.fallback_link) {
      await WebBrowser.openBrowserAsync(telegramLinks.fallback_link)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Logo */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="sparkles" size={42} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>MESCOTT</Text>
          <Text style={styles.subtitle}>Frictionless Login with Telegram</Text>
        </View>

        {/* Action Button */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={[styles.tgButton, loading && styles.tgButtonDisabled]}
            onPress={handleTelegramAuth}
            disabled={loading}
          >
            <FontAwesome name="telegram" size={24} color="#FFFFFF" style={styles.buttonIcon} />
            <Text style={styles.tgButtonText}>
              {loading ? 'INITIALIZING...' : 'CONTINUE WITH TELEGRAM'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* How It Works Guide */}
        <View style={styles.guideCard}>
          <Text style={styles.guideTitle}>How it works</Text>
          
          <View style={styles.guideStep}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1</Text></View>
            <Text style={styles.guideText}>Tap the button above</Text>
          </View>

          <View style={styles.guideStep}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>2</Text></View>
            <Text style={styles.guideText}>Click "Start" in the Telegram bot</Text>
          </View>

          <View style={styles.guideStep}>
            <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>3</Text></View>
            <Text style={styles.guideText}>Return to Mescott automatically</Text>
          </View>
        </View>

        {/* Terms Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our Terms & Conditions and Privacy Policy.
          </Text>
        </View>

        {/* Awaiting Authentication Overlay Modal */}
        <Modal
          visible={awaitingAuth}
          transparent={true}
          animationType="fade"
          onRequestClose={handleCancelAuth}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Animated.View style={[styles.pulseLogo, { transform: [{ scale: pulseAnim }] }]}>
                <Ionicons name="sparkles" size={36} color="#FFFFFF" />
              </Animated.View>

              <Text style={styles.modalTitle}>Awaiting Authentication</Text>
              
              <ActivityIndicator size="large" color="#24A1DE" style={styles.spinner} />
              
              <Text style={styles.modalDescription}>
                Waiting for Telegram approval...{"\n"}please do not close Mescott.
              </Text>

              <Text style={styles.modalInstruction}>
                Ensure you click "Start" inside the Telegram app.
              </Text>

              <TouchableOpacity style={styles.bypassButton} onPress={handleOpenTelegramWeb}>
                <Text style={styles.bypassButtonText}>App didn't switch? Open Telegram Web</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelAuth}>
                <Text style={styles.cancelButtonText}>Cancel & Retry</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginTop: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7B42F6', // Mescott Brand Accent
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#7B42F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A1A',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
  actionContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 20,
  },
  tgButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#24A1DE', // Telegram Brand Blue
    width: '100%',
    maxWidth: 320,
    height: 54,
    borderRadius: 27,
    shadowColor: '#24A1DE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  tgButtonDisabled: {
    backgroundColor: '#179CDE', // Pressed/disabled state
    opacity: 0.7,
  },
  buttonIcon: {
    marginRight: 10,
  },
  tgButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  guideCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  guideTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666666',
  },
  guideText: {
    fontSize: 14,
    color: '#555555',
    fontWeight: '500',
  },
  footer: {
    width: '100%',
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dimmed Overlay
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  pulseLogo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#7B42F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 20,
  },
  spinner: {
    marginBottom: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalInstruction: {
    fontSize: 13,
    color: '#999999',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  bypassButton: {
    paddingVertical: 10,
    marginBottom: 16,
  },
  bypassButtonText: {
    fontSize: 13,
    color: '#24A1DE',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cancelButton: {
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666666',
    fontWeight: 'bold',
  },
})