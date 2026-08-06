export const DEFAULT_API_CONCURRENCY = 6;

type QueuedTask<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal | null;
  onAbort?: () => void;
};

class AsyncLimiter {
  private active = 0;
  private readonly queue: QueuedTask<unknown>[] = [];

  constructor(private readonly limit: number) {}

  schedule<T>(run: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(
        signal.reason ?? new DOMException("Request cancelled", "AbortError"),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = { run, resolve, reject, signal };
      if (signal) {
        task.onAbort = () => {
          const index = this.queue.indexOf(task as QueuedTask<unknown>);
          if (index >= 0) this.queue.splice(index, 1);
          reject(signal.reason ?? new DOMException("Request cancelled", "AbortError"));
        };
        signal.addEventListener("abort", task.onAbort, { once: true });
      }
      this.queue.push(task as QueuedTask<unknown>);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.limit && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) return;
      if (task.signal?.aborted) {
        task.reject(
          task.signal.reason ?? new DOMException("Request cancelled", "AbortError"),
        );
        continue;
      }
      if (task.onAbort) task.signal?.removeEventListener("abort", task.onAbort);
      this.active += 1;
      void task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

const apiLimiter = new AsyncLimiter(DEFAULT_API_CONCURRENCY);

export function limitApiRequest<T>(
  run: () => Promise<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  return apiLimiter.schedule(run, signal);
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  mapper: (value: T, index: number) => Promise<R>,
  concurrency = DEFAULT_API_CONCURRENCY,
): Promise<R[]> {
  if (values.length === 0) return [];
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
