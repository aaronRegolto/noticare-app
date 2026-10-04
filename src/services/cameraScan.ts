import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { joinRecognizedText } from '@/src/features/camera-scan';
import { logError } from '@/src/services/logger';
import { isTextRecognitionAvailable, recognizeTextInImage } from '@/src/services/notificationListener';

export type ImageTextSource = 'camera' | 'library';

export type ImageTextResult =
  | { status: 'ok'; text: string }
  | { status: 'canceled' }
  | { status: 'permission-denied'; canAskAgain: boolean }
  | { status: 'no-text' }
  | { status: 'unavailable' }
  | { status: 'error' };

// The crop step lets the user frame just the message, leaving out names, times, and other bubbles.
const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 1,
  base64: false,
  exif: false,
};

/**
 * Lets the user photograph a message (for example on a friend's phone) or pick a screenshot, then
 * reads its text on this device for Manual Scan. The image never leaves the phone and is deleted
 * from the app's cache once read; the text is handled like pasted text.
 */
export async function readMessageFromImage(source: ImageTextSource): Promise<ImageTextResult> {
  if (!isTextRecognitionAvailable()) return { status: 'unavailable' };
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { status: 'permission-denied', canAskAgain: permission.canAskAgain };
    }
    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    return await readPickedImage(picked);
  } catch (error) {
    logError('image-text-capture-failed', error);
    return { status: 'error' };
  }
}

/**
 * Android can close NotiCare while the camera or photo picker is open. On return, this finishes
 * reading the image the user had picked; null when there is nothing to recover.
 */
export async function readMessageFromPendingImage(): Promise<ImageTextResult | null> {
  if (!isTextRecognitionAvailable()) return null;
  try {
    const pending = await ImagePicker.getPendingResultAsync();
    if (!pending || !('canceled' in pending) || pending.canceled) return null;
    return await readPickedImage(pending);
  } catch (error) {
    logError('image-text-pending-failed', error);
    return null;
  }
}

async function readPickedImage(picked: ImagePicker.ImagePickerResult): Promise<ImageTextResult> {
  if (picked.canceled) return { status: 'canceled' };
  const uri = picked.assets[0]?.uri;
  if (!uri) return { status: 'canceled' };
  try {
    const text = joinRecognizedText((await recognizeTextInImage(uri)).blocks);
    return text ? { status: 'ok', text } : { status: 'no-text' };
  } catch (error) {
    logError('image-text-recognition-failed', error);
    return { status: 'error' };
  } finally {
    deleteCachedImage(uri);
  }
}

/** The picker copies the photo or screenshot into the app's cache; remove that copy. */
function deleteCachedImage(uri: string) {
  try {
    // Never delete anything outside NotiCare's own cache, such as a gallery file the user picked.
    if (!uri.startsWith(Paths.cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    logError('image-text-cleanup-failed', error);
  }
}
