package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import org.json.JSONObject
import org.tensorflow.lite.Interpreter

/**
 * Runs the audited V3 byte-level model entirely on-device. V3 remains an
 * advisory prototype: it may raise a rule-safe message to SUSPICIOUS, but it
 * cannot independently suppress a notification as DANGEROUS.
 */
object V3RiskEvaluator {
  private const val MODEL_ASSET = "noticare_smishing_v3.tflite"
  private const val METADATA_ASSET = "model_metadata.json"
  private const val INPUT_LENGTH = 256
  private const val VERSION = "3.0.0-augmented-advisory"

  private data class Runtime(
    val interpreter: Interpreter,
    val safeThreshold: Float,
    val dangerousThreshold: Float,
  )

  @Volatile private var runtime: Runtime? = null

  @Synchronized
  fun evaluate(context: Context, message: String): ThreatResult {
    val rules = SmishingEvaluator.evaluate(message)
    val probability = runCatching { predict(context.applicationContext, message) }.getOrNull() ?: return rules
    val current = requireRuntime(context.applicationContext)
    val modelLevel = when {
      probability >= current.dangerousThreshold -> ThreatLevel.DANGEROUS
      probability >= current.safeThreshold -> ThreatLevel.SUSPICIOUS
      else -> ThreatLevel.SAFE
    }

    if (rules.level != ThreatLevel.SAFE || modelLevel == ThreatLevel.SAFE) return rules

    val reason = ThreatReason(
      code = "v3-model-risk",
      label = "On-device risk model",
      description = "The on-device prototype found patterns associated with spam, scams, or risky messages.",
      weight = 30,
    )
    return rules.copy(
      level = ThreatLevel.SUSPICIOUS,
      score = max(rules.score, 30),
      reasons = rules.reasons + reason,
      ruleVersion = "${rules.ruleVersion}+$VERSION",
    )
  }

  @Synchronized
  private fun predict(context: Context, message: String): Float {
    val active = requireRuntime(context)
    val input = arrayOf(encode(message))
    val output = Array(1) { FloatArray(1) }
    active.interpreter.run(input, output)
    return output[0][0]
  }

  private fun requireRuntime(context: Context): Runtime {
    runtime?.let { return it }
    val metadata = context.assets.open(METADATA_ASSET).bufferedReader().use { JSONObject(it.readText()) }
    val thresholds = metadata.getJSONObject("technical_specifications").getJSONObject("locked_thresholds")
    val modelBytes = context.assets.open(MODEL_ASSET).use { it.readBytes() }
    val modelBuffer = ByteBuffer.allocateDirect(modelBytes.size).order(ByteOrder.nativeOrder()).apply {
      put(modelBytes)
      rewind()
    }
    return Runtime(
      interpreter = Interpreter(modelBuffer),
      safeThreshold = thresholds.getDouble("safe").toFloat(),
      dangerousThreshold = thresholds.getDouble("dangerous").toFloat(),
    ).also { created -> runtime = created }
  }

  internal fun encode(message: String): IntArray {
    val bytes = message.toByteArray(Charsets.UTF_8)
    return IntArray(INPUT_LENGTH) { index -> if (index < bytes.size) (bytes[index].toInt() and 0xff) + 1 else 0 }
  }
}
