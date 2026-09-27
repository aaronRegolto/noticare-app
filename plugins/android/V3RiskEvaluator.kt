package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.max
import org.json.JSONObject
import org.tensorflow.lite.Interpreter

/**
 * Runs the audited V3 byte-level model entirely on-device. V3 remains an
 * advisory prototype: it can reinforce concrete phishing evidence, but cannot
 * create a warning from its output alone or independently mark text DANGEROUS.
 */
object V3RiskEvaluator {
  private const val MODEL_ASSET = "noticare_smishing_v3.tflite"
  private const val METADATA_ASSET = "model_metadata.json"
  private const val INPUT_LENGTH = 256

  // These generic signals occur in ordinary conversation and promotions too.
  private val weakSignals = setOf("urgency-pressure", "link-or-reply-pressure", "obfuscated-text")

  private data class Runtime(
    val interpreter: Interpreter,
    val safeThreshold: Float,
  )

  @Volatile private var runtime: Runtime? = null

  @Synchronized
  fun evaluate(context: Context, message: String): ThreatResult {
    val rules = SmishingEvaluator.evaluate(message)
    if (!hasSupportingEvidence(rules)) return rules
    val probability = runCatching { predict(context.applicationContext, message) }.getOrNull() ?: return rules
    val current = requireRuntime(context.applicationContext)
    return combine(rules, probability, current.safeThreshold)
  }

  private fun hasSupportingEvidence(rules: ThreatResult): Boolean =
    rules.level == ThreatLevel.SAFE && rules.reasons.any { it.weight > 0 && it.code !in weakSignals }

  /** Kept separate from inference so false-positive and failure paths can be tested. */
  internal fun combine(rules: ThreatResult, probability: Float, safeThreshold: Float): ThreatResult {
    if (!hasSupportingEvidence(rules)) return rules
    if (!probability.isFinite() || probability !in 0f..1f ||
      !safeThreshold.isFinite() || safeThreshold <= 0f || safeThreshold >= 1f || probability < safeThreshold) return rules

    val reason = ThreatReason(
      code = "v3-model-risk",
      label = "On-device risk model",
      description = "The on-device model supports the specific warning signs listed for this message. Its output alone does not establish smishing.",
      weight = max(0, 30 - rules.score),
    )
    // ruleVersion must stay exactly rules.ruleVersion: it's checked for an exact
    // match against the server's seeded rule_sets.version, which never contains
    // this model's version suffix. Appending it here (as this used to do) made
    // every Suspicious result reinforced by the model fail that check outright.
    return rules.copy(
      level = ThreatLevel.SUSPICIOUS,
      score = max(rules.score, 30),
      reasons = rules.reasons + reason,
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
    ).also { created -> runtime = created }
  }

  internal fun encode(message: String): IntArray {
    val bytes = message.toByteArray(Charsets.UTF_8)
    return IntArray(INPUT_LENGTH) { index -> if (index < bytes.size) (bytes[index].toInt() and 0xff) + 1 else 0 }
  }
}
