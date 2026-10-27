import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';

const MIN_CROP_SIZE = 64;

type Rect = { x: number; y: number; width: number; height: number };
type Handle = 'move' | 'tl' | 'tr' | 'bl' | 'br';

export function ImageCropModal({
  uri,
  sourceWidth,
  sourceHeight,
  visible,
  onCancel,
  onConfirm,
}: {
  uri: string;
  sourceWidth: number;
  sourceHeight: number;
  visible: boolean;
  onCancel: () => void;
  onConfirm: (croppedUri: string) => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const availableWidth = screenWidth - 40;
  const scale = Math.min(availableWidth / sourceWidth, (screenHeight - 260) / sourceHeight);
  const imageWidth = sourceWidth * scale;
  const imageHeight = sourceHeight * scale;
  const [crop, setCrop] = useState<Rect>(() => initialCrop(imageWidth, imageHeight));
  const cropRef = useRef(crop);

  useEffect(() => {
    const next = initialCrop(imageWidth, imageHeight);
    cropRef.current = next;
    setCrop(next);
  }, [uri, imageWidth, imageHeight]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const state = responder as unknown as {
            handle?: Handle;
            gestureStart?: { x: number; y: number };
          };
          const point = event.nativeEvent;
          const current = cropRef.current;
          const near = 34;
          const onLeft = Math.abs(point.locationX - current.x) <= near;
          const onRight = Math.abs(point.locationX - (current.x + current.width)) <= near;
          const onTop = Math.abs(point.locationY - current.y) <= near;
          const onBottom = Math.abs(point.locationY - (current.y + current.height)) <= near;
          state.handle = onTop && onLeft ? 'tl' : onTop && onRight ? 'tr' : onBottom && onLeft ? 'bl' : onBottom && onRight ? 'br' : 'move';
          state.gestureStart = { x: 0, y: 0 };
        },
        onPanResponderMove: (_event, gesture) => {
          const state = responder as unknown as { handle?: Handle; gestureStart?: { x: number; y: number } };
          const handle = state.handle ?? 'move';
          const startPoint = state.gestureStart ?? { x: 0, y: 0 };
          const next = clampCrop(cropRef.current, handle, gesture.dx - startPoint.x, gesture.dy - startPoint.y, imageWidth, imageHeight);
          cropRef.current = next;
          state.gestureStart = { x: gesture.dx, y: gesture.dy };
          setCrop(next);
        },
        onPanResponderRelease: () => undefined,
      }),
    [imageWidth, imageHeight],
  );

  const confirm = async () => {
    const rect = {
      originX: Math.round((crop.x / imageWidth) * sourceWidth),
      originY: Math.round((crop.y / imageHeight) * sourceHeight),
      width: Math.round((crop.width / imageWidth) * sourceWidth),
      height: Math.round((crop.height / imageHeight) * sourceHeight),
    };
    const result = await manipulateAsync(uri, [{ crop: rect }], { compress: 1, format: SaveFormat.JPEG });
    onConfirm(result.uri);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Crop message</Text>
          <Text style={styles.subtitle}>Drag the box or use a corner handle to frame the text.</Text>
          <View style={[styles.imageFrame, { width: imageWidth, height: imageHeight }]} {...responder.panHandlers}>
            <Image source={{ uri }} style={styles.image} contentFit="fill" />
            <View style={[styles.shade, { left: 0, top: 0, right: 0, bottom: imageHeight - crop.y }]} />
            <View style={[styles.shade, { left: 0, top: crop.y, width: crop.x, height: crop.height }]} />
            <View style={[styles.shade, { left: crop.x + crop.width, top: crop.y, right: 0, height: crop.height }]} />
            <View style={[styles.shade, { left: 0, top: crop.y + crop.height, right: 0, bottom: 0 }]} />
            <View style={[styles.cropBox, { left: crop.x, top: crop.y, width: crop.width, height: crop.height }]}> 
              <View style={[styles.handle, styles.tl]} />
              <View style={[styles.handle, styles.tr]} />
              <View style={[styles.handle, styles.bl]} />
              <View style={[styles.handle, styles.br]} />
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={onCancel}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
            <Pressable style={styles.primary} onPress={() => void confirm()}><Text style={styles.primaryText}>Use crop</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function initialCrop(width: number, height: number): Rect {
  const inset = Math.min(width, height) * 0.08;
  return { x: inset, y: inset, width: width - inset * 2, height: height - inset * 2 };
}

function clampCrop(current: Rect, handle: Handle, dx: number, dy: number, maxWidth: number, maxHeight: number): Rect {
  let { x, y, width, height } = current;
  if (handle === 'move') {
    x = clamp(x + dx, 0, maxWidth - width);
    y = clamp(y + dy, 0, maxHeight - height);
  } else {
    if (handle.includes('l')) {
      const nextX = clamp(x + dx, 0, x + width - MIN_CROP_SIZE);
      width += x - nextX;
      x = nextX;
    }
    if (handle.includes('r')) width = clamp(width + dx, MIN_CROP_SIZE, maxWidth - x);
    if (handle.includes('t')) {
      const nextY = clamp(y + dy, 0, y + height - MIN_CROP_SIZE);
      height += y - nextY;
      y = nextY;
    }
    if (handle.includes('b')) height = clamp(height + dy, MIN_CROP_SIZE, maxHeight - y);
  }
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4, 12, 24, 0.92)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: '#fff', borderRadius: 24, padding: 16, alignItems: 'center' },
  title: { color: '#1E2D43', fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#64748B', fontSize: 13, marginTop: 4, marginBottom: 14, textAlign: 'center' },
  imageFrame: { position: 'relative', overflow: 'hidden', backgroundColor: '#111827' },
  image: { position: 'absolute', width: '100%', height: '100%' },
  shade: { position: 'absolute', backgroundColor: 'rgba(15,23,42,0.62)' },
  cropBox: { position: 'absolute', borderWidth: 2, borderColor: '#fff' },
  handle: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', borderWidth: 3, borderColor: '#1E2D43' },
  tl: { left: -14, top: -14 }, tr: { right: -14, top: -14 }, bl: { left: -14, bottom: -14 }, br: { right: -14, bottom: -14 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
  secondary: { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 14 },
  secondaryText: { color: '#1E2D43', fontWeight: '700' },
  primary: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#1E2D43', paddingVertical: 14 },
  primaryText: { color: '#fff', fontWeight: '800' },
});
