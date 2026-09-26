import { createRef } from 'react';
import type { View } from 'react-native';

/**
 * Refs to specific bottom tab bar buttons, so screens rendered inside a tab
 * (e.g. the Dashboard's guided tour) can point a spotlight at a tab bar icon.
 * The tab bar is rendered by the Tabs navigator, a sibling of any given
 * screen's own component tree, so a screen has no ordinary way to reach it —
 * `app/(tabs)/_layout.tsx` attaches these via a custom `tabBarButton`.
 */
export const messagesTabRef = createRef<View>();

type TourTab = 'messages' | null;

let activeTourTab: TourTab = null;
const listeners = new Set<() => void>();

export function setActiveTourTab(tab: TourTab) {
  if (activeTourTab === tab) return;
  activeTourTab = tab;
  listeners.forEach((listener) => listener());
}

export function subscribeToActiveTourTab(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveTourTab() {
  return activeTourTab;
}
