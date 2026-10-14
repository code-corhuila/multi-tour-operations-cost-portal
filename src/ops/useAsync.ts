import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'data'; data: T };

// Four states of a view; a newer request replaces the older one (norm 5.4: only the last answer is shown).
export function useAsync<T>(load: () => Promise<T>): { state: AsyncState<T>; retry: () => void; set: (data: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({ kind: 'loading' });
  const latest = useRef(0);

  const run = useCallback(() => {
    const id = ++latest.current;
    setState({ kind: 'loading' });
    load().then(
      (data) => id === latest.current && setState({ kind: 'data', data }),
      () => id === latest.current && setState({ kind: 'error' }),
    );
  }, [load]);

  useEffect(run, [run]);
  return { state, retry: run, set: (data) => setState({ kind: 'data', data }) };
}
