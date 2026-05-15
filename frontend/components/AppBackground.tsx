import React, { useMemo } from 'react'
import { Platform, StyleSheet, View, Dimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import * as Device from 'expo-device'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

/**
 * Get iOS version number
 */
function getIOSVersion(): number {
  if (Device.osVersion) {
    const version = parseFloat(Device.osVersion)
    if (!isNaN(version)) return version
  }
  
  const versionStr = Platform.Version as string
  const version = parseFloat(versionStr)
  return isNaN(version) ? 0 : version
}

/**
 * Fractal Noise Texture Component
 * Generates a subtle 2% opacity fractal noise pattern using View elements
 * Uses a deterministic pattern for consistent rendering
 * Optimized for performance with capped element count
 */
function FractalNoiseTexture() {
  // Generate noise pattern using small View elements
  const noiseElements = useMemo(() => {
    const elements = []
    const cellSize = 16 // Size of each noise cell
    const maxElements = 200 // Cap total elements for performance
    const cols = Math.ceil(SCREEN_WIDTH / cellSize) + 1
    const rows = Math.ceil(SCREEN_HEIGHT / cellSize) + 1
    const skip = Math.max(1, Math.floor((cols * rows) / maxElements)) // Skip factor
    
    // Create a deterministic pseudo-random pattern
    let count = 0
    for (let row = 0; row < rows && count < maxElements; row += skip) {
      for (let col = 0; col < cols && count < maxElements; col += skip) {
        const x = col * cellSize
        const y = row * cellSize
        
        // Simple hash function for deterministic pseudo-randomness
        const hash = ((x * 73856093) ^ (y * 19349663)) % 1000
        const opacity = (hash % 15) / 1000 * 0.02 // Max 2% opacity
        
        if (opacity > 0.001) {
          elements.push(
            <View
              key={`${x}-${y}`}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: cellSize,
                height: cellSize,
                backgroundColor: `rgba(0, 0, 0, ${opacity})`,
                borderRadius: cellSize / 2,
              }}
            />
          )
          count++
        }
      }
    }
    
    return elements
  }, [])

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {noiseElements}
    </View>
  )
}

/**
 * App Background Component
 * Provides a subtle textured background for the entire app
 * 
 * Features:
 * - Base color: #FAFAFA
 * - Vertical gradient: #FFFFFF → #F5F5F5
 * - 2% opacity fractal noise texture
 * - iOS 18+: ultraThinMaterialLight blur (intensity 3) for vibrancy
 * - Does NOT blur content - only background
 */
function AppBackground() {
  const isIOS = Platform.OS === 'ios'
  const iosVersion = useMemo(() => getIOSVersion(), [])
  const supportsVibrancy = isIOS && iosVersion >= 18

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Base color layer */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: '#FAFAFA',
          },
        ]}
      />
      
      {/* Vertical gradient layer */}
      <LinearGradient
        colors={['#FFFFFF', '#F5F5F5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      
      {/* Fractal noise texture (2% opacity) */}
      <FractalNoiseTexture />
      
      {/* iOS 18+ vibrancy blur layer (ultraThinMaterialLight) */}
      {supportsVibrancy && (
        <BlurView
          intensity={3}
          tint="light"
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  )
}

export { AppBackground }
export default AppBackground

