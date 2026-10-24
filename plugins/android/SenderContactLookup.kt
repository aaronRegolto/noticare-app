package __NOTICARE_PACKAGE__.bridge

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract

internal object SenderContactLookup {
  fun isKnownContact(context: Context, sender: String): Boolean? {
    if (context.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
    val normalizedSender = normalize(sender)
    if (normalizedSender.isEmpty()) return null

    return if (looksLikePhoneNumber(sender)) {
      val lookupUri = Uri.withAppendedPath(
        ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
        Uri.encode(sender.trim()),
      )
      context.contentResolver.query(
        lookupUri,
        arrayOf(ContactsContract.PhoneLookup._ID),
        null,
        null,
        null,
      )?.use { it.moveToFirst() } ?: false
    } else {
      val lookupUri = Uri.withAppendedPath(
        ContactsContract.Contacts.CONTENT_FILTER_URI,
        Uri.encode(sender.trim()),
      )
      context.contentResolver.query(
        lookupUri,
        arrayOf(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY),
        null,
        null,
        null,
      )?.use { cursor ->
        val nameColumn = cursor.getColumnIndex(ContactsContract.Contacts.DISPLAY_NAME_PRIMARY)
        var found = false
        while (!found && cursor.moveToNext()) {
          found = nameColumn >= 0 && normalize(cursor.getString(nameColumn).orEmpty()) == normalizedSender
        }
        found
      }
    }
  }

  internal fun looksLikePhoneNumber(value: String): Boolean {
    val digits = value.count(Char::isDigit)
    return digits >= 6 && value.all { it.isDigit() || it in "+()- .\t" }
  }

  private fun normalize(value: String): String = value
    .lowercase()
    .filter(Char::isLetterOrDigit)
}
