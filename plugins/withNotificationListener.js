const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DEFAULT_PACKAGE_NAME = 'com.noticare.noticareapp';
const TARGET_MESSAGING_PACKAGES = [
  'com.google.android.apps.messaging',
  'com.samsung.android.messaging',
  'com.microsoft.android.smsorganizer',
  'com.android.messaging'
];

const ANDROID_PERMISSIONS = [
  'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE'
];

const addPermissionsToManifest = (manifest) => {
  const usesPermissions = manifest.manifest['uses-permission'] || [];
  ANDROID_PERMISSIONS.forEach((permissionName) => {
    const exists = usesPermissions.some((entry) => entry['$']?.['android:name'] === permissionName);
    if (!exists) {
      usesPermissions.push({ $: { 'android:name': permissionName } });
    }
  });
  manifest.manifest['uses-permission'] = usesPermissions;
};

const addServiceAndActivityToManifest = (manifest) => {
  const application = manifest.manifest.application?.[0];
  if (!application) return manifest;

  const services = application.service || [];
  const activities = application.activity || [];

  const serviceExists = services.some((service) => service['$']?.['android:name'] === '.NotificationCaptureService');
  if (!serviceExists) {
    services.push({
      $: {
        'android:name': '.NotificationCaptureService',
        'android:label': '@string/app_name',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'true'
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.service.notification.NotificationListenerService' } }]
        }
      ]
    });
  }

  const activityExists = activities.some((activity) => activity['$']?.['android:name'] === '.WarningOverlayActivity');
  if (!activityExists) {
    activities.push({
      $: {
        'android:name': '.WarningOverlayActivity',
        'android:exported': 'false',
        'android:excludeFromRecents': 'true',
        'android:taskAffinity': '',
        'android:showOnLockScreen': 'true',
        'android:turnScreenOn': 'true',
        'android:theme': '@style/Theme.AppCompat.Light.NoActionBar'
      }
    });
  }

  application.service = services;
  application.activity = activities;
  return manifest;
};

const writeNativeFiles = async (projectRoot, packageName) => {
  const androidDir = await AndroidConfig.Paths.getProjectPathOrThrowAsync(projectRoot);
  const packagePath = path.join(androidDir, 'app', 'src', 'main', 'java', ...packageName.split('.'));
  if (!fs.existsSync(packagePath)) {
    fs.mkdirSync(packagePath, { recursive: true });
  }

  const serviceCode = `package ${packageName}

import android.app.Notification
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationCaptureService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    super.onNotificationPosted(sbn)

    val packageName = sbn.packageName ?: return
    if (!isTargetMessagingApp(packageName)) return

    val notification = sbn.notification ?: return
    val messageText = extractText(notification) ?: return

    val intent = Intent(this, NotificationCaptureTaskService::class.java).apply {
      putExtra(NotificationCaptureTaskService.EXTRA_MESSAGE_TEXT, messageText)
      putExtra(NotificationCaptureTaskService.EXTRA_SOURCE_PACKAGE, packageName)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      startForegroundService(intent)
    } else {
      startService(intent)
    }
  }

  private fun isTargetMessagingApp(packageName: String): Boolean {
    return listOf(${TARGET_MESSAGING_PACKAGES.map((pkg) => `"${pkg}"`).join(', ')}).contains(packageName)
  }

  private fun extractText(notification: Notification): String? {
    val extras = notification.extras ?: return null
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()
    if (!text.isNullOrBlank()) return text
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
    return bigText?.takeIf { it.isNotBlank() }
  }
}
`;

  const taskServiceCode = `package ${packageName}

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments

class NotificationCaptureTaskService : HeadlessJsTaskService() {
  companion object {
    const val EXTRA_MESSAGE_TEXT = "EXTRA_MESSAGE_TEXT"
    const val EXTRA_SOURCE_PACKAGE = "EXTRA_SOURCE_PACKAGE"
    const val TASK_EVENT_NAME = "NotificationCapture"
  }

  override fun getTaskConfig(intent: Intent?): TaskConfig? {
    val params = Arguments.createMap().apply {
      putString("text", intent?.getStringExtra(EXTRA_MESSAGE_TEXT))
      putString("sourcePackage", intent?.getStringExtra(EXTRA_SOURCE_PACKAGE))
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }
    return TaskConfig(TASK_EVENT_NAME, params, 5000, true)
  }
}
`;

  const moduleCode = `package ${packageName}

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NotificationListenerModule.NAME)
class NotificationListenerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  companion object {
    const val NAME = "NotificationListenerModule"
  }

  override fun getName() = NAME

  @ReactMethod
  fun requestOverlayPermission() {
    val currentActivity: Activity? = currentActivity
    if (currentActivity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:\${getReactApplicationContext().packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      currentActivity.startActivity(intent)
    }
  }

  @ReactMethod
  fun showThreatOverlay(message: String, threatLevel: String) {
    val intent = Intent(getReactApplicationContext(), WarningOverlayActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      putExtra("message", message)
      putExtra("threatLevel", threatLevel)
    }
    getReactApplicationContext().startActivity(intent)
  }
}
`;

  const packageCode = `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.JavaScriptModule
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NotificationListenerPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NotificationListenerModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }

  @Deprecated("Deprecated in RN 0.47+")
  override fun createJSModules(): List<Class<out JavaScriptModule>> {
    return emptyList()
  }
}
`;

  const overlayActivityCode = `package ${packageName}

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView

class WarningOverlayActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
      finish()
      return
    }

    window.addFlags(
      WindowManager.LayoutParams.FLAG_FULLSCREEN or
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
    )

    val message = intent.getStringExtra("message") ?: "Potential high-threat SMS detected"
    val threatLevel = intent.getStringExtra("threatLevel") ?: "High Threat"

    val container = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#cc0000"))
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      setOnClickListener { finish() }
    }

    val content = TextView(this).apply {
      text = "$threatLevel\n\n$message"
      setTextColor(Color.WHITE)
      textSize = 22f
      setPadding(48, 120, 48, 48)
      gravity = Gravity.CENTER
    }

    container.addView(content)
    setContentView(container)
  }
}
`;

  fs.writeFileSync(path.join(packagePath, 'NotificationCaptureService.kt'), serviceCode);
  fs.writeFileSync(path.join(packagePath, 'NotificationCaptureTaskService.kt'), taskServiceCode);
  fs.writeFileSync(path.join(packagePath, 'NotificationListenerModule.kt'), moduleCode);
  fs.writeFileSync(path.join(packagePath, 'NotificationListenerPackage.kt'), packageCode);
  fs.writeFileSync(path.join(packagePath, 'WarningOverlayActivity.kt'), overlayActivityCode);
};

const patchMainApplication = async (projectRoot, packageName) => {
  const mainApplicationPath = AndroidConfig.Paths.getProjectFilePath(projectRoot, 'MainApplication');
  const javaPath = mainApplicationPath && mainApplicationPath.endsWith('.java') ? mainApplicationPath : path.join(AndroidConfig.Paths.getProjectPathOrThrow(projectRoot), 'app', 'src', 'main', 'java', ...packageName.split('.'), 'MainApplication.java');
  const ktPath = mainApplicationPath && mainApplicationPath.endsWith('.kt') ? mainApplicationPath : path.join(AndroidConfig.Paths.getProjectPathOrThrow(projectRoot), 'app', 'src', 'main', 'java', ...packageName.split('.'), 'MainApplication.kt');

  const patchJava = (content) => {
    if (!content.includes('NotificationListenerPackage')) {
      let result = content;
      if (!result.includes(`import ${packageName}.NotificationListenerPackage;`)) {
        result = result.replace(/(import com\.facebook\.react\.ReactApplication;\r?\n)/, `$1import ${packageName}.NotificationListenerPackage;\n`);
      }
      result = result.replace(/(List<ReactPackage> packages = new PackageList\(this\)\.getPackages\(\);\r?\n)/, `$1    packages.add(new NotificationListenerPackage());\n`);
      fs.writeFileSync(javaPath, result, 'utf8');
    }
  };

  const patchKotlin = (content) => {
    if (!content.includes('NotificationListenerPackage')) {
      let result = content;
      if (!result.includes(`import ${packageName}.NotificationListenerPackage`)) {
        result = result.replace(/(import com\.facebook\.react\.ReactApplication\r?\n)/, `$1import ${packageName}.NotificationListenerPackage\n`);
      }
      result = result.replace(/(val packages = PackageList\(this\)\.packages\r?\n)/, `$1    packages.toMutableList().add(NotificationListenerPackage())\n`);
      fs.writeFileSync(ktPath, result, 'utf8');
    }
  };

  if (fs.existsSync(javaPath)) {
    patchJava(fs.readFileSync(javaPath, 'utf8'));
  }
  if (fs.existsSync(ktPath)) {
    patchKotlin(fs.readFileSync(ktPath, 'utf8'));
  }
};

const withNotificationListener = (config) => {
  const packageName = (config.android && config.android.package) || DEFAULT_PACKAGE_NAME;
  config.android = {
    ...config.android,
    package: packageName,
  };

  config = withAndroidManifest(config, (config) => {
    addPermissionsToManifest(config.modResults);
    addServiceAndActivityToManifest(config.modResults);
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      await writeNativeFiles(config.modRequest.projectRoot, packageName);
      await patchMainApplication(config.modRequest.projectRoot, packageName);
      return config;
    }
  ]);

  return config;
};

module.exports = withNotificationListener;
