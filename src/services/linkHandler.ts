import { NativeModules, Platform } from 'react-native';

export type InstalledBrowser = {
  packageName: string;
  label: string;
  /** True for the browser SAFE links currently open in: the saved choice, or the resolved default. */
  isPreferred: boolean;
};

/**
 * granted: NotiCare is now the default browser. declined: the user said no in Android's dialog
 * (after declining, Android may stop showing it). settings: Android's Default apps screen opened
 * instead, so the result is known only once the user returns.
 */
export type DefaultBrowserRequestResult = 'granted' | 'declined' | 'settings';

type LinkHandlerNativeModule = {
  getInstalledBrowsers(): Promise<InstalledBrowser[]>;
  setPreferredBrowser(packageName: string): Promise<boolean>;
  isDefaultBrowser(): Promise<boolean>;
  requestDefaultBrowser(): Promise<DefaultBrowserRequestResult>;
  openDefaultAppsSettings(): Promise<boolean>;
};

const nativeModule = NativeModules.LinkHandlerModule as LinkHandlerNativeModule | undefined;

function requireAndroidNativeModule(): LinkHandlerNativeModule {
  if (Platform.OS !== 'android') {
    throw new Error('NotiCare link protection is available on Android only.');
  }
  if (!nativeModule) {
    throw new Error(
      'NotiCare native link protection is unavailable. Install an Android development or release build; Expo Go cannot run it.',
    );
  }
  return nativeModule;
}

/** True only in an Android development/release build containing the Kotlin module. */
export function isNativeLinkHandlerAvailable(): boolean {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

/** Every browser installed on the device that safe links can be opened in. */
export function getInstalledBrowsers(): Promise<InstalledBrowser[]> {
  return requireAndroidNativeModule().getInstalledBrowsers();
}

/** Saves which browser safe links should open in going forward. */
export function setPreferredBrowser(packageName: string): Promise<boolean> {
  return requireAndroidNativeModule().setPreferredBrowser(packageName);
}

/** Whether NotiCare is currently set as the device's default browser. */
export function isDefaultBrowser(): Promise<boolean> {
  return requireAndroidNativeModule().isDefaultBrowser();
}

/** Shows Android's "Set NotiCare as your default browser app?" dialog (10+) or Default apps settings (older). */
export function requestDefaultBrowser(): Promise<DefaultBrowserRequestResult> {
  return requireAndroidNativeModule().requestDefaultBrowser();
}

/** Opens Android's Default apps screen, to pick or change the default browser by hand. */
export function openDefaultAppsSettings(): Promise<boolean> {
  return requireAndroidNativeModule().openDefaultAppsSettings();
}
