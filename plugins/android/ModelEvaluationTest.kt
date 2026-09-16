package __NOTICARE_PACKAGE__.bridge

import java.io.File
import java.util.Base64
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Optional diagnostic corpus run using real desktop model probabilities and production Kotlin decisions. */
class ModelEvaluationTest {
  @Test fun evaluateAvailableSourceCorpora() {
    val directory = System.getenv("NOTICARE_EVAL_DIR")
    assumeTrue("Set NOTICARE_EVAL_DIR after running scripts/evaluate-model.py", directory != null)
    val root = File(directory!!)
    val input = File(root, "inputs.tsv")
    assertTrue("Generate actual model predictions first", input.isFile)
    File(root, "predictions.tsv").bufferedWriter().use { output ->
      output.appendLine("source\trow\tlabel\tprobability\trules\tcombined\treasons")
      input.bufferedReader().use { reader ->
        val threshold = reader.readLine().split('\t')[1].toFloat()
        reader.lineSequence().forEach { line ->
          val fields = line.split('\t')
          assertEquals(5, fields.size)
          val probability = fields[3].toFloat()
          assertTrue(probability.isFinite() && probability in 0f..1f)
          val text = Base64.getDecoder().decode(fields[4]).toString(Charsets.UTF_8)
          val rules = SmishingEvaluator.evaluate(text)
          val combined = V3RiskEvaluator.combine(rules, probability, threshold)
          output.appendLine((fields.take(4) + listOf(rules.level.wireValue, combined.level.wireValue,
            combined.reasons.joinToString(",") { it.code })).joinToString("\t"))
        }
      }
    }
  }
}
