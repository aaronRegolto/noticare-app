package __NOTICARE_PACKAGE__.bridge

import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProcessSafeFileLockTest {
  @Test
  fun serializesConcurrentAccessAndAllowsReentrantAccess() {
    val lockFile = Files.createTempDirectory("noticare-lock-test").resolve("store.lock").toFile()
    val ready = CountDownLatch(2)
    val start = CountDownLatch(1)
    val active = AtomicInteger()
    val maximumActive = AtomicInteger()

    val workers = (1..2).map {
      thread {
        ready.countDown()
        start.await()
        ProcessSafeFileLock.withLock(lockFile) {
          ProcessSafeFileLock.withLock(lockFile) {
            val count = active.incrementAndGet()
            maximumActive.updateAndGet { current -> maxOf(current, count) }
            Thread.sleep(30)
            active.decrementAndGet()
          }
        }
      }
    }

    assertTrue(ready.await(2, TimeUnit.SECONDS))
    start.countDown()
    workers.forEach { it.join() }
    assertEquals(1, maximumActive.get())
    lockFile.parentFile?.deleteRecursively()
  }
}
