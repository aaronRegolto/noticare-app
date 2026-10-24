const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withGradleProperties,
  withMainApplication,
} = require('@expo/config-plugins');

const DEFAULT_ANDROID_PACKAGE = 'com.noticare.noticareapp';
const DATASTORE_DEPENDENCY = 'androidx.datastore:datastore-preferences:1.1.7';
const LITERT_DEPENDENCY = 'com.google.ai.edge.litert:litert:2.1.1';
// On-device text recognition for Manual Scan's photo option. The bundled Latin model works offline
// from first launch, with no Google Play services download.
const MLKIT_TEXT_RECOGNITION_DEPENDENCY = 'com.google.mlkit:text-recognition:16.0.1';
// On-device English/Tagalog translation of captured messages for display. The language models
// (about 30 MB each) download on Wi-Fi when the user picks a message language; language
// identification is bundled.
const MLKIT_TRANSLATE_DEPENDENCY = 'com.google.mlkit:translate:17.0.3';
const MLKIT_LANGUAGE_ID_DEPENDENCY = 'com.google.mlkit:language-id:17.0.6';
const JUNIT_DEPENDENCY = 'junit:junit:4.13.2';
const TEMPLATE_ROOT = path.join(__dirname, 'android');

// Components from the previous Headless-JS/accessibility implementation.
const LEGACY_SERVICES = new Set([
  '.NotificationCaptureService',
  '.NotificationCaptureTaskService',
  '.MessagingNotificationListener',
  '.NotificationRelayService',
  '.NotificationBridgeService',
  '.realtime.MessagingNotificationListener',
]);

const LEGACY_ACTIVITIES = new Set(['.WarningOverlayActivity', '.ui.AlertActivity', '.ui.ThreatDetailsActivity']);

// These APIs would grant broad SMS access or support an accessibility-based
// implementation. Keep the removal defensive so a dependency or a stale
// generated manifest cannot accidentally expand the scanner's scope.
const DISALLOWED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  // BIND_NOTIFICATION_LISTENER_SERVICE belongs on the service declaration; it
  // is not an app-level permission request.
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  // Google Play restricts this to a short list of app types. NotiCare sends users to App info
  // (Battery > Unrestricted) instead, which needs no permission.
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];
const DISALLOWED_PERMISSION_SET = new Set(DISALLOWED_PERMISSIONS);
// Previously disallowed; older prebuilds left removal directives for these in
// src/debug, which would still strip them from the debug APK.
const FORMERLY_DISALLOWED_PERMISSIONS = ['android.permission.SYSTEM_ALERT_WINDOW'];
const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

function asArray(owner, key) {
  const value = owner[key];
  if (!value) {
    owner[key] = [];
  } else if (!Array.isArray(value)) {
    owner[key] = [value];
  }
  return owner[key];
}

function uniqueByAndroidName(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const name = entry?.$?.['android:name'];
    if (!name || seen.has(name)) return !name;
    seen.add(name);
    return true;
  });
}

function updateManifest(manifest) {
  // Removing a permission from the generated source manifest does not stop a
  // dependency from adding it during Android manifest merging. Keep explicit
  // removal markers in the app manifest so the packaged APK cannot inherit an
  // broad-SMS, accessibility, foreground-service, or app-level
  // notification-listener permission.
  manifest.manifest.$ = {
    ...manifest.manifest.$,
    'xmlns:tools': manifest.manifest.$?.['xmlns:tools'] ?? TOOLS_NAMESPACE,
  };
  const permissions = asArray(manifest.manifest, 'uses-permission').filter(
    (entry) =>
      !DISALLOWED_PERMISSION_SET.has(entry?.$?.['android:name']) &&
      // Drop stale removal markers left by older prebuilds for permissions now in use.
      !(FORMERLY_DISALLOWED_PERMISSIONS.includes(entry?.$?.['android:name']) && entry?.$?.['tools:node'] === 'remove'),
  );

  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.POST_NOTIFICATIONS')) {
    permissions.push({ $: { 'android:name': 'android.permission.POST_NOTIFICATIONS' } });
  }
  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.READ_CONTACTS')) {
    permissions.push({ $: { 'android:name': 'android.permission.READ_CONTACTS' } });
  }
  // Lets the danger-warning notification launch ThreatWarningActivity directly (full-screen when
  // the phone is locked or the screen is off, a heads-up banner otherwise) instead of a plain
  // `startActivity` call from this background service, which Android 10+ blocks almost always.
  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.USE_FULL_SCREEN_INTENT')) {
    permissions.push({ $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' } });
  }
  // "Display over other apps": lets ThreatWarningOverlay cover whatever app is in use when a
  // threat is detected. User-granted in Settings, and only used when Full-screen warning is on.
  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.SYSTEM_ALERT_WINDOW')) {
    permissions.push({ $: { 'android:name': 'android.permission.SYSTEM_ALERT_WINDOW' } });
  }
  for (const permission of DISALLOWED_PERMISSIONS) {
    permissions.push({
      $: {
        'android:name': permission,
        'tools:node': 'remove',
      },
    });
  }
  manifest.manifest['uses-permission'] = uniqueByAndroidName(permissions);
  // Merge into the existing <queries> element instead of replacing it outright —
  // withLinkHandler also adds an <intent> entry there, and unconditionally overwriting
  // this array (as an earlier version of this plugin did) silently deletes whichever
  // plugin's manifest mod ran first, regardless of the order in app.config.js.
  const queriesRoot = asArray(manifest.manifest, 'queries')[0] ?? {};
  const queriedPackages = asArray(queriesRoot, 'package').filter(
    (entry) => entry?.$?.['android:name'] !== 'com.whatsapp',
  );
  for (const packageName of ['com.facebook.orca']) {
    if (!queriedPackages.some((entry) => entry?.$?.['android:name'] === packageName)) {
      queriedPackages.push({ $: { 'android:name': packageName } });
    }
  }
  queriesRoot.package = queriedPackages;
  const smsIntents = asArray(queriesRoot, 'intent');
  const hasSmsDeliverQuery = smsIntents.some((entry) =>
    entry?.action?.some((action) => action?.$?.['android:name'] === 'android.provider.Telephony.SMS_DELIVER'),
  );
  if (!hasSmsDeliverQuery) {
    smsIntents.push(
      { action: [{ $: { 'android:name': 'android.provider.Telephony.SMS_DELIVER' } }] },
      {
        action: [{ $: { 'android:name': 'android.intent.action.SENDTO' } }],
        data: [{ $: { 'android:scheme': 'smsto' } }],
      },
    );
  }
  queriesRoot.intent = smsIntents;
  manifest.manifest.queries = [queriesRoot];
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;

  const services = asArray(application, 'service').filter((entry) => !LEGACY_SERVICES.has(entry?.$?.['android:name']));
  const activities = asArray(application, 'activity').filter(
    (entry) => !LEGACY_ACTIVITIES.has(entry?.$?.['android:name']),
  );

  const listenerName = '.bridge.SmsNotificationListener';
  const existingListener = services.find((entry) => entry?.$?.['android:name'] === listenerName);
  if (!existingListener) {
    services.push({
      $: {
        'android:name': listenerName,
        'android:exported': 'true',
        'android:label': '@string/app_name',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:process': ':notification_listener',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }],
        },
      ],
    });
  } else {
    existingListener.$ = {
      ...existingListener.$,
      'android:exported': 'true',
      'android:label': '@string/app_name',
      'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      'android:process': ':notification_listener',
    };
  }

  application.service = uniqueByAndroidName(services);
  const warningActivityName = '.bridge.ThreatWarningActivity';
  const warningActivity = activities.find((entry) => entry?.$?.['android:name'] === warningActivityName);
  if (!warningActivity) {
    activities.push({
      $: {
        'android:name': warningActivityName,
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:launchMode': 'singleTop',
        'android:showWhenLocked': 'true',
        'android:turnScreenOn': 'true',
        'android:theme': '@style/AppTheme',
        'android:process': ':notification_listener',
      },
    });
  } else {
    warningActivity.$ = { ...warningActivity.$, 'android:process': ':notification_listener' };
  }
  const receiverName = '.bridge.ThreatDecisionReceiver';
  const receivers = asArray(application, 'receiver');
  if (!receivers.some((entry) => entry?.$?.['android:name'] === receiverName)) {
    receivers.push({
      $: {
        'android:name': receiverName,
        'android:exported': 'false',
        'android:process': ':notification_listener',
      },
    });
  } else {
    const receiver = receivers.find((entry) => entry?.$?.['android:name'] === receiverName);
    receiver.$ = { ...receiver.$, 'android:process': ':notification_listener' };
  }
  application.activity = uniqueByAndroidName(activities);
  application.receiver = uniqueByAndroidName(receivers);
  return manifest;
}

function addDataStoreDependency(contents) {
  const missingLines = [];
  if (!contents.includes(DATASTORE_DEPENDENCY)) {
    missingLines.push(`    implementation(\"${DATASTORE_DEPENDENCY}\")`);
  }
  if (!contents.includes(LITERT_DEPENDENCY)) {
    missingLines.push(`    implementation(\"${LITERT_DEPENDENCY}\")`);
  }
  if (!contents.includes(MLKIT_TEXT_RECOGNITION_DEPENDENCY)) {
    missingLines.push(`    implementation(\"${MLKIT_TEXT_RECOGNITION_DEPENDENCY}\")`);
  }
  for (const dependency of [MLKIT_TRANSLATE_DEPENDENCY, MLKIT_LANGUAGE_ID_DEPENDENCY]) {
    if (!contents.includes(dependency)) missingLines.push(`    implementation(\"${dependency}\")`);
  }
  if (!contents.includes(JUNIT_DEPENDENCY)) {
    missingLines.push(`    testImplementation(\"${JUNIT_DEPENDENCY}\")`);
  }
  if (missingLines.length === 0) return contents;

  const dependenciesBlock = /dependencies\s*\{/;
  if (!dependenciesBlock.test(contents)) {
    throw new Error('Unable to add the NotiCare DataStore dependency: dependencies block was not found.');
  }
  return contents.replace(dependenciesBlock, (match) => `${match}\n${missingLines.join('\n')}`);
}

function enableReleaseShrinking(properties) {
  const releaseProperties = ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds'];

  for (const key of releaseProperties) {
    const existing = properties.find((property) => property.type === 'property' && property.key === key);
    if (existing) {
      existing.value = 'true';
    } else {
      properties.push({ type: 'property', key, value: 'true' });
    }
  }

  return properties;
}

function patchMainApplication(contents, language, packageName) {
  const importLine = `import ${packageName}.NotificationListenerPackage`;
  let updated = contents;

  if (!updated.includes(importLine)) {
    if (language === 'kt') {
      updated = updated.replace(
        'import com.facebook.react.ReactApplication',
        `import com.facebook.react.ReactApplication\n${importLine}`,
      );
    } else {
      updated = updated.replace(
        'import com.facebook.react.ReactApplication;',
        `import com.facebook.react.ReactApplication;\n${importLine};`,
      );
    }
  }

  if (!updated.includes('add(NotificationListenerPackage())') && language === 'kt') {
    const marker = 'PackageList(this).packages.apply {';
    if (!updated.includes(marker)) {
      throw new Error('Unable to register NotificationListenerPackage: Kotlin package list was not found.');
    }
    updated = updated.replace(marker, `${marker}\n              add(NotificationListenerPackage())`);
  } else if (!updated.includes('add(NotificationListenerPackage())')) {
    const marker = 'List<ReactPackage> packages = new PackageList(this).getPackages();';
    if (!updated.includes(marker)) {
      throw new Error('Unable to register NotificationListenerPackage: Java package list was not found.');
    }
    updated = updated.replace(marker, `${marker}\n    packages.add(new NotificationListenerPackage());`);
  }

  if (language !== 'kt') {
    throw new Error('Unable to isolate the notification listener process: MainApplication must use Kotlin.');
  }
  if (!updated.includes('isNotificationListenerProcess()')) {
    const lifecycleMarker = '    loadReactNative(this)\n    ApplicationLifecycleDispatcher.onApplicationCreate(this)';
    if (!updated.includes(lifecycleMarker)) {
      throw new Error(
        'Unable to isolate the notification listener process: Kotlin application lifecycle was not found.',
      );
    }
    updated = updated.replace(
      lifecycleMarker,
      `    if (!isNotificationListenerProcess()) {\n      loadReactNative(this)\n      ApplicationLifecycleDispatcher.onApplicationCreate(this)\n    }`,
    );
    const configurationMarker = '    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)';
    if (!updated.includes(configurationMarker)) {
      throw new Error(
        'Unable to isolate the notification listener process: Kotlin configuration lifecycle was not found.',
      );
    }
    updated = updated.replace(
      configurationMarker,
      `    if (!isNotificationListenerProcess()) {\n      ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)\n    }`,
    );
  }

  const processHelper = `  private fun isNotificationListenerProcess(): Boolean {
    val processName = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
      android.app.Application.getProcessName()
    } else {
      val activityManager = getSystemService(android.app.ActivityManager::class.java) ?: return false
      val processId = android.os.Process.myPid()
      activityManager.runningAppProcesses
        ?.firstOrNull { process -> process.pid == processId }
        ?.processName
        ?: return false
    }
    return processName.endsWith(":notification_listener")
  }`;
  const processHelperPattern = /  private fun isNotificationListenerProcess\(\): Boolean \{[\s\S]*?\n  \}/;
  if (processHelperPattern.test(updated)) {
    updated = updated.replace(processHelperPattern, processHelper);
  } else {
    const classEnd = updated.lastIndexOf('\n}');
    if (classEnd < 0) {
      throw new Error('Unable to isolate the notification listener process: Kotlin application class was not found.');
    }
    updated = `${updated.slice(0, classEnd)}\n\n${processHelper}${updated.slice(classEnd)}`;
  }
  return updated;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureToolsNamespace(contents) {
  if (/\bxmlns:tools\s*=/.test(contents)) return contents;
  return contents.replace(
    /<manifest\b([^>]*)>/,
    (match, attributes) => `<manifest${attributes} xmlns:tools="${TOOLS_NAMESPACE}">`,
  );
}

function permissionRemovalDirective(permission) {
  return `  <uses-permission android:name="${permission}" tools:node="remove"/>`;
}

/**
 * Expo's development-client debug manifest has higher merge priority than the
 * app's main manifest. Put the same removals in src/debug so they win at that merge layer too. This keeps
 * the development APK aligned with the release privacy boundary.
 */
function patchDebugManifest(androidRoot) {
  const debugManifestPath = path.join(androidRoot, 'app', 'src', 'debug', 'AndroidManifest.xml');
  let contents = fs.existsSync(debugManifestPath)
    ? fs.readFileSync(debugManifestPath, 'utf8')
    : `<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="${TOOLS_NAMESPACE}">\n</manifest>\n`;
  contents = ensureToolsNamespace(contents);

  // Normalize existing permission declarations first, then place a single
  // ordered removal block before <application>. Non-clean prebuild preserves
  // src/debug, so this also repairs an older plugin output on the next run.
  for (const permission of [...DISALLOWED_PERMISSIONS, ...FORMERLY_DISALLOWED_PERMISSIONS]) {
    const permissionPattern = new RegExp(
      `<uses-permission\\b(?=[^>]*\\bandroid:name\\s*=\\s*["']${escapeRegExp(permission)}["'])[^>]*\\/?\\s*>\\s*`,
      'g',
    );
    contents = contents.replace(permissionPattern, '');
  }

  const applicationMatch = /<application\b/.exec(contents);
  const closingManifest = '</manifest>';
  const insertionAt = applicationMatch?.index ?? contents.lastIndexOf(closingManifest);
  if (insertionAt < 0) {
    throw new Error('Unable to add debug permission removals: manifest closing tag was not found.');
  }
  const removals = `${DISALLOWED_PERMISSIONS.map(permissionRemovalDirective).join('\n')}\n`;
  contents = `${contents.slice(0, insertionAt)}${removals}${contents.slice(insertionAt)}`;

  fs.mkdirSync(path.dirname(debugManifestPath), { recursive: true });
  fs.writeFileSync(debugManifestPath, contents, 'utf8');
}

function writeGeneratedSources(androidRoot, packageName) {
  const sourceRoot = path.join(androidRoot, 'app', 'src', 'main', 'java', ...packageName.split('.'));
  const testSourceRoot = path.join(androidRoot, 'app', 'src', 'test', 'java', ...packageName.split('.'));
  const mappings = [
    ['NotificationListenerModule.kt', path.join(sourceRoot, 'NotificationListenerModule.kt')],
    ['NotificationListenerPackage.kt', path.join(sourceRoot, 'NotificationListenerPackage.kt')],
    ['EncryptedHistoryStore.kt', path.join(sourceRoot, 'bridge', 'EncryptedHistoryStore.kt')],
    ['EncryptedTelemetryQueue.kt', path.join(sourceRoot, 'bridge', 'EncryptedTelemetryQueue.kt')],
    ['EncryptedCommunityReportQueue.kt', path.join(sourceRoot, 'bridge', 'EncryptedCommunityReportQueue.kt')],
    ['NotiCareNotifications.kt', path.join(sourceRoot, 'bridge', 'NotiCareNotifications.kt')],
    ['RealtimeScanPreferences.kt', path.join(sourceRoot, 'bridge', 'RealtimeScanPreferences.kt')],
    ['ProcessSafeFileLock.kt', path.join(sourceRoot, 'bridge', 'ProcessSafeFileLock.kt')],
    ['ScanRuntime.kt', path.join(sourceRoot, 'bridge', 'ScanRuntime.kt')],
    ['SmishingEvaluator.kt', path.join(sourceRoot, 'bridge', 'SmishingEvaluator.kt')],
    ['V3RiskEvaluator.kt', path.join(sourceRoot, 'bridge', 'V3RiskEvaluator.kt')],
    ['SmsNotificationListener.kt', path.join(sourceRoot, 'bridge', 'SmsNotificationListener.kt')],
    ['NotificationInput.kt', path.join(sourceRoot, 'bridge', 'NotificationInput.kt')],
    ['ThreatDecisionReceiver.kt', path.join(sourceRoot, 'bridge', 'ThreatDecisionReceiver.kt')],
    ['ThreatWarningActivity.kt', path.join(sourceRoot, 'bridge', 'ThreatWarningActivity.kt')],
    ['ThreatWarningView.kt', path.join(sourceRoot, 'bridge', 'ThreatWarningView.kt')],
    ['ThreatWarningOverlay.kt', path.join(sourceRoot, 'bridge', 'ThreatWarningOverlay.kt')],
    ['BlockedMessageStore.kt', path.join(sourceRoot, 'bridge', 'BlockedMessageStore.kt')],
    ['ThreatModels.kt', path.join(sourceRoot, 'bridge', 'ThreatModels.kt')],
    ['MessageCategories.kt', path.join(sourceRoot, 'bridge', 'MessageCategories.kt')],
    ['NotificationSource.kt', path.join(sourceRoot, 'bridge', 'NotificationSource.kt')],
    ['SenderContactLookup.kt', path.join(sourceRoot, 'bridge', 'SenderContactLookup.kt')],
    ['RepeatSenderScorer.kt', path.join(sourceRoot, 'bridge', 'RepeatSenderScorer.kt')],
    ['MessageTranslator.kt', path.join(sourceRoot, 'bridge', 'MessageTranslator.kt')],
    ['WarningCopy.kt', path.join(sourceRoot, 'bridge', 'WarningCopy.kt')],
    ['SmishingEvaluatorParityTest.kt', path.join(testSourceRoot, 'bridge', 'SmishingEvaluatorParityTest.kt')],
    ['V3RiskEvaluatorTest.kt', path.join(testSourceRoot, 'bridge', 'V3RiskEvaluatorTest.kt')],
    ['NotificationInputTest.kt', path.join(testSourceRoot, 'bridge', 'NotificationInputTest.kt')],
    ['ModelEvaluationTest.kt', path.join(testSourceRoot, 'bridge', 'ModelEvaluationTest.kt')],
    ['BlockedMessageStoreTest.kt', path.join(testSourceRoot, 'bridge', 'BlockedMessageStoreTest.kt')],
    ['ProcessSafeFileLockTest.kt', path.join(testSourceRoot, 'bridge', 'ProcessSafeFileLockTest.kt')],
    ['WarningCopyTest.kt', path.join(testSourceRoot, 'bridge', 'WarningCopyTest.kt')],
    ['MessageCategoriesTest.kt', path.join(testSourceRoot, 'bridge', 'MessageCategoriesTest.kt')],
    ['NotificationSourceTest.kt', path.join(testSourceRoot, 'bridge', 'NotificationSourceTest.kt')],
    ['RepeatSenderScorerTest.kt', path.join(testSourceRoot, 'bridge', 'RepeatSenderScorerTest.kt')],
    ['SenderContactLookupTest.kt', path.join(testSourceRoot, 'bridge', 'SenderContactLookupTest.kt')],
    ['ThreatModelsTest.kt', path.join(testSourceRoot, 'bridge', 'ThreatModelsTest.kt')],
  ];

  for (const [templatePath, destinationPath] of mappings) {
    const sourcePath = path.join(TEMPLATE_ROOT, templatePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`NotiCare native template is missing: ${templatePath}`);
    }
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    const source = fs.readFileSync(sourcePath, 'utf8').replaceAll('__NOTICARE_PACKAGE__', packageName);
    fs.writeFileSync(destinationPath, source, 'utf8');
  }

  const projectRoot = path.dirname(androidRoot);
  const assetsRoot = path.join(androidRoot, 'app', 'src', 'main', 'assets');
  for (const assetName of ['noticare_smishing_v3.tflite', 'model_metadata.json']) {
    const sourcePath = path.join(projectRoot, 'assets', 'models', assetName);
    const destinationPath = path.join(assetsRoot, assetName);
    if (!fs.existsSync(sourcePath)) throw new Error(`NotiCare model asset is missing: ${sourcePath}`);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
  }

  for (const legacyRelativePath of [
    'NotificationCaptureService.kt',
    'NotificationCaptureTaskService.kt',
    'WarningOverlayActivity.kt',
    'bridge/NotificationCaptureTaskService.kt',
    'ui/ThreatDetailsActivity.kt',
  ]) {
    const legacyPath = path.join(sourceRoot, legacyRelativePath);
    if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath, { force: true });
  }
}

const withNotificationListener = (config) => {
  const packageName = config.android?.package ?? DEFAULT_ANDROID_PACKAGE;

  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = updateManifest(modConfig.modResults);
    return modConfig;
  });

  config = withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = addDataStoreDependency(modConfig.modResults.contents);
    return modConfig;
  });

  config = withGradleProperties(config, (modConfig) => {
    modConfig.modResults = enableReleaseShrinking(modConfig.modResults);
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    modConfig.modResults.contents = patchMainApplication(
      modConfig.modResults.contents,
      modConfig.modResults.language,
      packageName,
    );
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const androidRoot = await AndroidConfig.Paths.getProjectPathOrThrowAsync(modConfig.modRequest.projectRoot);
      writeGeneratedSources(androidRoot, packageName);
      patchDebugManifest(androidRoot);
      return modConfig;
    },
  ]);

  return config;
};

module.exports = withNotificationListener;
