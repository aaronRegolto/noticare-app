# Dataset files for the admin library

You can import from the browser: **Dataset library → Import source CSV** (for a listed source) or **Import a dataset** (for an additional file). The dashboard validates the CSV and opens its rows after saving. Existing files cannot be overwritten through this UI.

Place original, UTF-8 CSV files in this folder. Each needs a header row with unique, non-empty column names; all columns are displayed as supplied. Quoted commas, multiline messages, and escaped quotes are supported. Browser imports allow 10 MB; local file browsing allows 25 MB. Maximum: 50 columns per file.

## Prepared source files

- `UCI_SMS_Spam.csv`: 5,574 records converted from `SMSSpamCollection` inside the supplied UCI ZIP. Tab-separated labels and message text were converted to CSV with a source column.
- `NCSU_SMS_Phishing.csv`: 68,029 records from `phishing_messages.csv` inside the nested `sms-phishing-main.zip`. The original header omitted a field between message and time; it is labelled `unlabelled_source_field` in the prepared CSV. All seven values per row are preserved. Original archives remain unchanged.
- `noticare_philippines.csv`: 100 supplied records, unchanged.

These are source files, not a reconstructed final training split. The bundled model reports 5,158 UCI provenance rows and 4,135 NCSU provenance rows; the exact filtering and split cannot be established from these archives alone. The Philippine file's inclusion in training is not established by the bundled metadata.

Use these filenames to associate files with the existing model provenance entries:

- `UCI_SMS_Spam.csv`
- `NCSU_SMS_Phishing.csv`

Other CSV files appear as additional datasets. Select **Refresh** in the dashboard’s **Dataset library**, then **Browse rows**. Search checks all columns; exports contain the current 50-row page. Files remain on the dashboard server and require admin authentication to browse.

Only add research data you intend administrators to view. Dataset CSVs are ignored by Git. Adding a file does not establish that it was used by the model, validate its labels, or retrain the model. Source provenance counts remain the values in model metadata; actual CSV row counts are shown by the browser.

New app detections are available separately under **Phishing detections**. They are unverified Suspicious/Dangerous events, exclude demo data, and include metadata only. The app does not upload SMS bodies or automatically turn detections into training examples.
