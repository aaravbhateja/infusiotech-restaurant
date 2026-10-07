// Runs after `expo export -p web`.
//
// blinkrest.com's home page is the marketing site (apps/site), served through
// the rewrites at the top of vercel.json. Vercel serves a real file before it
// applies a rewrite, so the app's own dist/index.html has to get out of the
// way. It is kept as dist/app-root.html in case anything needs the app shell at
// the root. Every other app route (/login, /order/..., /admin, ...) is
// untouched.
const fs = require('fs');
const path = require('path');

const dist = path.resolve('dist');
const index = path.join(dist, 'index.html');

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run `npx expo export -p web` first.');
  process.exit(1);
}

if (fs.existsSync(index)) {
  fs.renameSync(index, path.join(dist, 'app-root.html'));
  console.log('Moved dist/index.html to dist/app-root.html so / can serve the marketing site.');
} else {
  console.log('dist/index.html not present, nothing to move.');
}
