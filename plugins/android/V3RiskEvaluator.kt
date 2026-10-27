package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.nio.ByteBuffer
import java.nio.ByteOrder
import android.util.Log
import kotlin.math.max
import org.json.JSONObject
import org.tensorflow.lite.Interpreter

/**
 * Runs the V3 byte-level model entirely on-device. Model output can reinforce
 * explicit rule evidence but cannot create a warning by itself.
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
      Log.e("NotiCareModel", "On-device text classification failed; using deterministic rule result.", error)
      return rules
    }
    val urlProbability = try {
      UrlRiskEvaluator.predict(context.applicationContext, rules.urls)
    } catch (error: Exception) {
      Log.e("NotiCareModel", "On-device URL classification failed; using text and rule result.", error)
      return combine(rules, probability, current.safeThreshold)
    }
    val urlThreshold = try {
      UrlRiskEvaluator.threshold(context.applicationContext)
    } catch (error: Exception) {
      Log.e("NotiCareModel", "Could not read URL model threshold; using text and rule result.", error)
      return combine(rules, probability, current.safeThreshold)
    }
    return combine(rules, probability, current.safeThreshold, urlProbability, urlThreshold)
  }

  private fun hasSupportingEvidence(rules: ThreatResult): Boolean =
    rules.level == ThreatLevel.SAFE && rules.reasons.any { it.weight > 0 && it.code !in weakSignals }

  /** Kept separate from inference so false-positive and failure paths can be tested. */
  internal fun combine(
    rules: ThreatResult,
    probability: Float,
    safeThreshold: Float,
  ): ThreatResult = combine(rules, probability, safeThreshold, 0f, 1f)

  internal fun combine(
    rules: ThreatResult,
    textProbability: Float,
    textThreshold: Float,
    urlProbability: Float,
    urlThreshold: Float,
  ): ThreatResult {
    if (!hasSupportingEvidence(rules)) return rules
    val textModelHits = textProbability.isFinite() && textProbability in 0f..1f &&
      textThreshold.isFinite() && textThreshold in 0f..1f && textProbability >= textThreshold
    val urlModelHits = urlProbability.isFinite() && urlProbability in 0f..1f &&
      urlThreshold.isFinite() && urlThreshold in 0f..1f && urlProbability >= urlThreshold
    if (!textModelHits && !urlModelHits) return rules

    val code = if (textModelHits) "v3-model-risk" else "url-model-risk"
    val reason = ThreatReason(
      code = code,
      label = "AI check",
      description = "NotiCare's built-in AI agrees the warning signs above look like a scam. It only adds points when real warning signs are present.",
      weight = max(0, 30 - rules.score),
    )
    // ruleVersion must stay exactly rules.ruleVersion: it is checked against the
    // server's seeded rule set, which never contains a model version suffix.
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
