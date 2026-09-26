import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  countryFromPhone,
  formatPhoneNumber,
  isValidPhoneNumber,
  localPartForCountry,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/src/features/auth/phone';
import { useAuth } from '@/src/providers/AuthProvider';

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to continue. Check your connection and try again.';
  if (/unsupported phone provider|phone provider/i.test(message)) {
    return 'Phone sign-in is not configured yet. Contact your administrator, then try again.';
  }
  if (/rate|too many/i.test(message)) return 'Too many requests. Please wait before requesting another code.';
  if (/expired/i.test(message)) return 'That code has expired. Request a new one and try again.';
  if (/invalid|token/i.test(message)) return 'That code is invalid. Check it and try again.';
  if (/network|fetch/i.test(message)) return 'Network unavailable. Check your connection and try again.';
  return message;
}

export default function LoginScreen() {
  const { configured, isDevelopmentPhoneLogin, pendingPhone, requestOtp, verifyOtp } = useAuth();
  const initialCountry = countryFromPhone(pendingPhone);
  const [step, setStep] = useState<'phone' | 'code'>(pendingPhone ? 'code' : 'phone');
  const [country, setCountry] = useState<PhoneCountry>(initialCountry);
  const [phone, setPhone] = useState(localPartForCountry(pendingPhone, initialCountry));
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (!seconds) return;
    const timer = setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const normalizedPhone = formatPhoneNumber(country.dialCode, phone);

  const sendOtp = async () => {
    if (!isValidPhoneNumber(normalizedPhone, country)) {
      setMessage(
        country.id === 'ph'
          ? 'Enter a valid Philippine mobile number, such as 9171234567.'
          : `Enter a valid ${country.name} mobile number.`,
      );
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const result = await requestOtp(normalizedPhone);
      if (result === 'development_signed_in') return;
      setStep('code');
      setSeconds(45);
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputs.current[0]?.focus(), 100);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const chooseCountry = () => {
    Alert.alert(
      'Choose country code',
      isDevelopmentPhoneLogin
        ? 'Local development sign-in creates a profile only on this device. No SMS is sent.'
        : 'Phone verification is handled securely.',
      PHONE_COUNTRIES.map((option) => ({
        text: `${option.flag} ${option.name} (${option.dialCode})`,
        onPress: () => {
          setCountry(option);
          setMessage('');
        },
      })),
    );
  };

  const updateDigit = (value: string, index: number) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      clean
        .slice(0, 6)
        .split('')
        .forEach((digit, offset) => {
          if (index + offset < next.length) next[index + offset] = digit;
        });
      setDigits(next);
      const last = Math.min(index + clean.length, 5);
      inputs.current[last]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 5) inputs.current[index + 1]?.focus();
  };

  const submitCode = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      setMessage('Enter the six-digit code we sent you.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await verifyOtp(code);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <View style={styles.brandArea}>
          <View style={styles.shield}>
            <Ionicons name="shield-checkmark" size={39} color="#00C88B" />
          </View>
          <Text style={styles.brand}>NotiCare</Text>
          <Text style={styles.tagline}>Smishing Shield</Text>
        </View>
        <View style={styles.card}>
          {!configured ? (
            <>
              <Text style={styles.title}>Set up NotiCare</Text>
              <Text style={styles.copy}>
                NotiCare has not been connected to its backend service yet. Contact your administrator before signing
                in.
              </Text>
            </>
          ) : step === 'phone' ? (
            <>
              <Text style={styles.title}>Protect your messages</Text>
              <Text style={styles.copy}>
                {isDevelopmentPhoneLogin
                  ? 'Continue with your phone number to create a device-only development profile. No SMS is sent.'
                  : 'Sign in with your phone number. NotiCare never uploads your full SMS content.'}
              </Text>
              <Text style={styles.label}>Mobile number</Text>
              <View style={styles.phoneRow}>
                <Pressable
                  onPress={chooseCountry}
                  style={styles.countryCode}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose country code, currently ${country.name}`}
                >
                  <Text style={styles.flag}>{country.flag}</Text>
                  <Text style={styles.countryText}>{country.dialCode}</Text>
                  <Ionicons name="chevron-down" size={14} color="#45617D" />
                </Pressable>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={country.placeholder}
                  placeholderTextColor="#8492A5"
                  keyboardType="phone-pad"
                  style={styles.phoneInput}
                  accessibilityLabel={`${country.name} mobile number`}
                />
              </View>
              <Pressable
                onPress={sendOtp}
                disabled={loading}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (loading || !phone) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>
                  {loading
                    ? isDevelopmentPhoneLogin
                      ? 'Continuing…'
                      : 'Sending code…'
                    : isDevelopmentPhoneLogin
                      ? 'Continue'
                      : 'Send code'}
                </Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Enter verification code</Text>
              <Text style={styles.copy}>We sent a six-digit code to {normalizedPhone}.</Text>
              <View style={styles.codeRow}>
                {digits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(input) => {
                      inputs.current[index] = input;
                    }}
                    value={digit}
                    onChangeText={(value) => updateDigit(value, index)}
                    onKeyPress={({ nativeEvent }) =>
                      nativeEvent.key === 'Backspace' &&
                      !digits[index] &&
                      index > 0 &&
                      inputs.current[index - 1]?.focus()
                    }
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.codeInput}
                    accessibilityLabel={`Verification code digit ${index + 1}`}
                  />
                ))}
              </View>
              <Pressable
                onPress={submitCode}
                disabled={loading}
                style={({ pressed }) => [styles.primaryButton, loading && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{loading ? 'Verifying…' : 'Verify code'}</Text>
                <Ionicons name="checkmark" size={19} color="#fff" />
              </Pressable>
              <View style={styles.linkRow}>
                <Pressable
                  onPress={() => {
                    setStep('phone');
                    setMessage('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Change phone number"
                >
                  <Text style={styles.link}>Change number</Text>
                </Pressable>
                <Pressable
                  disabled={seconds > 0 || loading}
                  onPress={sendOtp}
                  accessibilityRole="button"
                  accessibilityLabel={seconds ? `Resend code in ${seconds} seconds` : 'Resend verification code'}
                >
                  <Text style={[styles.link, seconds > 0 && styles.linkDisabled]}>
                    {seconds ? `Resend in ${seconds}s` : 'Resend code'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
          ) : null}
        </View>
        <Text style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={12} />{' '}
          {isDevelopmentPhoneLogin
            ? 'Development profile only: no SMS is sent or uploaded.'
            : 'Your phone is used for authentication. Full SMS messages stay on your device.'}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  flex: { flex: 1 },
  brandArea: { backgroundColor: '#1E2D43', alignItems: 'center', paddingTop: 42, paddingBottom: 56 },
  shield: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: '#30435E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: '#FFF', fontSize: 28, fontWeight: '800', marginTop: 14 },
  tagline: { color: '#D0DBE9', marginTop: 3 },
  card: {
    backgroundColor: '#FFF',
    margin: 18,
    marginTop: -32,
    borderRadius: 18,
    padding: 24,
    shadowColor: '#15243A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  title: { color: '#15243A', fontSize: 24, fontWeight: '800' },
  copy: { color: '#637998', lineHeight: 21, marginTop: 10 },
  label: { color: '#30435E', fontWeight: '700', marginTop: 26, marginBottom: 8 },
  phoneRow: {
    height: 54,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DDE4EE',
    borderRadius: 10,
    overflow: 'hidden',
  },
  countryCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    backgroundColor: '#F3F6FA',
    borderRightWidth: 1,
    borderRightColor: '#DDE4EE',
  },
  flag: { fontSize: 16 },
  countryText: { color: '#263B59', fontWeight: '700' },
  phoneInput: { flex: 1, paddingHorizontal: 14, color: '#15243A', fontSize: 16 },
  primaryButton: {
    height: 52,
    borderRadius: 10,
    backgroundColor: '#00B87C',
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  codeInput: {
    width: 43,
    height: 52,
    borderWidth: 1,
    borderColor: '#D7E0EC',
    borderRadius: 9,
    textAlign: 'center',
    fontSize: 21,
    fontWeight: '700',
    color: '#15243A',
  },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  link: { color: '#006DAB', fontWeight: '700' },
  linkDisabled: { color: '#98A7BD' },
  message: { marginTop: 16, color: '#B42318', lineHeight: 19 },
  privacy: { color: '#6E83A2', fontSize: 12, textAlign: 'center', paddingHorizontal: 30, lineHeight: 18 },
});
