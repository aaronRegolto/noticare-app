const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const DEFAULT_ANDROID_PACKAGE = 'com.noticare.noticareapp';
const TEMPLATE_ROOT = path.join(__dirname, 'android');
const ACTIVITY_NAME = '.bridge.LinkHandlerActivity';

function asArray(owner, key) {
  const value = owner[key];
  if (!value) {
    owner[key] = [];
  } else if (!Array.isArray(value)) {
    owner[key] = [value];
  }
  return owner[key];
}

function updateManifest(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;

  const activities = asArray(application, 'activity').filter(
    (entry) => entry?.$?.['android:name'] !== ACTIVITY_NAME,
  );

  activities.push({
    $: {
      'android:name': ACTIVITY_NAME,
      'android:exported': 'true',
      'android:excludeFromRecents': 'true',
      'android:launchMode': 'singleTask',
      'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [{ $: { 'android:scheme': 'http' } }, { $: { 'android:scheme': 'https' } }],
      },
    ],
  });

  application.activity = activities;

  // Android 11+ package visibility: without this, PackageManager.queryIntentActivities
  // in BrowserResolver silently returns an empty list on the device, even though other
  // browsers are installed. Merge into the existing <queries> element (asArray(...)[0])
  // instead of replacing it — withNotificationListener already puts its own SMS-related
  // <intent> entries there, and a sibling plugin overwriting that array would silently
  // delete them.
  const queriesRoot = asArray(manifest.manifest, 'queries')[0] ?? {};
  const intents = asArray(queriesRoot, 'intent');
  const hasBrowserQuery = intents.some(
    (entry) =>
      entry?.action?.some((action) => action?.$?.['android:name'] === 'android.intent.action.VIEW') &&
      entry?.data?.some((data) => data?.$?.['android:scheme'] === 'https'),
  );
  if (!hasBrowserQuery) {
    intents.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'https' } }],
    });
  }
  queriesRoot.intent = intents;
  manifest.manifest.queries = [queriesRoot];

  return manifest;
}

function patchMainApplication(contents, language, packageName) {
  const importLine = `import ${packageName}.LinkHandlerPackage`;
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

  if (updated.includes('add(LinkHandlerPackage())')) return updated;

  if (language === 'kt') {
    const marker = 'PackageList(this).packages.apply {';
    if (!updated.includes(marker)) {
      throw new Error('Unable to register LinkHandlerPackage: Kotlin package list was not found.');
    }
    return updated.replace(marker, `${marker}\n              add(LinkHandlerPackage())`);
  }

  const marker = 'List<ReactPackage> packages = new PackageList(this).getPackages();';
  if (!updated.includes(marker)) {
    throw new Error('Unable to register LinkHandlerPackage: Java package list was not found.');
  }
  return updated.replace(marker, `${marker}\n    packages.add(new LinkHandlerPackage());`);
}

const BRIDGE_SOURCE_FILES = [
  'LinkHandlerActivity.kt',
  'UrlChecker.kt',
  'UrlNormalizer.kt',
  'RuleBasedUrlChecker.kt',
  'BrowserResolver.kt',
  'BrowserPreferences.kt',
  'LinkForwarder.kt',
];
const ROOT_SOURCE_FILES = ['LinkHandlerModule.kt', 'LinkHandlerPackage.kt'];

function writeGeneratedSources(androidRoot, packageName) {
  const packageRoot = path.join(androidRoot, 'app', 'src', 'main', 'java', ...packageName.split('.'));
  const bridgeRoot = path.join(packageRoot, 'bridge');
  fs.mkdirSync(bridgeRoot, { recursive: true });

  const copy = (fileName, destinationDir) => {
    const sourcePath = path.join(TEMPLATE_ROOT, fileName);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`NotiCare native template is missing: ${fileName}`);
    }
    const source = fs.readFileSync(sourcePath, 'utf8').replaceAll('__NOTICARE_PACKAGE__', packageName);
    fs.writeFileSync(path.join(destinationDir, fileName), source, 'utf8');
  };

  BRIDGE_SOURCE_FILES.forEach((fileName) => copy(fileName, bridgeRoot));
  ROOT_SOURCE_FILES.forEach((fileName) => copy(fileName, packageRoot));
}

const withLinkHandler = (config) => {
  const packageName = config.android?.package ?? DEFAULT_ANDROID_PACKAGE;

  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = updateManifest(modConfig.modResults);
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
      return modConfig;
    },
  ]);

  return config;
};

module.exports = withLinkHandler;
