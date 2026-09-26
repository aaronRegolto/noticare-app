const path = require('path');

module.exports = ({ config }) => {
  return {
    ...config,
    plugins: [
      ...(config.plugins || []),
      'expo-secure-store',
      './plugins/withNotificationListener',
      './plugins/withLinkHandler',
    ],
  };
};
