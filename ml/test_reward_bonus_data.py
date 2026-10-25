import unittest
from collections import Counter

from data import ROOT, load_examples


class RewardBonusDataTests(unittest.TestCase):
    def test_enabled_source_is_balanced_and_present_in_all_splits(self):
        examples, _ = load_examples(ROOT / 'ml' / 'sources.json')
        targeted = [example for example in examples if example.source == 'reward_bonus_synthetic']

        self.assertEqual(len(targeted), 24)
        self.assertEqual(Counter(example.label for example in targeted), {0: 12, 1: 12})
        self.assertEqual({example.split for example in targeted}, {'train', 'validation', 'test'})
        self.assertEqual(
            {example.label for example in targeted if example.split == 'test'},
            {0, 1},
        )

    def test_regression_message_is_included_as_synthetic_scam_example(self):
        examples, _ = load_examples(ROOT / 'ml' / 'sources.json')
        target = next(
            example
            for example in examples
            if example.source == 'reward_bonus_synthetic'
            and example.text.startswith('Wednesday reward rush!')
        )
        self.assertEqual(target.label, 1)


if __name__ == '__main__':
    unittest.main()
