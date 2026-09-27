const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const DEFAULT_ANDROID_PACKAGE = 'com.noticare.noticareapp';
const DATASTORE_DEPENDENCY = 'androidx.datastore:datastore-preferences:1.1.7';
const LITERT_DEPENDENCY = 'com.google.ai.edge.litert:litert:2.1.1';
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

// These APIs would either grant broad SMS access or support the removed overlay/
// accessibility implementation. Keep the removal defensive so a dependency or a
// stale generated manifest cannot accidentally expand the scanner's scope.
const DISALLOWED_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.SEND_SMS',
  'android.permission.BIND_ACCESSIBILITY_SERVICE',
  // BIND_NOTIFICATION_LISTENER_SERVICE belongs on the service declaration; it
  // is not an app-level permission request.
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
];
const DISALLOWED_PERMISSION_SET = new Set(DISALLOWED_PERMISSIONS);
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
  // overlay, broad-SMS, accessibility, foreground-service, or app-level
  // notification-listener permission.
  manifest.manifest.$ = {
    ...manifest.manifest.$,
    'xmlns:tools': manifest.manifest.$?.['xmlns:tools'] ?? TOOLS_NAMESPACE,
  };
  const permissions = asArray(manifest.manifest, 'uses-permission').filter(
    (entry) => !DISALLOWED_PERMISSION_SET.has(entry?.$?.['android:name']),
  );

  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.POST_NOTIFICATIONS')) {
    permissions.push({ $: { 'android:name': 'android.permission.POST_NOTIFICATIONS' } });
  }
  // Lets the app open the system "ignore battery optimizations" prompt for itself. Without this
  // exemption, OEM battery managers (notably ColorOS/Realme) can kill the app in the background,
  // taking the bound notification listener down with it until Android restarts the service —
  // which can take well over a minute and silently misses SMS notifications in the meantime.
  if (
    !permissions.some(
      (entry) => entry?.$?.['android:name'] === 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    )
  ) {
    permissions.push({ $: { 'android:name': 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS' } });
  }
  // Lets the danger-warning notification launch ThreatWarningActivity directly (full-screen when
  // the phone is locked or the screen is off, a heads-up banner otherwise) instead of a plain
  // `startActivity` call from this background service, which Android 10+ blocks almost always.
  if (!permissions.some((entry) => entry?.$?.['android:name'] === 'android.permission.USE_FULL_SCREEN_INTENT')) {
    permissions.push({ $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' } });
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
    };
  }

  application.service = uniqueByAndroidName(services);
  const warningActivityName = '.bridge.ThreatWarningActivity';
  if (!activities.some((entry) => entry?.$?.['android:name'] === warningActivityName)) {
    activities.push({
      $: {
        'android:name': warningActivityName,
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:launchMode': 'singleTop',
        'android:showWhenLocked': 'true',
        'android:turnScreenOn': 'true',
        'android:theme': '@style/AppTheme',
      },
    });
  }
  const receiverName = '.bridge.ThreatDecisionReceiver';
  const receivers = asArray(application, 'receiver');
  if (!receivers.some((entry) => entry?.$?.['android:name'] === receiverName)) {
    receivers.push({ $: { 'android:name': receiverName, 'android:exported': 'false' } });
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

  if (updated.includes('add(NotificationListenerPackage())')) return updated;

  if (language === 'kt') {
    const marker = 'PackageList(this).packages.apply {';
    if (!updated.includes(marker)) {
      throw new Error('Unable to register NotificationListenerPackage: Kotlin package list was not found.');
    }
    return updated.replace(marker, `${marker}\n              add(NotificationListenerPackage())`);
  }

  const marker = 'List<ReactPackage> packages = new PackageList(this).getPackages();';
  if (!updated.includes(marker)) {
    throw new Error('Unable to register NotificationListenerPackage: Java package list was not found.');
  }
  return updated.replace(marker, `${marker}\n    packages.add(new NotificationListenerPackage());`);
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
 * app's main manifest and contributes SYSTEM_ALERT_WINDOW by default. Put the
 * same removals in src/debug so they win at that merge layer too. This keeps
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
  for (const permission of DISALLOWED_PERMISSIONS) {
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
    ['ScanRuntime.kt', path.join(sourceRoot, 'bridge', 'ScanRuntime.kt')],
    ['SmishingEvaluator.kt', path.join(sourceRoot, 'bridge', 'SmishingEvaluator.kt')],
    ['V3RiskEvaluator.kt', path.join(sourceRoot, 'bridge', 'V3RiskEvaluator.kt')],
    ['SmsNotificationListener.kt', path.join(sourceRoot, 'bridge', 'SmsNotificationListener.kt')],
    ['NotificationInput.kt', path.join(sourceRoot, 'bridge', 'NotificationInput.kt')],
    ['ThreatDecisionReceiver.kt', path.join(sourceRoot, 'bridge', 'ThreatDecisionReceiver.kt')],
    ['ThreatWarningActivity.kt', path.join(sourceRoot, 'bridge', 'ThreatWarningActivity.kt')],
    ['ThreatModels.kt', path.join(sourceRoot, 'bridge', 'ThreatModels.kt')],
    ['SmishingEvaluatorParityTest.kt', path.join(testSourceRoot, 'bridge', 'SmishingEvaluatorParityTest.kt')],
    ['V3RiskEvaluatorTest.kt', path.join(testSourceRoot, 'bridge', 'V3RiskEvaluatorTest.kt')],
    ['NotificationInputTest.kt', path.join(testSourceRoot, 'bridge', 'NotificationInputTest.kt')],
    ['ModelEvaluationTest.kt', path.join(testSourceRoot, 'bridge', 'ModelEvaluationTest.kt')],
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
