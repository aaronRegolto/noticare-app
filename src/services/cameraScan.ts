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

const CAMERA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  quality: 1,
  base64: false,
  exif: false,
};

const CAMERA_FALLBACK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  quality: 1,
  base64: false,
  exif: false,
};

const LIBRARY_OPTIONS: ImagePicker.ImagePickerOptions = {
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
export async function readMessageFromImage(
  source: ImageTextSource,
  _cropCapturedImage?: (image: ImagePicker.ImagePickerAsset) => Promise<string | null>,
): Promise<ImageTextResult> {
  if (!isTextRecognitionAvailable()) return { status: 'unavailable' };
  try {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return { status: 'permission-denied', canAskAgain: permission.canAskAgain };
    }
    const picked =
      source === 'camera'
        ? await pickCameraImageWithFallback()
        : await ImagePicker.launchImageLibraryAsync(LIBRARY_OPTIONS);
    return await readPickedImage(picked);
  } catch (error) {
    logError('image-text-capture-failed', error);
    return { status: 'error' };
  }
}

async function pickCameraImageWithFallback(): Promise<ImagePicker.ImagePickerResult> {
  try {
    return await ImagePicker.launchCameraAsync(CAMERA_OPTIONS);
  } catch (error) {
    logError('camera-crop-editor-failed', error);
    return await ImagePicker.launchCameraAsync(CAMERA_FALLBACK_OPTIONS);
  }
}

/**
 * Android can close NotiCare while the camera or photo picker is open. On return, this finishes
 * reading the image the user had picked; null when there is nothing to recover.
 */
export async function readMessageFromPendingImage(
  _cropCapturedImage?: (image: ImagePicker.ImagePickerAsset) => Promise<string | null>,
): Promise<ImageTextResult | null> {
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

async function readPickedImage(
  picked: ImagePicker.ImagePickerResult,
  cropCapturedImage?: (image: ImagePicker.ImagePickerAsset) => Promise<string | null>,
): Promise<ImageTextResult> {
  if (picked.canceled) return { status: 'canceled' };
  const image = picked.assets[0];
  if (!image?.uri) return { status: 'canceled' };
  const sourceUri = image.uri;
  let scanUri = sourceUri;
  try {
    if (cropCapturedImage) {
      const croppedUri = await cropCapturedImage(image);
      if (!croppedUri) return { status: 'canceled' };
      scanUri = croppedUri;
    }
    const text = joinRecognizedText((await recognizeTextInImage(scanUri)).blocks);
    return text ? { status: 'ok', text } : { status: 'no-text' };
  } catch (error) {
    logError('image-text-recognition-failed', error);
    return { status: 'error' };
  } finally {
    deleteCachedImage(sourceUri);
    if (scanUri !== sourceUri) deleteCachedImage(scanUri);
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
