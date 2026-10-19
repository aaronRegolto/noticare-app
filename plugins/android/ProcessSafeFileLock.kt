package __NOTICARE_PACKAGE__.bridge

import android.content.Context
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

internal object ProcessSafeFileLock {
  private val processLocks = ConcurrentHashMap<String, ReentrantLock>()

  fun <T> withLock(context: Context, name: String, action: () -> T): T =
    withLock(File(context.filesDir, "$name.lock"), action)

  internal fun <T> withLock(lockFile: File, action: () -> T): T {
    val canonicalPath = lockFile.canonicalPath
    val processLock = processLocks.computeIfAbsent(canonicalPath) { ReentrantLock() }
    return processLock.withLock {
      if (processLock.holdCount > 1) return@withLock action()
      lockFile.parentFile?.mkdirs()
      RandomAccessFile(lockFile, "rw").channel.use { channel ->
        channel.lock().use { action() }
      }
    }
  }
}
