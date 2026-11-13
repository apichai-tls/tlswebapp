type CaptureTask = () => Promise<void>;

const captureQueue: CaptureTask[] = [];
let isProcessingQueue = false;

function waitIdleOrDelay(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function') {
        (window as any).requestIdleCallback(() => resolve(), { timeout: 2500 });
      } else {
        resolve();
      }
    }, delayMs);
  });
}

async function drainCaptureQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  try {
    // Wait for modal teardown, receipt preview paint, and user interaction to settle completely
    await waitIdleOrDelay(1400);

    while (captureQueue.length > 0) {
      const nextTask = captureQueue.shift();
      if (!nextTask) continue;
      try {
        await nextTask();
      } catch (err) {
        console.warn('[BackgroundCaptureQueue] Task error:', err);
      }
      if (captureQueue.length > 0) {
        await waitIdleOrDelay(450);
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Enqueue heavy html2canvas-pro DOM captures so they NEVER run concurrently
 * or block the main thread during Save / Payment button clicks on older computers.
 */
export function enqueueBackgroundCapture(task: CaptureTask): void {
  captureQueue.push(task);
  void drainCaptureQueue();
}
