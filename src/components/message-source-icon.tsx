import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import Ionicons from '@expo/vector-icons/Ionicons';

import type { MessageSource } from '@/src/features/messages/source';

export function MessageSourceIcon({ source, size }: { source: MessageSource; size: number }) {
  return source === 'messenger' ? (
    <FontAwesome5 name="facebook-messenger" size={size} color="#0084FF" />
  ) : (
    <Ionicons name="chatbubble-ellipses-outline" size={size} color="#7186A4" />
  );
}
