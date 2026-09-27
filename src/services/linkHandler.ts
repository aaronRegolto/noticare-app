import { NativeModules, Platform } from 'react-native';

export type InstalledBrowser = {
  packageName: string;
  label: string;
  /** True for the browser SAFE links currently open in: the saved choice, or the resolved default. */
  isPreferred: boolean;
};

type LinkHandlerNativeModule = {
  getInstalledBrowsers(): Promise<InstalledBrowser[]>;
  setPreferredBrowser(packageName: string): Promise<boolean>;
  openInRealBrowser(url: string): Promise<boolean>;
  isDefaultBrowser(): Promise<boolean>;
  requestDefaultBrowser(): Promise<boolean>;
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

/** Forwards a link the user explicitly chose to open despite a warning. Rejects if that fails. */
export function openInRealBrowser(url: string): Promise<boolean> {
  return requireAndroidNativeModule().openInRealBrowser(url);
}

/** Whether NotiCare is currently set as the device's default browser. */
export function isDefaultBrowser(): Promise<boolean> {
  return requireAndroidNativeModule().isDefaultBrowser();
}

/** Opens Android's "set as default browser" role request (10+) or default-apps settings (older). */
export function requestDefaultBrowser(): Promise<boolean> {
  return requireAndroidNativeModule().requestDefaultBrowser();
}
