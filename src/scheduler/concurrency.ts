/**
 * Concurrency Control for FlowScript Scheduler
 *
 * Provides Semaphore class for limiting concurrent async operations.
 */

/**
 * Semaphore for limiting concurrent async operations.
 *
 * @example
 * ```typescript
 * const sem = new Semaphore(3); // max 3 concurrent
 *
 * async function limitedTask() {
 *   await sem.acquire();
 *   try {
 *     await doWork();
 *   } finally {
 *     sem.release();
 *   }
 * }
 * ```
 */
export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  /**
   * Create a semaphore with the given capacity.
   * @param capacity Maximum concurrent permits (must be >= 1)
   */
  constructor(private readonly capacity: number) {
    if (capacity < 1) {
      throw new Error('Semaphore capacity must be at least 1');
    }
    this.permits = capacity;
  }

  /**
   * Acquire a permit. Blocks (awaits) if none available.
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Wait for a permit to become available
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Release a permit, allowing next waiting task to proceed.
   * Must be called after acquire, typically in a finally block.
   */
  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      // Give permit directly to next waiter (don't increment permits)
      next();
    } else {
      // Return permit to pool
      this.permits++;
    }
  }

  /**
   * Number of currently available permits.
   */
  get available(): number {
    return this.permits;
  }

  /**
   * Number of tasks waiting for permits.
   */
  get waiting(): number {
    return this.waitQueue.length;
  }
}
