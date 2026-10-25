# NotiCare ML training

Everything needed to (re)train **NotiCare Smishing**, the byte-level CNN text classifier the app runs on-device with LiteRT.

**New to this? Start with the step-by-step [TUTORIAL.md](TUTORIAL.md).** This README is the short reference.

| File               | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `sources.json`     | Which datasets to train on, which column holds the message, and how it is labelled                               |
| `data.py`          | Loads the CSVs, labels them (1 = scam, 0 = legitimate), removes duplicates, and splits train / validation / test |
| `model.py`         | The model architecture and the byte encoder (must match the app's `V3RiskEvaluator.kt`)                          |
| `train.py`         | Trains, picks thresholds, exports the `.tflite`, checks it, scores it, and writes `model_metadata.json`          |
| `requirements.txt` | Python packages                                                                                                  |

## Setup (once)

TensorFlow needs **Python 3.12**. From the project root:

```powershell
py -3.12 -m pip install -r ml/requirements.txt
```

## Train

```powershell
py -3.12 ml/data.py      # optional: preview how many messages each source gives
py -3.12 ml/train.py     # train and export (takes about a minute on a laptop CPU)
```

To include the attached categorized Philippine SMS export, first run the local-only importer, then pass its generated manifest:

```powershell
py -3.12 ml/import_local_spam.py "C:\path\to\text-messages.csv"
py -3.12 ml/data.py "ml\output\local_sources.json"
py -3.12 ml/train.py --sources "ml\output\local_sources.json"
```

Only rows with `category=spam` are used. `SPAM_SMS.csv` is excluded because it has no label column. The importer drops sender/date fields and masks common identifiers, but this is not guaranteed complete anonymization.

Public sources and licensing caveats are summarized in [../docs/ML_DATA_SOURCES.md](../docs/ML_DATA_SOURCES.md).

Each run is saved in `ml/output/<date-time>/`:

- `noticare_smishing_v3.tflite`: the phone model
- `model_metadata.json`: thresholds, data counts, and test results (the app and admin dashboard read this)
- `noticare_smishing_v3.keras`: the full trained model, kept for reference
- `training_report.md`: a readable summary, including the **current model's score on the same test messages** so you can see whether the new one is better
- `history.json`: loss and PR-AUC for each epoch

Nothing in the app changes until you install the model.

## Install the new model into the app

Only after reading `training_report.md` and confirming the new model is better:

```powershell
py -3.12 ml/train.py --install
```

This trains again and copies the `.tflite` and `model_metadata.json` into `assets/models/`, backing up the old files to `ml/output/<run>/previous/`. You can also copy the two files by hand from a run you already checked. Then:

1. Run the app tests: `npx jest` and the Android tests.
2. **Build a new APK.** The model is packaged inside the app, so phones only get it through an app update.

## Add a new dataset

1. Put the CSV in `datasets/` (UTF-8, with a header row).
2. Add an entry in `sources.json`:

   ```json
   {
     "name": "my_dataset",
     "file": "datasets/my_dataset.csv",
     "text_column": "message",
     "label_column": "label",
     "enabled": true
   }
   ```

   - `name` should be the file name without `.csv`, so the admin dashboard matches it to the file.
   - Labels can be `scam`, `spam`, `phishing`, `smishing`, `fraud`, `1` (scam) or `legit`, `legitimate`, `ham`, `safe`, `0` (legitimate). Other labels are skipped and counted.
   - If every row is the same kind, use `"fixed_label": "scam"` (or `"legitimate"`) instead of `label_column`.
   - `"max_rows": 4000` caps a large source so it doesn't drown out the others.

3. Run `py -3.12 ml/data.py` to check the counts, then `py -3.12 ml/train.py`.

Training always starts from scratch on all enabled sources together. The model is small (20,641 parameters), so this takes about a minute, and the model never "forgets" older data the way fine-tuning on only new data can.

### Using the admin dashboard's Reported phishing messages

The `reported_messages` entry in `sources.json` is ready for an export saved as `datasets/reported_messages.csv`. Before setting `"enabled": true`:

- **Review every row.** Reports are messages NotiCare's own rules marked Dangerous; training on them unchecked teaches the model to copy the rules' mistakes. Delete anything that is not really a scam.
- **Anonymize.** Remove names, phone numbers, and account numbers; reports may contain personal information.
- **Check consent.** Users agreed to report the message. Using it for AI training should be stated in the app's privacy notice (Data Privacy Act of 2012, RA 10173).
- Reports are all scams. Legitimate messages (for now from UCI's "ham") must stay in the mix, or the model learns that everything is a scam.

## How the data is split

Each message is assigned to train (70%), validation (15%), or test (15%) by a hash of its _template_: the text lowercased, with links and numbers masked. So:

- The same scam campaign with a different link or amount can't appear in both training and test, which would inflate the score.
- The **test set is frozen**. Adding data never moves existing messages between splits, so every new model is compared with the old one on the same test messages.

Duplicates (same first 256 bytes, ignoring case and spacing) are removed. A message labelled scam in one dataset and legitimate in another is dropped.

## Thresholds

The model outputs a probability from 0 to 1 that a message is a scam. Training chooses validation thresholds (never from the test split):

- `safe`: at least 99.5% of validation scams score at or above it (`--target-recall`).
- `dangerous`: at most 2% of validation legitimate messages score at or above it (`--max-false-alarm-rate`).
- `model_only`: at most 0.5% of validation legitimate messages score at or above it.

The app uses a separate high-specificity `model_only` threshold to raise a model-only hit to Suspicious (score 30); that path never marks a message Dangerous. When the rules already find non-weak warning evidence, the `safe` threshold may add the AI evidence to the rule score. Threshold false-alarm limits apply only to the validation split, not every future message population.

## Notes

- This script rebuilds the training of the bundled V3 model from its documented architecture, preprocessing, and dataset counts. The original training code and its 1,435 synthetic messages are not in this project, so results differ slightly from V3's metadata.
- The NCSU file has no label column. All of its rows are phishing messages collected by the dataset authors, so it uses `fixed_label: scam`.
- `government_impersonation_synthetic.csv` is a small, balanced project-written set for targeted coverage. It is not independently sourced, and results on it do not establish real-world government-scam accuracy.
- `reward_bonus_synthetic.csv` adds balanced project-written high-bonus/reward spam examples and legitimate promotion controls. Its labels are synthetic development labels, not verified evidence of fraud; it must not be used to claim production accuracy.
- Accuracy here comes from a test split of the same public datasets. It is not accuracy on Tagalog/Taglish or on real NotiCare users' messages; that needs a reviewed local test set.
