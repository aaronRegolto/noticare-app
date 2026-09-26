const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

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
  return manifest;
}

function writeGeneratedSources(androidRoot, packageName) {
  const sourceRoot = path.join(androidRoot, 'app', 'src', 'main', 'java', ...packageName.split('.'));
  const destinationPath = path.join(sourceRoot, 'bridge', 'LinkHandlerActivity.kt');
  const sourcePath = path.join(TEMPLATE_ROOT, 'LinkHandlerActivity.kt');
  if (!fs.existsSync(sourcePath)) {
    throw new Error('NotiCare native template is missing: LinkHandlerActivity.kt');
  }
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  const source = fs.readFileSync(sourcePath, 'utf8').replaceAll('__NOTICARE_PACKAGE__', packageName);
  fs.writeFileSync(destinationPath, source, 'utf8');
}

const withLinkHandler = (config) => {
  const packageName = config.android?.package ?? DEFAULT_ANDROID_PACKAGE;

  config = withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = updateManifest(modConfig.modResults);
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
