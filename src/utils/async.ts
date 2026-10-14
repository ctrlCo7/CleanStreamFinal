/** Rejects if `promise` hasn't settled within `ms` -- the underlying work is not cancelled. */
export const withTimeout = <T,>(promise: Promise<T>, ms: number, label = 'Operation'): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
