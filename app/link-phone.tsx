import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatPhoneNumber,
  isValidPhoneNumber,
  PHONE_COUNTRIES,
  type PhoneCountry,
} from '@/src/features/auth/phone';
import { useAuth } from '@/src/providers/AuthProvider';
import { confirmPhoneChange, recordLinkedPhone, requestPhoneChange } from '@/src/services/supabase';

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to continue. Check your connection and try again.';
  if (/already registered|already exists|duplicate/i.test(message)) {
    return 'That number is already registered to an account. Use a different number.';
  }
  if (/rate|too many/i.test(message)) return 'Too many requests. Please wait before requesting another code.';
  if (/expired/i.test(message)) return 'That code has expired. Request a new one and try again.';
  if (/invalid|token/i.test(message)) return 'That code is invalid. Check it and try again.';
  if (/network|fetch/i.test(message)) return 'Network unavailable. Check your connection and try again.';
  return message;
}

export default function LinkPhoneScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [country, setCountry] = useState<PhoneCountry>(PHONE_COUNTRIES[0]);
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);

  const normalizedPhone = formatPhoneNumber(country.dialCode, phone);
  const previousPhone = session?.user.phone;

  const chooseCountry = () => {
    Alert.alert(
      'Choose country code',
      'This number will be verified with a one-time code.',
      PHONE_COUNTRIES.map((option) => ({
        text: `${option.flag} ${option.name} (${option.dialCode})`,
        onPress: () => {
          setCountry(option);
          setMessage('');
        },
      })),
    );
  };

  const sendCode = async () => {
    if (!isValidPhoneNumber(normalizedPhone, country)) {
      setMessage(
        country.id === 'ph'
          ? 'Enter a valid Philippine mobile number, such as 9171234567.'
          : `Enter a valid ${country.name} mobile number.`,
      );
      return;
    }
    if (normalizedPhone === previousPhone) {
      setMessage('That is already your current number.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await requestPhoneChange(normalizedPhone);
      setStep('code');
      setDigits(['', '', '', '', '', '']);
      setTimeout(() => inputs.current[0]?.focus(), 100);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
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
      inputs.current[Math.min(index + clean.length, 5)]?.focus();
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
      await confirmPhoneChange(normalizedPhone, code);
      if (previousPhone) {
        await recordLinkedPhone(previousPhone);
      }
      Alert.alert('Number linked', `${normalizedPhone} can now sign in to this account too.`);
      router.back();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color="#15243A" />
        </Pressable>
        <Text style={styles.headerTitle}>Add another number</Text>
        <View style={styles.headerSpacer} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <View style={styles.card}>
          {step === 'phone' ? (
            <>
              <Text style={styles.copy}>
                Add a second verified number (like your other SIM) so it can also sign in to this same account,
                History, and plan.
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
                onPress={() => void sendCode()}
                disabled={loading || !phone}
                style={({ pressed }) => [
                  styles.primaryButton,
                  (loading || !phone) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{loading ? 'Sending code…' : 'Send code'}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </Pressable>
            </>
          ) : (
            <>
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
                onPress={() => void submitCode()}
                disabled={loading}
                style={({ pressed }) => [styles.primaryButton, loading && styles.disabled, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.primaryText}>{loading ? 'Verifying…' : 'Verify and link'}</Text>
                <Ionicons name="checkmark" size={19} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep('phone');
                  setMessage('');
                }}
                accessibilityRole="button"
                accessibilityLabel="Change phone number"
                style={styles.linkRow}
              >
                <Text style={styles.link}>Change number</Text>
              </Pressable>
            </>
          )}
          {message ? (
            <Text accessibilityLiveRegion="polite" style={styles.message}>
              {message}
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F6F8FC' },
  flex: { flex: 1 },
  header: {
    minHeight: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { color: '#15243A', fontWeight: '800', fontSize: 17 },
  headerSpacer: { width: 24 },
  card: { padding: 24 },
  copy: { color: '#637998', lineHeight: 21 },
  label: { color: '#30435E', fontWeight: '700', marginTop: 22, marginBottom: 8 },
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
  codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
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
  linkRow: { marginTop: 18, alignSelf: 'center' },
  link: { color: '#006DAB', fontWeight: '700' },
  message: { marginTop: 16, color: '#B42318', lineHeight: 19 },
});
