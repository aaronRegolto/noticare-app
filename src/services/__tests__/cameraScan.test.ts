import * as ImagePicker from 'expo-image-picker';

import { readMessageFromImage, readMessageFromPendingImage } from '@/src/services/cameraScan';
import { isTextRecognitionAvailable, recognizeTextInImage } from '@/src/services/notificationListener';

const CACHE = 'file:///data/user/0/com.example/cache/';
const deleted: string[] = [];

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///data/user/0/com.example/cache/' } },
  File: jest.fn().mockImplementation((uri: string) => ({ exists: true, delete: () => deleted.push(uri) })),
}));

jest.mock('@/src/services/notificationListener', () => ({
  isTextRecognitionAvailable: jest.fn(),
  recognizeTextInImage: jest.fn(),
}));

jest.mock('@/src/services/logger', () => ({ logError: jest.fn() }));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const available = isTextRecognitionAvailable as jest.Mock;
const recognize = recognizeTextInImage as jest.Mock;

const picked = (uri: string) =>
  ({ canceled: false, assets: [{ uri, width: 1, height: 1 }] }) as ImagePicker.ImagePickerResult;
const canceled = { canceled: true, assets: null } as ImagePicker.ImagePickerResult;
const granted = (value: boolean, canAskAgain = true) =>
  ({ granted: value, canAskAgain, status: value ? 'granted' : 'denied', expires: 'never' }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  deleted.length = 0;
  available.mockReturnValue(true);
});

test('a photo is read on the device, joined into message text, then deleted from the cache', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue(granted(true));
  picker.launchCameraAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/a.jpeg`));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Your GCash account is', 'suspended.'] }] });

  expect(await readMessageFromImage('camera')).toEqual({
    status: 'ok',
    text: 'Your GCash account is suspended.',
  });
  expect(picker.launchCameraAsync).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, base64: false, exif: false }),
  );
  expect(recognize).toHaveBeenCalledWith(`${CACHE}ImagePicker/a.jpeg`);
  expect(deleted).toEqual([`${CACHE}ImagePicker/a.jpeg`]);
});

test('camera falls back to the plain capture flow when the crop editor fails on Android', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue(granted(true));
  picker.launchCameraAsync
    .mockRejectedValueOnce(Object.assign(new Error('crop editor unsupported'), { code: 'E_CROP_UNSUPPORTED' }))
    .mockResolvedValueOnce(picked(`${CACHE}ImagePicker/fallback.jpeg`));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Verify your account'] }] });

  expect(await readMessageFromImage('camera')).toEqual({ status: 'ok', text: 'Verify your account' });
  expect(picker.launchCameraAsync).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, base64: false, exif: false }),
  );
  expect(picker.launchCameraAsync).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false, base64: false, exif: false }),
  );
  expect(recognize).toHaveBeenCalledWith(`${CACHE}ImagePicker/fallback.jpeg`);
  expect(deleted).toEqual([`${CACHE}ImagePicker/fallback.jpeg`]);
});

test('the native picker crop editor is used for screenshots and the source image is deleted', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/crop-source.png`));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Only the message in the crop'] }] });

  expect(await readMessageFromImage('library')).toEqual({
    status: 'ok',
    text: 'Only the message in the crop',
  });
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ mediaTypes: ['images'], allowsEditing: true, base64: false, exif: false }),
  );
  expect(recognize).toHaveBeenCalledWith(`${CACHE}ImagePicker/crop-source.png`);
  expect(deleted).toEqual([`${CACHE}ImagePicker/crop-source.png`]);
});

test('a screenshot from the photo picker needs no camera permission', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/b.png`));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Claim your prize'] }] });

  expect(await readMessageFromImage('library')).toEqual({ status: 'ok', text: 'Claim your prize' });
  expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(deleted).toEqual([`${CACHE}ImagePicker/b.png`]);
});

test('a denied camera permission stops before the camera opens', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue(granted(false, true));
  expect(await readMessageFromImage('camera')).toEqual({ status: 'permission-denied', canAskAgain: true });

  picker.requestCameraPermissionsAsync.mockResolvedValue(granted(false, false));
  expect(await readMessageFromImage('camera')).toEqual({ status: 'permission-denied', canAskAgain: false });
  expect(picker.launchCameraAsync).not.toHaveBeenCalled();
});

test('canceling the camera or picker reads nothing', async () => {
  picker.requestCameraPermissionsAsync.mockResolvedValue(granted(true));
  picker.launchCameraAsync.mockResolvedValue(canceled);
  expect(await readMessageFromImage('camera')).toEqual({ status: 'canceled' });

  picker.launchImageLibraryAsync.mockResolvedValue(canceled);
  expect(await readMessageFromImage('library')).toEqual({ status: 'canceled' });
  expect(recognize).not.toHaveBeenCalled();
});

test('an image without text reports no-text and is still deleted', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/c.png`));
  recognize.mockResolvedValue({ blocks: [] });

  expect(await readMessageFromImage('library')).toEqual({ status: 'no-text' });
  expect(deleted).toEqual([`${CACHE}ImagePicker/c.png`]);
});

test('a recognition failure reports an error and still deletes the image', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/d.png`));
  recognize.mockRejectedValue(Object.assign(new Error('Unable to open this image.'), { code: 'image_unreadable' }));

  expect(await readMessageFromImage('library')).toEqual({ status: 'error' });
  expect(deleted).toEqual([`${CACHE}ImagePicker/d.png`]);
});

test('an image outside the app cache is never deleted', async () => {
  picker.launchImageLibraryAsync.mockResolvedValue(picked('content://media/external/images/media/42'));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Hello'] }] });

  expect(await readMessageFromImage('library')).toEqual({ status: 'ok', text: 'Hello' });
  expect(deleted).toEqual([]);
});

test('a build without the text recognizer reports unavailable without opening anything', async () => {
  available.mockReturnValue(false);
  expect(await readMessageFromImage('camera')).toEqual({ status: 'unavailable' });
  expect(await readMessageFromPendingImage()).toBeNull();
  expect(picker.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  expect(picker.getPendingResultAsync).not.toHaveBeenCalled();
});

test('an image picked before Android closed the app is read on return', async () => {
  picker.getPendingResultAsync.mockResolvedValue(picked(`${CACHE}ImagePicker/e.jpeg`));
  recognize.mockResolvedValue({ blocks: [{ lines: ['Verify at bit.ly/', 'abc'] }] });
  expect(await readMessageFromPendingImage()).toEqual({ status: 'ok', text: 'Verify at bit.ly/abc' });
  expect(deleted).toEqual([`${CACHE}ImagePicker/e.jpeg`]);

  picker.getPendingResultAsync.mockResolvedValue(null);
  expect(await readMessageFromPendingImage()).toBeNull();
  picker.getPendingResultAsync.mockResolvedValue(canceled);
  expect(await readMessageFromPendingImage()).toBeNull();
  picker.getPendingResultAsync.mockResolvedValue({ code: 'ERR', message: 'failed' } as never);
  expect(await readMessageFromPendingImage()).toBeNull();
});
