const appJson = require('./app.json')

module.exports = ({ config }) => {
  const baseExpoConfig = appJson.expo || {}

  return {
    ...baseExpoConfig,
    extra: {
      ...(baseExpoConfig.extra || {}),
      ...(config?.extra || {}),
      EXPO_PUBLIC_CHAPA_PUBLIC_KEY: process.env.EXPO_PUBLIC_CHAPA_PUBLIC_KEY || '',
      EXPO_PUBLIC_CHAPA_SECRET_KEY: process.env.EXPO_PUBLIC_CHAPA_SECRET_KEY || '',
      EXPO_PUBLIC_CHAPA_WEBHOOK_SECRET: process.env.EXPO_PUBLIC_CHAPA_WEBHOOK_SECRET || ''
    }
  }
}
