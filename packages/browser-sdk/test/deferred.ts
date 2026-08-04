// TODO: Use Promise.withResolvers<T>() when the configured TypeScript lib and supported runtimes include it.
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
