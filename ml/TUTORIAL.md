# Tutorial: training the NotiCare ML model and adding datasets

This guide walks you through retraining **NotiCare Smishing**, the byte-level CNN text classifier the app uses, step by step on a Windows laptop. No machine-learning experience is needed. Follow the parts in order the first time.

- **Part 1**: Set up your laptop (once)
- **Part 2**: Train the model with the current datasets
- **Part 3**: Read the results and decide
- **Part 4**: Add a new dataset
- **Part 5**: Use reported messages from the admin dashboard
- **Part 6**: Put the new model into the app
- **Part 7**: Troubleshooting

> **Important:** training a model does **not** change the app by itself. The new model reaches users only after Part 6, when you build and publish a new APK.

---

## Part 1: Set up your laptop (once)

### Step 1.1: Open a terminal in the project folder

1. Open the `noticare-app` folder in **VS Code**.
2. Open the menu **Terminal → New Terminal**. A PowerShell terminal opens at the bottom, already in the project folder.

Every command in this tutorial is typed into this terminal, from the `noticare-app` folder.

### Step 1.2: Check that Python 3.12 is installed

TensorFlow needs **Python 3.12** (newer versions such as 3.14 are not supported yet). Type:

```powershell
py -3.12 --version
```

- If you see `Python 3.12.x`, continue to Step 1.3.
- If you see an error, install Python 3.12 from https://www.python.org/downloads/ (choose a 3.12 release). During setup, tick **"Add python.exe to PATH"**. Close and reopen VS Code, then try again.

### Step 1.3: Install the packages

```powershell
py -3.12 -m pip install -r ml/requirements.txt
```

This installs TensorFlow and NumPy. It can take several minutes the first time. When it finishes, check it worked:

```powershell
py -3.12 -c "import tensorflow as tf; print(tf.__version__)"
```

You should see a version number such as `2.21.0`. Warnings printed before it are normal.

---

## Part 2: Train the model with the current datasets

### Step 2.1: Preview the data (optional but recommended)

```powershell
py -3.12 ml/data.py
```

This **does not train anything**. It shows how many messages each dataset gives, split into train, validation, and test, for example:

```
source                  split        legitimate    scam
NCSU_SMS_Phishing       train                 0    2880
UCI_SMS_Spam            train              3166     454
...
Total messages: 9294
```

and lists skipped rows (duplicates, empty rows, unknown labels).

### Step 2.2: Train

```powershell
py -3.12 ml/train.py
```

What happens, in order:

1. **Loading data**: the same table as Step 2.1.
2. **Training**: one line per _epoch_ (one pass over the training data), for example
   `Epoch 5/30 ... loss: 0.0360 - pr_auc: 0.9988 - val_loss: 0.0249 - val_pr_auc: 0.9996`.
   It stops by itself when the model stops improving, usually after 10–20 epochs (about a minute).
3. **Choosing thresholds**: picks the cut-off scores on the validation messages.
4. **Exporting the phone model**: creates the `.tflite` file and checks that it gives the same answers as the trained model.
5. **Scoring**: tests the new model, and the model currently in the app, on the same test messages.

At the end you'll see something like:

```
Saved to C:\...\noticare-app\ml\output\20261005-183649
Test accuracy 99.24% | PR-AUC 0.9995 | missed scams 5 | false alarms 9
Current model on the same test split: accuracy 96.26% | PR-AUC 0.9963 | missed scams 2 | false alarms 25
```

Each run gets its own folder in `ml/output/` named by date and time, so older runs are never overwritten.

---

## Part 3: Read the results and decide

Open `ml/output/<your run>/training_report.md` in VS Code. (Press `Ctrl+Shift+V` to view it formatted.)

### What the numbers mean

| Result           | Meaning                                                               | Better when |
| ---------------- | --------------------------------------------------------------------- | ----------- |
| **Accuracy**     | Share of test messages labeled correctly (cut-off 0.5)                | Higher      |
| **PR-AUC**       | How well the model ranks scams above legitimate messages, from 0 to 1 | Closer to 1 |
| **Missed scams** | Scam messages the model scored as safe                                | Lower       |
| **False alarms** | Legitimate messages the model scored as dangerous                     | Lower       |
| **Uncertain**    | Messages between the two thresholds                                   | Lower       |

The report shows the **new model next to the current model** on the same test messages. Keep the new model only if it is **clearly better**, especially on missed scams, without many more false alarms.

### Files in each run folder

| File                          | What it is                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `noticare_smishing_v3.tflite` | The phone model (this goes into the app)                                          |
| `model_metadata.json`         | Thresholds, data counts, and test results (the app and admin dashboard read this) |
| `noticare_smishing_v3.keras`  | The full trained model, kept for reference                                        |
| `training_report.md`          | The readable summary                                                              |
| `history.json`                | The score after each epoch                                                        |

If the new model isn't better, simply don't install it. Nothing in the app has changed.

---

## Part 4: Add a new dataset

### Step 4.1: Prepare the CSV file

Put **one message per row**, with a column for the message and a column for the label:

| message                                                            | label |
| ------------------------------------------------------------------ | ----- |
| Nanalo ka ng PHP 50,000! I-claim sa bit.ly/xyz                     | scam  |
| Kuya, nasa labas na ako ng bahay                                   | legit |
| Your GCash account will be suspended. Verify now: gcash-verify.top | scam  |
| Salamat po sa bayad, natanggap ko na                               | legit |

Rules:

- The **first row must be the column names** (for example `message,label`).
- Accepted labels (capital letters don't matter):
  - **Scam:** `scam`, `spam`, `phishing`, `smishing`, `fraud`, `1`
  - **Legitimate:** `legit`, `legitimate`, `ham`, `safe`, `0`
  - Rows with any other label are skipped and counted, not used.
- **Include legitimate messages too**, not only scams. A model trained only on scams learns that everything is a scam.
- Remove names, phone numbers, and account numbers from real messages.

**Saving from Excel:** File → Save As → choose **"CSV UTF-8 (Comma delimited) (\*.csv)"**. The plain "CSV (Comma delimited)" option can break ñ and other Tagalog characters.

**File name:** use letters, numbers, `_` and `-` only, for example `tagalog_sms.csv`.

### Step 4.2: Put the file in the `datasets` folder

Save or copy it to `noticare-app/datasets/`, for example `datasets/tagalog_sms.csv`.

### Step 4.3: Register the file in `ml/sources.json`

Open `ml/sources.json`. It holds a list of sources between `[` and `]`. Add a new entry **inside the list**, with a **comma** after the entry before it:

```json
{
  "sources": [
    {
      "name": "UCI_SMS_Spam",
      ...
    },
    ...
    {
      "name": "reported_messages",
      ...
      "enabled": false,
      "note": "..."
    },
    {
      "name": "tagalog_sms",
      "file": "datasets/tagalog_sms.csv",
      "text_column": "message",
      "label_column": "label",
      "enabled": true,
      "note": "Tagalog and Taglish SMS collected and labeled by the team."
    }
  ]
}
```

What each field means:

| Field          | Meaning                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| `name`         | The file name **without** `.csv`. The admin dashboard uses it to match the file. |
| `file`         | Where the file is, starting from the project folder                              |
| `text_column`  | The **exact** header of the message column                                       |
| `label_column` | The **exact** header of the label column                                         |
| `enabled`      | `true` to train on it, `false` to leave it out                                   |
| `note`         | Your own description (optional)                                                  |

Optional fields:

| Field                           | Use it when                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `"fixed_label": "scam"`         | **Every** row is a scam (or `"legitimate"`), so the file has no label column. Use instead of `label_column`. |
| `"max_rows": 4000`              | The file is much bigger than the others and would drown them out                                             |
| `"from_dashboard_export": true` | The file was exported from the admin dashboard (see Part 5)                                                  |

**JSON mistakes to avoid:**

- Missing comma between two `{ ... }` entries.
- A comma after the **last** entry (not allowed).
- Single quotes `'like this'` instead of double quotes `"like this"`.
- `True` instead of `true` (JSON is lowercase).

### Step 4.4: Check the data loads

```powershell
py -3.12 ml/data.py
```

Your dataset should appear in the table with its scam and legitimate counts. If something is wrong you'll see an error or a "Skipped" line; see Part 7.

### Step 4.5: Train

```powershell
py -3.12 ml/train.py
```

Training always starts **from scratch** on **all enabled datasets together**. This is on purpose: the model is small (20,641 parameters), so it only takes about a minute, and the model never "forgets" older data.

Then read the report as in Part 3. The new dataset is listed in the report's **Data** table.

### Turning a dataset off

Set its `"enabled"` to `false` in `ml/sources.json`. You don't need to delete the file.

---

## Part 5: Use reported messages from the admin dashboard

The admin dashboard's **Dataset library → Reported phishing messages** collection holds real scam messages users chose to report. They're valuable because they're **local and often in Tagalog or Taglish**.

### Step 5.1: Export

1. Open the collection and click **Export page CSV**.
2. The export saves **one page (20 messages) at a time**. Click **Next →** and export again for each page.
3. Combine the pages into one file in Excel (copy the rows under one header row), and save it as `datasets/reported_messages.csv` in **CSV UTF-8** format.

### Step 5.2: Review every message (required)

- **Delete anything that is not really a scam.** These messages were flagged by NotiCare's own rules; training on them unchecked teaches the model to copy the rules' mistakes.
- **Remove personal information**: names, phone numbers, account numbers.
- **Consent:** users agreed to _report_ the message. Using reports for AI training should be stated in the app's privacy notice (Data Privacy Act of 2012, RA 10173).

### Step 5.3: Enable it

`ml/sources.json` already has an entry for this file:

```json
{
  "name": "reported_messages",
  "file": "datasets/reported_messages.csv",
  "text_column": "message_text",
  "fixed_label": "scam",
  "from_dashboard_export": true,
  "enabled": false
}
```

Change `"enabled": false` to `"enabled": true`, then run Steps 4.4 and 4.5.

Notes:

- Every reported message is labeled **scam**. That's fine: the legitimate messages from the UCI dataset stay in the mix, so the model still learns both sides.
- `"from_dashboard_export": true` removes the `'` the dashboard adds in front of messages that start with `=`, `+`, `-` or `@` (a spreadsheet safety measure).

---

## Part 6: Put the new model into the app

Only do this after Part 3 shows the new model is clearly better.

### Step 6.1: Install the model into the project

```powershell
py -3.12 ml/train.py --install
```

This trains again and copies `noticare_smishing_v3.tflite` and `model_metadata.json` into `assets/models/`. The old files are backed up to `ml/output/<run>/previous/`.

(You can instead copy those two files by hand from a run folder you already checked.)

**To undo:** copy the two files from `ml/output/<run>/previous/` back into `assets/models/`.

### Step 6.2: Run the app's tests

```powershell
npx jest
```

All tests should pass.

### Step 6.3: Build a new APK

The model is packaged inside the app, so phones only get it in a new APK:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

### Step 6.4: Tell users about the update

Follow `docs/APP_UPDATES.md`: in the admin dashboard, open **App updates**, enter the new version, write what changed (for example _"Better detection of Tagalog scam messages"_), and publish. Users see **Update available** the next time they open NotiCare.

### Step 6.5: Update your paper

If you ship the new model, update the numbers you quote (datasets, message counts, accuracy) from the new `training_report.md`.

---

## Part 7: Troubleshooting

| What you see                                                                   | Cause                                                         | Fix                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------ |
| `No suitable Python runtime found` or `py is not recognized`                   | Python 3.12 isn't installed                                   | Part 1, Step 1.2                                             |
| `No module named 'tensorflow'`                                                 | Packages not installed for Python 3.12                        | Part 1, Step 1.3 (make sure you typed `py -3.12`)            |
| `... not found. Disable it in sources.json or add the file.`                   | The `file` path is wrong or the CSV isn't in `datasets/`      | Check the file name and location; it must match exactly      |
| `missing column(s) ['message']; found [...]`                                   | `text_column` or `label_column` doesn't match the CSV header  | Copy the header exactly as shown in the `found [...]` list   |
| `Skipped ... unknown label 'xyz'`                                              | Labels other than the accepted words                          | Change them to `scam` or `legit` (Step 4.1)                  |
| `Skipped ... empty text`                                                       | Blank rows                                                    | Harmless; delete them if you like                            |
| `Skipped ... duplicate`                                                        | The same message appears more than once                       | Normal; only one copy is kept                                |
| `Skipped ... conflicting labels across sources`                                | The same message is `scam` in one file and `legit` in another | Fix the wrong label                                          |
| `JSONDecodeError`                                                              | A typo in `ml/sources.json`                                   | See "JSON mistakes to avoid" in Step 4.3                     |
| `The train split needs both scam and legitimate messages` (or validation/test) | Every enabled dataset is scam-only (or legit-only)            | Enable a dataset with the other kind, such as `UCI_SMS_Spam` |
| `Exported model disagrees with the trained model`                              | The phone model came out wrong; nothing was saved             | Run again; if it repeats, reinstall TensorFlow (Step 1.3)    |
| Tagalog letters look broken (`Ã±` instead of `ñ`)                              | The CSV wasn't saved as UTF-8                                 | Save again as **CSV UTF-8** (Step 4.1)                       |

---

## Advanced options

Add these after `py -3.12 ml/train.py` if you need them:

| Option                        | Default | What it does                                                                       |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------- |
| `--version 3.2.0`             | `3.1.0` | Version written into `model_metadata.json`                                         |
| `--epochs 40`                 | `30`    | Maximum training passes (it usually stops earlier)                                 |
| `--target-recall 0.99`        | `0.995` | Share of validation scams that must score at or above the "safe" threshold         |
| `--max-false-alarm-rate 0.01` | `0.02`  | Largest share of legitimate messages allowed at or above the "dangerous" threshold |
| `--seed 7`                    | `42`    | Changes the random starting point; the same seed gives the same result             |

Example:

```powershell
py -3.12 ml/train.py --version 3.2.0 --epochs 40
```

For how the data is split and how thresholds are chosen, see `ml/README.md`.
