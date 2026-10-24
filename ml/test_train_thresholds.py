import unittest

import numpy as np

from train import choose_model_only_threshold


class ModelOnlyThresholdTests(unittest.TestCase):
    def test_threshold_caps_legitimate_alerts_at_requested_rate(self):
        labels = np.array([0, 0, 0, 0, 1, 1])
        probabilities = np.array([0.9, 0.8, 0.7, 0.1, 0.95, 0.85], dtype=np.float32)
        threshold = choose_model_only_threshold(labels, probabilities, 0.25)
        self.assertEqual(int(((labels == 0) & (probabilities >= threshold)).sum()), 1)
        self.assertEqual(int(((labels == 1) & (probabilities >= threshold)).sum()), 2)

    def test_zero_false_alarm_rate_uses_a_threshold_above_tied_legitimate_scores(self):
        labels = np.array([0, 0, 1])
        probabilities = np.array([1.0, 0.5, 1.0], dtype=np.float32)
        threshold = choose_model_only_threshold(labels, probabilities, 0)
        self.assertGreater(threshold, 1.0)
        self.assertEqual(int(((labels == 0) & (probabilities >= threshold)).sum()), 0)

    def test_requires_legitimate_validation_examples(self):
        with self.assertRaisesRegex(ValueError, 'legitimate'):
            choose_model_only_threshold(np.array([1]), np.array([0.8]), 0.005)


if __name__ == '__main__':
    unittest.main()
