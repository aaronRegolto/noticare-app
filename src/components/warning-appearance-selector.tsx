import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type WarningMode = 'banner' | 'full-screen';

type Props = {
  value: WarningMode;
  disabled?: boolean;
  onChange: (mode: WarningMode) => void;
};

const navy = '#1E2D43';
const danger = '#D0443E';
const blue = '#0875B9';

function PhoneFrame({ mode, selected }: { mode: WarningMode; selected: boolean }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
        withDelay(1250, withTiming(1, { duration: 1 })),
        withTiming(0, { duration: 280, easing: Easing.in(Easing.cubic) }),
        withDelay(500, withTiming(0, { duration: 1 })),
      ),
      -1,
    );
  }, [progress, reduceMotion]);

  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25, 1], [0, 0.8, 1]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [-20, 1]) }],
  }));
  const screenStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25, 1], [0.15, 0.85, 1]),
  }));
  const warningStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.25, 1], [0, 0.65, 1]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.88, 1]) }],
  }));

  return (
    <View
      style={{
        width: 86,
        height: 148,
        borderRadius: 19,
        borderCurve: 'continuous',
        borderWidth: 3,
        borderColor: selected ? navy : '#AEB9C7',
        backgroundColor: '#F5F7FA',
        overflow: 'hidden',
        padding: 6,
      }}
    >
      <View style={{ width: 28, height: 4, borderRadius: 3, backgroundColor: '#29394C', alignSelf: 'center' }} />
      {mode === 'banner' ? (
        <>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: 10,
                left: 6,
                right: 6,
                minHeight: 32,
                borderRadius: 8,
                borderCurve: 'continuous',
                backgroundColor: '#FFF',
                padding: 6,
                boxShadow: '0 3px 8px rgba(26, 42, 61, 0.22)',
                zIndex: 2,
              },
              bannerStyle,
            ]}
          >
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: danger }} />
              <View style={{ height: 4, width: 40, borderRadius: 2, backgroundColor: '#3D526B' }} />
            </View>
            <View style={{ height: 3, width: 54, borderRadius: 2, backgroundColor: '#AAB5C2', marginTop: 5 }} />
          </Animated.View>
          <View style={{ gap: 8, paddingTop: 28 }}>
            {[44, 57, 38].map((width) => (
              <View key={width} style={{ height: 5, width, borderRadius: 3, backgroundColor: '#DFE5EC' }} />
            ))}
          </View>
        </>
      ) : (
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 6,
              top: 13,
              borderRadius: 13,
              borderCurve: 'continuous',
              backgroundColor: '#FCEBE9',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 7,
            },
            screenStyle,
          ]}
        >
          <Animated.View style={[{ alignItems: 'center', gap: 5 }, warningStyle]}>
            <View
              style={{
                width: 25,
                height: 25,
                borderRadius: 13,
                backgroundColor: danger,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFF', fontWeight: '900', fontSize: 16 }}>!</Text>
            </View>
            <View style={{ height: 5, width: 50, borderRadius: 3, backgroundColor: '#8A302D' }} />
            <View style={{ height: 3, width: 56, borderRadius: 2, backgroundColor: '#C88480' }} />
            <View style={{ height: 3, width: 46, borderRadius: 2, backgroundColor: '#C88480' }} />
            <View style={{ flexDirection: 'row', gap: 4, paddingTop: 3 }}>
              <View style={{ height: 11, width: 27, borderRadius: 4, backgroundColor: '#FFF' }} />
              <View style={{ height: 11, width: 27, borderRadius: 4, backgroundColor: danger }} />
            </View>
          </Animated.View>
        </Animated.View>
      )}
      <View
        style={{
          position: 'absolute',
          bottom: 4,
          alignSelf: 'center',
          width: 24,
          height: 3,
          borderRadius: 2,
          backgroundColor: '#64758A',
        }}
      />
    </View>
  );
}

function ModeCard({ mode, value, disabled, onChange }: Props & { mode: WarningMode }) {
  const selected = value === mode;
  const selection = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    selection.value = withSpring(selected ? 1 : 0, { damping: 17, stiffness: 190 });
  }, [selected, selection]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(selection.value, [0, 1], [1, 1.025]) }],
  }));
  const isBanner = mode === 'banner';

  return (
    <Animated.View entering={FadeInUp.duration(260).delay(isBanner ? 40 : 110)} style={[{ flex: 1 }, animatedStyle]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected, disabled }}
        accessibilityLabel={`${isBanner ? 'Notification banner' : 'Full-screen warning'} mode`}
        disabled={disabled}
        onPress={() => onChange(mode)}
        style={({ pressed }) => ({
          minHeight: 255,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? blue : '#DDE5EE',
          borderRadius: 18,
          borderCurve: 'continuous',
          backgroundColor: selected ? '#EFF8FE' : '#FFF',
          alignItems: 'center',
          padding: 13,
          opacity: disabled ? 0.62 : pressed ? 0.82 : 1,
          boxShadow: selected ? '0 7px 18px rgba(8, 117, 185, 0.15)' : '0 2px 7px rgba(30, 45, 67, 0.07)',
        })}
      >
        <View style={{ alignSelf: 'flex-end', height: 22 }}>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? blue : '#AAB7C7'}
          />
        </View>
        <PhoneFrame mode={mode} selected={selected} />
        <Text style={{ color: navy, fontWeight: '800', fontSize: 14, paddingTop: 13, textAlign: 'center' }}>
          {isBanner ? 'Notification banner' : 'Full-screen warning'}
        </Text>
        <Text style={{ color: '#667E9B', fontSize: 11, lineHeight: 16, paddingTop: 5, textAlign: 'center' }}>
          {isBanner ? 'A compact alert with quick actions.' : 'An immersive alert with phishing details.'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function WarningAppearanceSelector(props: Props) {
  return (
    <View accessibilityRole="radiogroup" style={{ gap: 13 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <ModeCard {...props} mode="banner" />
        <ModeCard {...props} mode="full-screen" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Ionicons name="information-circle-outline" size={17} color="#58738F" />
        <Text style={{ flex: 1, color: '#657D98', fontSize: 12, lineHeight: 17 }}>
          Android may use the banner as a fallback when it does not allow an app to open over the current screen.
        </Text>
      </View>
    </View>
  );
}
