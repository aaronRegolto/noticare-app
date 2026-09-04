import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

export function AppSplash() {
  return (
    <View style={styles.page}>
      <View style={styles.icon}>
        <Ionicons name="shield-checkmark" size={54} color="#00C88B" />
      </View>
      <Text style={styles.name}>NotiCare</Text>
      <Text style={styles.copy}>Smishing Shield</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E2D43' },
  icon: {
    width: 92,
    height: 92,
    borderRadius: 26,
    backgroundColor: '#30435E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 20 },
  copy: { color: '#CBD7E8', fontSize: 15, marginTop: 5 },
});
