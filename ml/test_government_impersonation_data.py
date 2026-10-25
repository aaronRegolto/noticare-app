import unittest
from collections import Counter

from data import ROOT, load_examples


class GovernmentImpersonationDataTests(unittest.TestCase):
    def test_enabled_source_is_balanced_and_present_in_all_splits(self):
        examples, _ = load_examples(ROOT / 'ml' / 'sources.json')
        targeted = [example for example in examples if example.source == 'government_impersonation_synthetic']

        self.assertEqual(len(targeted), 32)
        self.assertEqual(Counter(example.label for example in targeted), {0: 16, 1: 16})
        self.assertEqual({example.split for example in targeted}, {'train', 'validation', 'test'})
        self.assertEqual(
            {example.label for example in targeted if example.split == 'test'},
            {0, 1},
        )


if __name__ == '__main__':
    unittest.main()
