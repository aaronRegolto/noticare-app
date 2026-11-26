import { Alert } from 'react-native';
import type { WarningCopy } from '@/src/features/translation/warningCopy';

type CommunityReportConsentCopy = Pick<
  WarningCopy,
  'reportConsentTitle' | 'reportConsentMessage' | 'reportConsentCancel' | 'reportConsentConfirm'
>;

export async function confirmCommunityReport(
  messageText: string,
  report: () => Promise<void>,
  copy: CommunityReportConsentCopy,
): Promise<boolean> {
  const consented = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (consented: boolean) => {
      if (settled) return;
      settled = true;
      resolve(consented);
    };

    Alert.alert(
      copy.reportConsentTitle,
      copy.reportConsentMessage(messageText),
      [
        { text: copy.reportConsentCancel, style: 'cancel', onPress: () => finish(false) },
        { text: copy.reportConsentConfirm, onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
  if (!consented) return false;
  await report();
  return true;
}
