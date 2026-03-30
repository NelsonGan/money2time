import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

function copyDirRecursive(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }

  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  return true;
}

function clearFilesInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

function removeConflictingAndroidLauncherPngs(resDir) {
  if (!fs.existsSync(resDir)) {
    return 0;
  }

  const conflictingFiles = new Set([
    'ic_launcher.png',
    'ic_launcher_foreground.png',
    'ic_launcher_monochrome.png',
  ]);

  let removedCount = 0;

  for (const entry of fs.readdirSync(resDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('mipmap-')) {
      continue;
    }

    const mipmapDir = path.join(resDir, entry.name);
    for (const fileName of fs.readdirSync(mipmapDir)) {
      if (!conflictingFiles.has(fileName)) {
        continue;
      }

      fs.rmSync(path.join(mipmapDir, fileName), { force: true });
      removedCount += 1;
    }
  }

  return removedCount;
}

const iosSource = path.join(projectRoot, 'assets', 'ios');
const iosTarget = path.join(
  projectRoot,
  'ios',
  'money2time',
  'Images.xcassets',
  'AppIcon.appiconset',
);

if (fs.existsSync(path.dirname(iosTarget))) {
  clearFilesInDirectory(iosTarget);
  copyDirRecursive(iosSource, iosTarget);
  console.log('Synced iOS app icons to native AppIcon.appiconset');
} else {
  console.log('Skipped iOS sync: iOS native project not found');
}

const androidTarget = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');

if (fs.existsSync(path.dirname(androidTarget))) {
  const removedCount = removeConflictingAndroidLauncherPngs(androidTarget);
  if (removedCount > 0) {
    console.log(`Removed ${removedCount} conflicting Android launcher PNGs from native res/mipmap`);
  }

  console.log('Skipped Android sync: Expo manages native launcher icons from app.json');
} else {
  console.log('Skipped Android sync: android project not found (run expo prebuild)');
}
