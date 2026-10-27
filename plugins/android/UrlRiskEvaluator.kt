package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import org.json.JSONArray
import org.json.JSONObject
import org.tensorflow.lite.Interpreter

/** Runs the URL-only risk model entirely on-device. */
object UrlRiskEvaluator {
  private const val MODEL_ASSET = "noticare_url_risk.tflite"
  private const val METADATA_ASSET = "url_model_metadata.json"
  private const val MAX_URLS = 12

  private data class Runtime(
    val interpreter: Interpreter,
    val mean: FloatArray,
    val std: FloatArray,
    val threshold: Float,
  )

  @Volatile private var runtime: Runtime? = null

  @Synchronized
  internal fun predict(context: Context, urls: List<ExtractedUrl>): Float {
    if (urls.isEmpty()) return 0f
    val active = requireRuntime(context.applicationContext)
    var highest = 0f
    for (url in urls.take(MAX_URLS)) {
      val features = encode(url.display, url.normalizedDomain)
      if (features.isEmpty()) continue
      val input = FloatArray(features.size) { index ->
        (features[index] - active.mean[index]) / active.std[index]
      }
      val output = Array(1) { FloatArray(1) }
      active.interpreter.run(Array(1) { input }, output)
      highest = max(highest, output[0][0])
    }
    return highest
  }

  private fun requireRuntime(context: Context): Runtime {
    runtime?.let { return it }
    val metadata = context.assets.open(METADATA_ASSET).bufferedReader().use { JSONObject(it.readText()) }
    val specs = metadata.getJSONObject("technical_specifications")
    val preprocessing = specs.getJSONObject("preprocessing")
    val mean = preprocessing.getJSONArray("mean").toFloatArray()
    val std = preprocessing.getJSONArray("std").toFloatArray()
    val modelBytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val modelBuffer = ByteBuffer.allocateDirect(modelBytes.size).order(ByteOrder.nativeOrder()).apply {
      put(modelBytes)
      rewind()
    }
    val interpreter = Interpreter(modelBuffer)
    val inputShape = interpreter.getInputTensor(0).shape()
    val outputShape = interpreter.getOutputTensor(0).shape()
    if (!inputShape.contentEquals(intArrayOf(1, mean.size)) ||
      !outputShape.contentEquals(intArrayOf(1, 1))
    ) {
      interpreter.close()
      throw IllegalStateException("Unexpected URL model tensor shape: $inputShape -> $outputShape")
    }
    return Runtime(
      interpreter,
      mean,
      std,
      specs.getDouble("locked_threshold").toFloat(),
    ).also { created -> runtime = created }
  }

  internal fun encode(url: String, host: String?): FloatArray {
    val parsedHost = host?.trimEnd('.')?.lowercase() ?: return FloatArray(0)
    val rawUrl = url.trim()
    if (parsedHost.isBlank() || rawUrl.isBlank()) return FloatArray(0)

    val encoded = percentEncoding.findAll(rawUrl).map { it.value }.toList()
    val obfuscatedCount = encoded.size * 3
    val registeredHost = parsedHost.substringBeforeLast('.', parsedHost)
    val letters = registeredHost.count(Char::isLetter)
    val digits = registeredHost.count(Char::isDigit)
    val domainLabels = parsedHost.split('.').size
    val values = floatArrayOf(
      rawUrl.length.toFloat(),
      parsedHost.length.toFloat(),
      if (ipv4Pattern.matches(parsedHost) || parsedHost.startsWith("[")) 1f else 0f,
      (domainLabels - 2).coerceAtLeast(0).toFloat(),
      if (obfuscatedCount > 0) 1f else 0f,
      obfuscatedCount.toFloat(),
      obfuscatedCount.toFloat() / rawUrl.length,
      letters.toFloat(),
      letters.toFloat() / rawUrl.length,
      digits.toFloat(),
      digits.toFloat() / rawUrl.length,
      rawUrl.count { it == '=' }.toFloat(),
      rawUrl.count { it == '?' }.toFloat(),
      rawUrl.count { it == '&' }.toFloat(),
      if (rawUrl.startsWith("https://", ignoreCase = true)) 1f else 0f,
    )
    return values
  }

  internal fun threshold(context: Context): Float = requireRuntime(context.applicationContext).threshold

  private val percentEncoding = Regex("%[0-9A-Fa-f]{2}")
  private val ipv4Pattern = Regex("(?:\\d{1,3}\\.){3}\\d{1,3}")

  private fun JSONArray.toFloatArray(): FloatArray {
    val result = FloatArray(length())
    for (index in 0 until length()) result[index] = optDouble(index).toFloat()
    return result
  }
}
