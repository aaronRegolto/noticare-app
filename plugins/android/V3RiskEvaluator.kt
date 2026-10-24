package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import android.util.Log
import kotlin.math.max
import org.json.JSONObject
import org.tensorflow.lite.Interpreter

/**
 * Runs the V3 byte-level model entirely on-device. A high-specificity model
 * result may add a Suspicious warning, but model output alone never marks text
 * Dangerous.
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
    val modelOnlyThreshold: Float?,
  )

  @Volatile private var runtime: Runtime? = null

  /** The final result shown, stored and sent: Safe is finalized to 0 only after combine(). */
  @Synchronized
  fun evaluate(context: Context, message: String): ThreatResult =
    finalizeThreatResult(evaluateRaw(context, message))

  private fun evaluateRaw(context: Context, message: String): ThreatResult {
    val rules = SmishingEvaluator.evaluate(message)
    val current = requireRuntime(context.applicationContext)
    val probability = try {
      predict(context.applicationContext, message)
    } catch (error: Exception) {
      Log.e("NotiCareModel", "On-device classification failed; using deterministic rule result.", error)
      return rules
    }
    return combine(rules, probability, current.safeThreshold, current.modelOnlyThreshold)
  }

  private fun hasSupportingEvidence(rules: ThreatResult): Boolean =
    rules.level == ThreatLevel.SAFE && rules.reasons.any { it.weight > 0 && it.code !in weakSignals }

  /** Kept separate from inference so false-positive and failure paths can be tested. */
  internal fun combine(
    rules: ThreatResult,
    probability: Float,
    safeThreshold: Float,
    modelOnlyThreshold: Float? = null,
  ): ThreatResult {
    if (!probability.isFinite() || probability !in 0f..1f) return rules
    val hasEvidence = hasSupportingEvidence(rules)
    if (!hasEvidence) {
      if (modelOnlyThreshold == null || !modelOnlyThreshold.isFinite() || probability < modelOnlyThreshold) return rules
      return rules.copy(
        level = ThreatLevel.SUSPICIOUS,
        score = 30,
        reasons = rules.reasons + ThreatReason(
          code = "v3-model-risk",
          label = "AI spam signal",
          description = "NotiCare's on-device classifier found a high-confidence spam pattern. Verify the sender independently before acting.",
          weight = 30,
        ),
      )
    }
    if (!safeThreshold.isFinite() || safeThreshold <= 0f || safeThreshold >= 1f || probability < safeThreshold) return rules

    val reason = ThreatReason(
      code = "v3-model-risk",
      label = "AI check",
      description = "NotiCare's built-in AI agrees the warning signs above look like a scam. It only adds points when real warning signs are present.",
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
      modelOnlyThreshold = thresholds.optDouble("model_only", Double.NaN)
        .takeIf { it.isFinite() && it > 0.0 }
        ?.toFloat(),
    ).also { created -> runtime = created }
  }

  internal fun encode(message: String): IntArray {
    val bytes = message.toByteArray(Charsets.UTF_8)
    return IntArray(INPUT_LENGTH) { index -> if (index < bytes.size) (bytes[index].toInt() and 0xff) + 1 else 0 }
  }
}
