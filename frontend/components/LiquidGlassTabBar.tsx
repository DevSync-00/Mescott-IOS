import React, { useMemo } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { BlurView } from 'expo-blur'
import * as Device from 'expo-device'
import Colors from '../constants/Colors'

/**
 * Get iOS version number
 * Platform.Version returns a string like "18.0" on iOS
 */
function getIOSVersion(): number {
  // Try to get from Device.osVersion first (more reliable)
  if (Device.osVersion) {
    const version = parseFloat(Device.osVersion)
    if (!isNaN(version)) return version
  }
  
  // Fallback to Platform.Version
  const versionStr = Platform.Version as string
  const version = parseFloat(versionStr)
  return isNaN(version) ? 0 : version
}

/**
 * Custom Tab Bar Background Component
 * Provides iOS 18+ liquid glass effect with purple tint
 * Falls back to solid purple on iOS 18-
 */
export function LiquidGlassTabBarBackground() {
  const iosVersion = getIOSVersion()
  const supportsLiquidGlass = iosVersion >= 18

  if (supportsLiquidGlass) {
    // iOS 18+ Liquid Glass Effect
    return (
      <BlurView
        intensity={80}
        tint="light"
        style={StyleSheet.absoluteFill}
      >
        {/* Purple tint overlay for liquid glass effect */}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: 'rgba(123, 66, 246, 0.15)', // Purple tint with transparency
            },
          ]}
        />
      </BlurView>
    )
  }

  // Fallback: Solid purple background for iOS 18-
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: Colors.primary[500], // Solid purple
        },
      ]}
    />
  )
}

/**
 * Hook to get tab bar style configuration
 * Returns adaptive styles based on iOS version
 */
export function useTabBarStyle() {
  const iosVersion = useMemo(() => getIOSVersion(), [])
  const supportsLiquidGlass = iosVersion >= 18

  const tabBarStyle = useMemo(() => ({
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: supportsLiquidGlass ? 0 : 1,
    borderTopColor: supportsLiquidGlass ? 'transparent' : Colors.neutral[200],
    shadowOpacity: 0, // Remove shadow on iOS
    ...(supportsLiquidGlass && {
      // iOS 18+ liquid glass styling
      backgroundColor: 'transparent',
    }),
    ...(!supportsLiquidGlass && {
      // iOS 18- fallback
      backgroundColor: Colors.primary[500],
    }),
  }), [supportsLiquidGlass])

  return {
    tabBarBackground: LiquidGlassTabBarBackground,
    tabBarStyle,
    supportsLiquidGlass,
  }
}

