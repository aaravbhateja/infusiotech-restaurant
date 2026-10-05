// Extends app.json. Android push notifications need Firebase's
// google-services.json baked into the build. It's kept out of git: EAS
// builds get it from the GOOGLE_SERVICES_JSON file environment variable,
// local builds from ./google-services.json if present. With neither (e.g.
// plain `expo start` for Expo Go) it's simply left out.
const fs = require('fs');
const path = require('path');

const LOCAL_FILE = './google-services.json';

module.exports = ({ config }) => {
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(path.join(__dirname, LOCAL_FILE)) ? LOCAL_FILE : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
