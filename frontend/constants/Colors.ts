/**
 * Modern Color Palette for SkillHub - Designed for engagement and return visits
 * Inspired by successful marketplace apps with psychological color theory
 */

export const Colors = {
  // Primary Brand Colors - Vibrant purple theme
  primary: {
    50: '#F3F0FF',
    100: '#E9E3FF', 
    200: '#D6C7FF',
    300: '#B8A3FF',
    400: '#9B7AFF',
    500: '#7B42F6', // Main brand color - vibrant purple
    600: '#6B2FED',
    700: '#5B1BD9',
    800: '#4A15B6',
    900: '#3D0F95',
  },
  
  // Success Colors - For completed tasks, earnings
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E', // Main success color
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
  },
  
  // Warning Colors - For urgent tasks, pending status
  warning: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B', // Main warning color
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  
  // Error Colors - For cancelled tasks, errors
  error: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444', // Main error color
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  
  // Info Colors - For information messages
  info: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6', // Main info color
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  
  // Neutral Colors - Clean, modern grays
  neutral: {
    0: '#FFFFFF',
    50: '#FAFBFC',
    100: '#F5F6F8',
    200: '#E8EAED',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  
  // Gradient Colors for visual appeal
  gradients: {
    primary: ['#007AFF', '#0056CC'] as const,
    secondary: ['#6C757D', '#495057'] as const,
    success: ['#28A745', '#1E7E34'] as const,
    warning: ['#FFC107', '#E0A800'] as const,
    error: ['#DC3545', '#C82333'] as const,
    ocean: ['#17A2B8', '#138496'] as const,
    emerald: ['#20C997', '#1EA085'] as const,
    sunset: ['#FD7E14', '#E55A00'] as const,
  },
  
  // Category Colors - For different service categories
  categories: {
    plumbing: '#3B82F6',
    electrical: '#F59E0B',
    cleaning: '#10B981',
    photography: '#8B5CF6',
    it: '#06B6D4',
    carpentry: '#84CC16',
    gardening: '#22C55E',
    moving: '#F97316',
  },
  
  // Status Colors - For task statuses
  status: {
    posted: '#0E8AFF',
    assigned: '#F59E0B',
    in_progress: '#06B6D4',
    completed: '#22C55E',
    cancelled: '#EF4444',
  },
  
  // Background Colors
  background: {
    primary: '#FFFFFF', // Main white background
    secondary: '#FFFFFF', // White for cards and sections
    tertiary: '#F8F9FA', // Light gray for subtle backgrounds
    overlay: 'rgba(0, 0, 0, 0.6)',
  },
  
  // Text Colors
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    tertiary: '#6B7280', // Darker, more readable color for placeholders
    inverse: '#FFFFFF',
  },
  
  // Border Colors
  border: {
    primary: '#D1D5DB',
    secondary: '#E8EAED',
    light: '#E8EAED',
    medium: '#D1D5DB',
    dark: '#9CA3AF',
  },
  
  // Shadow Colors
  shadow: {
    light: 'rgba(0, 0, 0, 0.04)',
    medium: 'rgba(0, 0, 0, 0.1)',
    heavy: 'rgba(0, 0, 0, 0.15)',
  },

  // Accent Colors for UI elements
  accent: {
    primary: '#0E8AFF',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
  }
}

export default Colors