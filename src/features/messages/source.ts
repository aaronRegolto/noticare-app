export const MESSENGER_PACKAGE = 'com.facebook.orca';

export type MessageSource = 'messages' | 'messenger';

export function messageSourceForPackage(packageName: string): MessageSource {
  return packageName === MESSENGER_PACKAGE ? 'messenger' : 'messages';
}

export function messageSourceLabel(source: MessageSource): string {
  return source === 'messenger' ? 'Messenger' : 'Messages';
}
