# Dataset files for the admin library

The admin dashboard browses CSV files already present in this folder and supports an admin-only upload for the `Local_PH_SMS_spam` source when the dashboard is hosted without its ignored local CSV. That one-time upload accepts a UTF-8 CSV with exactly `text,label` columns, non-empty messages, and numeric labels `0` or `1`; it stores rows in the RLS-protected Supabase `admin_dataset_rows` table. Quoted commas, multiline messages, and escaped quotes are supported. The upload is for browsing only: it does not validate the labels or train/update the ML model. Local file browsing allows 25 MB and 50 columns per file.

## Prepared source files

- `UCI_SMS_Spam.csv`: 5,574 records converted from `SMSSpamCollection` inside the supplied UCI ZIP. Tab-separated labels and message text were converted to CSV with a source column.
- `NCSU_SMS_Phishing.csv`: 68,029 records from `phishing_messages.csv` inside the nested `sms-phishing-main.zip`. The original header omitted a field between message and time; it is labelled `unlabelled_source_field` in the prepared CSV. All seven values per row are preserved. Original archives remain unchanged.
- `noticare_philippines.csv`: 100 supplied records, unchanged.

These are source files, not a reconstructed final training split. The bundled model reports 5,158 UCI provenance rows and 4,135 NCSU provenance rows; the exact filtering and split cannot be established from these archives alone. The Philippine file's inclusion in training is not established by the bundled metadata.

Use these filenames to associate files with the existing model provenance entries:

- `UCI_SMS_Spam.csv`
- `NCSU_SMS_Phishing.csv`

Other CSV files already in this folder appear as additional datasets. Select **Refresh** in the dashboard’s **Dataset library**, then **Browse rows**. Search checks all columns; exports contain the current 20-row page. Local files remain on the dashboard server and require admin authentication to browse; uploaded Philippine SMS rows are stored in private admin-only Supabase storage.

Only add research data you intend administrators to view. Dataset CSVs are ignored by Git and must not be committed. Uploading the Philippine SMS CSV does not establish that it was used by the model, validate its labels, or retrain the model. Source provenance counts remain the values in model metadata; actual CSV row counts are shown by the browser. Update the separate ML training workflow when changing model training data.

New app detections are available separately under **Phishing detections**. They are unverified Suspicious/Dangerous events, exclude demo data, and include metadata only. The app does not upload SMS bodies or automatically turn detections into training examples.
