import { useRef, useState } from 'react';

// Key of the same data is reused on a retry and renewed when the data change (norm 5.3, RN-OPS-PT-40, plan D-05).
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useRegistration() {
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const last = useRef<{ signature: string; key: string } | undefined>(undefined);

  async function submit(signature: string, send: (key: string) => Promise<void>): Promise<boolean> {
    if (last.current?.signature !== signature) last.current = { signature, key: newKey() };
    setSending(true);
    setFailed(false);
    try {
      await send(last.current.key);
      last.current = undefined;
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setSending(false);
    }
  }

  return { sending, failed, submit };
}
