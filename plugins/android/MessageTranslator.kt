package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions

/**
 * Display-only translation of captured messages between English and Tagalog, entirely on this
 * device with ML Kit. Scanning always uses the original text; this never changes a result.
 * Callers run these blocking calls off the main thread.
 */
object MessageTranslator {
  private val languages = setOf(TranslateLanguage.ENGLISH, TranslateLanguage.TAGALOG)

  class WifiRequiredException : Exception("Connect to Wi-Fi to download the language pack.")

  class ModelMissingException : Exception("The language pack is not downloaded yet.")

  /** ML Kit's language code for the text ("en", "fil", ...) or "und" when it can't tell. */
  fun identifyLanguage(text: String): String {
    val identifier = LanguageIdentification.getClient()
    try {
      return Tasks.await(identifier.identifyLanguage(text))
    } finally {
      identifier.close()
    }
  }

  /** True once both the English and Tagalog models are on the device. */
  fun isModelReady(): Boolean {
    val manager = RemoteModelManager.getInstance()
    return languages.all { language ->
      Tasks.await(manager.isModelDownloaded(TranslateRemoteModel.Builder(language).build()))
    }
  }

  /** Downloads the English and Tagalog models (about 30 MB each), only over Wi-Fi. */
  fun downloadModels(context: Context) {
    if (isModelReady()) return
    if (!isOnUnmeteredNetwork(context)) throw WifiRequiredException()
    val translator = Translation.getClient(options(TranslateLanguage.ENGLISH, TranslateLanguage.TAGALOG))
    try {
      Tasks.await(translator.downloadModelIfNeeded(DownloadConditions.Builder().requireWifi().build()))
    } finally {
      translator.close()
    }
  }

  /** Translates each segment from [source] to [target]; blank segments are returned as they are. */
  fun translate(segments: List<String>, source: String, target: String): List<String> {
    require(source in languages && target in languages && source != target) { "Unsupported language pair." }
    if (!isModelReady()) throw ModelMissingException()
    val translator = Translation.getClient(options(source, target))
    try {
      return segments.map { segment -> if (segment.isBlank()) segment else Tasks.await(translator.translate(segment)) }
    } finally {
      translator.close()
    }
  }

  private fun options(source: String, target: String) =
    TranslatorOptions.Builder().setSourceLanguage(source).setTargetLanguage(target).build()

  private fun isOnUnmeteredNetwork(context: Context): Boolean {
    val connectivity = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val capabilities = connectivity.getNetworkCapabilities(connectivity.activeNetwork) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
  }
}
