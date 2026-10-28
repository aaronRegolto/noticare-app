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
  const interactionRef = useRef<{ handle: Handle; startRect: Rect } | null>(null);

  useEffect(() => {
    const next = initialCrop(imageWidth, imageHeight);
    cropRef.current = next;
    interactionRef.current = null;
    setCrop(next);
  }, [uri, imageWidth, imageHeight]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: (event) => {
          const point = event.nativeEvent;
          const current = cropRef.current;
          const handlePadding = 42;

          const nearTopLeft = Math.abs(point.locationX - current.x) <= handlePadding && Math.abs(point.locationY - current.y) <= handlePadding;
          const nearTopRight = Math.abs(point.locationX - (current.x + current.width)) <= handlePadding && Math.abs(point.locationY - current.y) <= handlePadding;
          const nearBottomLeft = Math.abs(point.locationX - current.x) <= handlePadding && Math.abs(point.locationY - (current.y + current.height)) <= handlePadding;
          const nearBottomRight = Math.abs(point.locationX - (current.x + current.width)) <= handlePadding && Math.abs(point.locationY - (current.y + current.height)) <= handlePadding;

          if (nearTopLeft || nearTopRight || nearBottomLeft || nearBottomRight) {
            const handle = nearTopLeft ? 'tl' : nearTopRight ? 'tr' : nearBottomLeft ? 'bl' : 'br';
            interactionRef.current = { handle, startRect: current };
            return;
          }

          const insideX = point.locationX > current.x + 12 && point.locationX < current.x + current.width - 12;
          const insideY = point.locationY > current.y + 12 && point.locationY < current.y + current.height - 12;
          interactionRef.current = {
            handle: insideX && insideY ? 'move' : 'move',
            startRect: current,
          };
        },
        onPanResponderMove: (_event, gesture) => {
          const interaction = interactionRef.current;
          if (!interaction) return;
          const next = clampCrop(interaction.startRect, interaction.handle, gesture.dx, gesture.dy, imageWidth, imageHeight);
          cropRef.current = next;
          setCrop(next);
        },
        onPanResponderRelease: () => {
          interactionRef.current = null;
        },
        onPanResponderTerminate: () => {
          interactionRef.current = null;
        },
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
              <View style={styles.gridOverlay} pointerEvents="none">
                <View style={[styles.gridLineVertical, { left: '33.33%' }]} />
                <View style={[styles.gridLineVertical, { left: '66.66%' }]} />
                <View style={[styles.gridLineHorizontal, { top: '33.33%' }]} />
                <View style={[styles.gridLineHorizontal, { top: '66.66%' }]} />
              </View>

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
  const cropWidth = Math.min(width * 0.18, 150);
  const cropHeight = Math.min(height * 0.12, 100);
  const x = (width - cropWidth) / 2;
  const y = (height - cropHeight) / 2;
  return { x, y, width: cropWidth, height: cropHeight };
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
  cropBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  gridOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  gridLineVertical: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.7)',
    width: 1,
    height: '100%',
    top: 0,
    bottom: 0,
  },
  gridLineHorizontal: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.7)',
    left: 0,
    right: 0,
    height: 1,
  },
  handle: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#1f8dff',
    shadowColor: '#0F172A',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  tl: { left: -15, top: -15 }, tr: { right: -15, top: -15 }, bl: { left: -15, bottom: -15 }, br: { right: -15, bottom: -15 },
  actions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 16 },
  secondary: { flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', paddingVertical: 14 },
  secondaryText: { color: '#1E2D43', fontWeight: '700' },
  primary: { flex: 1, alignItems: 'center', borderRadius: 12, backgroundColor: '#1E2D43', paddingVertical: 14 },
  primaryText: { color: '#fff', fontWeight: '800' },
});
