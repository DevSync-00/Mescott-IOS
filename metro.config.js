const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Force cache reset to fix InternalBytecode.js errors
config.resetCache = true;

// Disable problematic cache features
config.cacheStores = [];

// Add resolver configuration to handle OneDrive paths
config.resolver = {
  ...config.resolver,
  // Handle OneDrive path issues
  platforms: ['ios', 'android', 'native', 'web'],
  // Disable symlinks to avoid OneDrive issues
  useGlobalHotkey: false,
};

// Transformer configuration
config.transformer = {
  ...config.transformer,
  // Disable source maps temporarily to avoid InternalBytecode.js
  minifierConfig: {
    keep_fnames: true,
    mangle: {
      keep_fnames: true,
    },
  },
};

// Serializer configuration
config.serializer = {
  ...config.serializer,
  // Custom module ID factory to avoid path issues
  createModuleIdFactory: () => (path) => {
    // Use a hash of the path to avoid OneDrive path issues
    const crypto = require('crypto');
    return crypto.createHash('md5').update(path).digest('hex').substring(0, 8);
  },
};

module.exports = config;

