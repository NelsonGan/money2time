import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * expo-camera's iOS photo capture, against a preview that stops mid-request.
 *
 * The camera can report itself ready and then lose its video connection (the
 * receipt sheet is dismissed, the app backgrounds, another app takes the
 * camera) before `takePictureAsync` reaches AVFoundation. With a stopped
 * connection `AVCapturePhotoOutput.capturePhoto` raises an Objective-C
 * exception, which Swift cannot catch, so the app crashed instead of the
 * capture promise rejecting.
 *
 * patches/expo-camera+58.0.12.patch guards that the connection is active and
 * enabled (throwing CameraNotReadyException), and wraps capturePhoto in
 * EXUtilities.catchException so a stop after the guard still becomes a
 * rejected promise. This reads the installed module so the fix is noticed if
 * an upgrade drops the patch.
 */

const CAPTURE = path.resolve(
  __dirname,
  '../../node_modules/expo-camera/ios/Current/CameraPhotoCapture.swift',
);

describe('expo-camera iOS photo capture', () => {
  const source = readFileSync(CAPTURE, 'utf8');

  it('refuses to capture on an inactive or disabled video connection', () => {
    expect(source).toContain('connection.isActive, connection.isEnabled else {');
  });

  it('turns an Objective-C exception from capturePhoto into a rejection', () => {
    expect(source).toMatch(
      /EXUtilities\.catchException \{\s*photoOutput\.capturePhoto\(with: photoSettings, delegate: self\)/,
    );
    expect(source).toContain('continuation.resume(throwing: error)');
  });
});
