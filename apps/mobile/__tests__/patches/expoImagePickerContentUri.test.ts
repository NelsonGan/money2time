import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * expo-image-picker's Android read-failure path, against the content:// uris
 * the Android Photo Picker hands back (e.g. content://media/picker/...).
 *
 * When reading or compressing a picked image failed, the module built its
 * FailedToReadFileException from `uri.toFile()`. That androidx helper only
 * accepts file:// uris and throws "Uri lacks 'file' scheme" otherwise, so the
 * real failure was replaced by an unrelated IllegalArgumentException and
 * `launchImageLibraryAsync` rejected with a crash report instead of the read
 * error (Sentry MONEY2TIME-26).
 *
 * patches/expo-image-picker+58.0.10.patch uses `File(uri.toString())`, which
 * never checks the scheme. This reads the installed module so the fix is
 * noticed if an upgrade drops the patch.
 */

const ROOT = path.resolve(
  __dirname,
  '../../node_modules/expo-image-picker/android/src/main/java/expo/modules/imagepicker',
);

const FILES = ['ImagePickerUtils.kt', 'exporters/CompressionImageExporter.kt'];

describe('expo-image-picker android read failures', () => {
  it.each(FILES)('%s never calls Uri.toFile()', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    expect(source).not.toContain('import androidx.core.net.toFile');
    expect(source).not.toMatch(/(sourceUri|source)\.toFile\(\)\)/);
  });

  it('describes the failed uri without validating its scheme', () => {
    const utils = readFileSync(path.join(ROOT, 'ImagePickerUtils.kt'), 'utf8');
    const exporter = readFileSync(path.join(ROOT, 'exporters/CompressionImageExporter.kt'), 'utf8');
    expect(
      utils.match(/FailedToReadFileException\(File\(sourceUri\.toString\(\)\)\)/g),
    ).toHaveLength(2);
    expect(exporter).toContain('FailedToReadFileException(File(source.toString()), cause)');
  });
});
