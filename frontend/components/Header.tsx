import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import Colors from '../constants/Colors'

interface HeaderProps {
  title: string
  subtitle?: string
  showBackButton?: boolean
  onBackPress?: () => void
  rightAction?: {
    icon: string
    label: string
    onPress: () => void
    color?: string
  }
  variant?: 'default' | 'elevated' | 'minimal'
  backgroundColor?: string
}

export default function Header({
  title,
  subtitle,
  showBackButton = false,
  onBackPress,
  rightAction,
  variant = 'default',
  backgroundColor = Colors.background.primary
}: HeaderProps) {
  const router = useRouter()

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress()
    } else {
      router.back()
    }
  }

  const getHeaderStyle = () => {
    switch (variant) {
      case 'elevated':
        return [styles.header, styles.elevatedHeader, { backgroundColor }]
      case 'minimal':
        return [styles.header, styles.minimalHeader, { backgroundColor }]
      default:
        return [styles.header, styles.defaultHeader, { backgroundColor }]
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={getHeaderStyle()}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.neutral[700]} />
            </TouchableOpacity>
          )}
        </View>

        {/* Center Section */}
        <View style={styles.centerSection}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {rightAction && (
            <TouchableOpacity
              style={styles.rightActionButton}
              onPress={rightAction.onPress}
            >
              <Ionicons 
                name={rightAction.icon as any} 
                size={20} 
                color={rightAction.color || Colors.primary[500]} 
              />
              <Text style={[styles.rightActionText, { color: rightAction.color || Colors.primary[500] }]}>
                {rightAction.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: Colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 52,
  },
  defaultHeader: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  elevatedHeader: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 4,
  },
  minimalHeader: {
    paddingVertical: 12,
  },
  leftSection: {
    width: 60,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
  },
  rightSection: {
    width: 60,
    alignItems: 'flex-end',
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.background.secondary,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.neutral[900],
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.neutral[600],
    textAlign: 'center',
    marginTop: 2,
  },
  rightActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.background.secondary,
    gap: 6,
  },
  rightActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
