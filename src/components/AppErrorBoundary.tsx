import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { logError } from '@/src/services/logger';

type Props = { children: React.ReactNode };
type State = { failed: boolean };

/** Keeps an unexpected UI exception from exposing diagnostic detail to the user. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    logError('ui-boundary', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.page}>
        <Text style={styles.title}>NotiCare needs to restart this screen</Text>
        <Text style={styles.copy}>No message content was shared. Try reopening the screen.</Text>
        <Pressable onPress={() => this.setState({ failed: false })} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#F6F8FC' },
  title: { color: '#1E2D43', fontWeight: '800', fontSize: 20, textAlign: 'center' },
  copy: { color: '#607A9B', textAlign: 'center', lineHeight: 20, marginTop: 9 },
  button: { backgroundColor: '#1E2D43', borderRadius: 9, paddingHorizontal: 18, paddingVertical: 12, marginTop: 18 },
  buttonText: { color: '#fff', fontWeight: '800' },
});
