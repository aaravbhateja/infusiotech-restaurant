// Runs after `expo export -p web`. Puts the marketing page at the site root
// (blinkrest.com) and keeps the app's own routes (/login, /order/..., /admin)
// exactly as exported. The landing page's fonts and images live under
// /landing so they cannot clash with Expo's /assets.
const fs = require('fs');
const path = require('path');

// Build commands run from apps/blinkrest, same as `expo export`.
const src = path.resolve('landing');
const dist = path.resolve('dist');

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run `npx expo export -p web` first.');
  process.exit(1);
}

fs.cpSync(path.join(src, 'fonts'), path.join(dist, 'landing', 'fonts'), { recursive: true });
fs.cpSync(path.join(src, 'img'), path.join(dist, 'landing', 'img'), { recursive: true });
if (fs.existsSync(path.join(src, 'video'))) {
  fs.cpSync(path.join(src, 'video'), path.join(dist, 'landing', 'video'), { recursive: true });
}
fs.copyFileSync(path.join(src, 'index.html'), path.join(dist, 'index.html'));
console.log('Landing page added to dist/index.html');
