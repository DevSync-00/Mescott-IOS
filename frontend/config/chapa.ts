// Chapa Payment Gateway Configuration
// Replace these with your actual Chapa API credentials
import Constants from 'expo-constants'

const expoExtra = (Constants.expoConfig?.extra || {}) as Record<string, string | undefined>

export const CHAPA_CONFIG = {
  // Get these from your Chapa dashboard: https://dashboard.chapa.co/
  publicKey: process.env.EXPO_PUBLIC_CHAPA_PUBLIC_KEY || expoExtra.EXPO_PUBLIC_CHAPA_PUBLIC_KEY || '',
  secretKey: process.env.EXPO_PUBLIC_CHAPA_SECRET_KEY || expoExtra.EXPO_PUBLIC_CHAPA_SECRET_KEY || '',
  webhookSecret: process.env.EXPO_PUBLIC_CHAPA_WEBHOOK_SECRET || expoExtra.EXPO_PUBLIC_CHAPA_WEBHOOK_SECRET || 'qwertyuil@1A',
  
  // Company information
  companyName: 'Mescott',
  companyLogo: 'https://mescott.com/logo.png', // Update with your actual logo URL
  
  // Payment configuration
  currency: 'ETB',
  vatRate: 0.15, // 15% VAT as per Ethiopian tax law
  platformFeeRate: 0.05, // 5% platform fee
  
  // API URLs - Use main endpoint (test keys work with main endpoint)
  baseUrl: 'https://api.chapa.co/v1',
  webhookUrl: 'https://mchapaw-n0utcbuab-bereket-birhanu-kinfus-projects.vercel.app/api/webhook',
  returnUrl: 'https://mescott.com/payment-success', // Update with your actual app URL
}

// Instructions for setup:
// 1. Register at https://dashboard.chapa.co/register
// 2. Get your API keys from Account > Settings > API
// 3. Set up webhook URL in Account > Settings > Webhooks
// 4. Create a .env file in the frontend directory with your credentials:
//    EXPO_PUBLIC_CHAPA_PUBLIC_KEY=your_public_key_here
//    EXPO_PUBLIC_CHAPA_SECRET_KEY=your_secret_key_here
//    EXPO_PUBLIC_CHAPA_WEBHOOK_SECRET=your_webhook_secret_here
// 5. Update the company logo URL with your actual logo
// 6. Update the API and app URLs with your actual domains

export default CHAPA_CONFIG
