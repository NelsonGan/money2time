const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Keep these native-only image directories in sync with the omissions from
// updates.assetPatternsToBeBundled. Their bytes cannot be supplied by OTA.
const directories = ['account-logos', 'subscription-logos', 'tutorials', 'news'];

function getNativeAssetRevision(projectRoot) {
  const hash = createHash('sha256');
  function visit(relative) {
    const absolute = path.join(projectRoot, relative);
    for (const entry of fs.readdirSync(absolute).sort()) {
      const filename = `${relative}/${entry}`;
      const file = path.join(projectRoot, filename);
      if (fs.statSync(file).isDirectory()) visit(filename);
      else if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(entry)) {
        hash.update(filename).update('\0').update(fs.readFileSync(file)).update('\0');
      }
    }
  }
  for (const directory of directories) visit(`assets/${directory}`);
  return hash.digest('hex').slice(0, 16);
}

module.exports = { getNativeAssetRevision };
