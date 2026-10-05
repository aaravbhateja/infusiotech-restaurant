// Extends app.json. Android push notifications need Firebase's
// google-services.json baked into the build. It's committed (it identifies
// the Firebase project; it can't send pushes — that needs the private
// service-account key, uploaded via `eas credentials`). A
// GOOGLE_SERVICES_JSON file environment variable overrides it, e.g. for a
// separate staging Firebase project.
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
