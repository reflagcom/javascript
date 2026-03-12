function delay(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function retryOnThrow<T>(
  retryDelaysMs: number[],
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retryDelaysMs.length) {
        throw error;
      }

      await delay(retryDelaysMs[attempt] ?? 0);
    }
  }

  throw lastError;
}
