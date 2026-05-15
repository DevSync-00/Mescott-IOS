import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Language = 'en' | 'am'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => Promise<void>
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

// English translations
const enTranslations = {
  // Common
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.done': 'Done',
  'common.yes': 'Yes',
  'common.no': 'No',
  
  // Navigation
  'nav.home': 'Home',
  'nav.jobs': 'Tasks',
  'nav.chats': 'Chats',
  'nav.bookings': 'Bookings',
  'nav.profile': 'Profile',
  
  // Auth
  'auth.welcome': 'Welcome to Mescott',
  'auth.login': 'Login',
  'auth.register': 'Register',
  'auth.phone': 'Phone Number',
  'auth.name': 'Full Name',
  'auth.verify': 'Verify Code',
  
  // Jobs
  'jobs.available': 'Available Tasks',
  'jobs.my_tasks': 'My Tasks',
  'jobs.create_task': 'Create Task',
  'jobs.search': 'Search tasks...',
  'jobs.filter': 'Filter',
  'jobs.budget_range': 'Budget Range',
  'jobs.sort_by': 'Sort By',
  'jobs.newest_first': 'Newest First',
  'jobs.oldest_first': 'Oldest First',
  'jobs.price_low_high': 'Price: Low to High',
  'jobs.price_high_low': 'Price: High to Low',
  'jobs.any_budget': 'Any Budget',
  'jobs.under_25': 'Under $25',
  'jobs.25_50': '$25 - $50',
  'jobs.50_100': '$50 - $100',
  'jobs.100_200': '$100 - $200',
  'jobs.over_200': 'Over $200',
  
  // Profile
  'profile.edit': 'Edit Profile',
  'profile.settings': 'Settings',
  'profile.become_tasker': 'Become a Tasker',
  'profile.tasks_completed': 'Tasks Completed',
  'profile.earned': 'Earned',
  'profile.rating': 'Rating',
  
  // Settings
  'settings.language': 'Language',
  'settings.notifications': 'Notifications',
  'settings.help': 'Help Center',
  'settings.about': 'About',
  'settings.logout': 'Logout',
  
  // Task Creation
  'task.title': 'Task Title',
  'task.description': 'Description',
  'task.budget': 'Budget',
  'task.location': 'Location',
  'task.category': 'Category',
  'task.urgent': 'Urgent',
  'task.photos': 'Photos',
  'task.post': 'Post Task',
}

// Amharic translations
const amTranslations = {
  // Common
  'common.loading': 'በመጫን ላይ...',
  'common.error': 'ስህተት',
  'common.success': 'ተሳክቷል',
  'common.cancel': 'ሰርዝ',
  'common.save': 'አስቀምጥ',
  'common.delete': 'ሰርዝ',
  'common.edit': 'አርትዖት',
  'common.back': 'ተመለስ',
  'common.next': 'ቀጥል',
  'common.done': 'ተጠናቋል',
  'common.yes': 'አዎ',
  'common.no': 'አይ',
  
  // Navigation
  'nav.home': 'መነሻ',
  'nav.jobs': 'ስራዎች',
  'nav.chats': 'ውይይቶች',
  'nav.bookings': 'ቦታ ማስያዣዎች',
  'nav.profile': 'መገለጫ',
  
  // Auth
  'auth.welcome': 'ወደ ሙያኮን እንኳን ደህና መጡ',
  'auth.login': 'ግባ',
  'auth.register': 'ተመዝግብ',
  'auth.phone': 'ስልክ ቁጥር',
  'auth.name': 'ሙሉ ስም',
  'auth.verify': 'ኮድ አረጋግጥ',
  
  // Jobs
  'jobs.available': 'የሚገኙ ስራዎች',
  'jobs.my_tasks': 'የእኔ ስራዎች',
  'jobs.create_task': 'ስራ ፍጠር',
  'jobs.search': 'ስራዎችን ፈልግ...',
  'jobs.filter': 'አጣራ',
  'jobs.budget_range': 'በጀት ክልል',
  'jobs.sort_by': 'በማዋሃድ',
  'jobs.newest_first': 'አዲስ በመጀመሪያ',
  'jobs.oldest_first': 'አሮጌ በመጀመሪያ',
  'jobs.price_low_high': 'ዋጋ: ከዝቅ ወደ ከፍ',
  'jobs.price_high_low': 'ዋጋ: ከከፍ ወደ ዝቅ',
  'jobs.any_budget': 'ማንኛውም በጀት',
  'jobs.under_25': 'ከ$25 በታች',
  'jobs.25_50': '$25 - $50',
  'jobs.50_100': '$50 - $100',
  'jobs.100_200': '$100 - $200',
  'jobs.over_200': 'ከ$200 በላይ',
  
  // Profile
  'profile.edit': 'መገለጫ አርትዖት',
  'profile.settings': 'ቅንብሮች',
  'profile.become_tasker': 'ስራ አጫሪ ሁን',
  'profile.tasks_completed': 'የተጠናቀቁ ስራዎች',
  'profile.earned': 'የተገኘ',
  'profile.rating': 'ደረጃ',
  
  // Settings
  'settings.language': 'ቋንቋ',
  'settings.notifications': 'ማሳወቂያዎች',
  'settings.help': 'የእርዳታ ማዕከል',
  'settings.about': 'ስለ',
  'settings.logout': 'ውጣ',
  
  // Task Creation
  'task.title': 'የስራ ርዕስ',
  'task.description': 'መግለጫ',
  'task.budget': 'በጀት',
  'task.location': 'አካባቢ',
  'task.category': 'ምድብ',
  'task.urgent': 'አስቸኳይ',
  'task.photos': 'ፎቶዎች',
  'task.post': 'ስራ ለጥፍ',
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    loadLanguage()
  }, [])

  const loadLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('language')
      // Temporarily force English only for launch; ignore saved Amharic
      if (savedLanguage && savedLanguage === 'en') {
        setLanguageState('en')
      } else if (savedLanguage === 'am') {
        await AsyncStorage.setItem('language', 'en')
        setLanguageState('en')
      }
    } catch (error) {
      console.error('Error loading language:', error)
    }
  }

  const setLanguage = async (_lang: Language) => {
    try {
      // For now, lock to English regardless of requested language
      await AsyncStorage.setItem('language', 'en')
      setLanguageState('en')
    } catch (error) {
      console.error('Error saving language:', error)
    }
  }

  const t = (key: string): string => {
    // Use English only while Amharic is disabled
    const translations = enTranslations
    return translations[key as keyof typeof translations] || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
