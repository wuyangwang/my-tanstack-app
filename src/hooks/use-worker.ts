import { useEffect, useRef, useCallback } from 'react';

export function useWorker() {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../lib/whisper-worker.ts?worker", import.meta.url), { type: 'module' });
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, []);

  const postMessage = useCallback((message: any, transfer?: Transferable[]) => {
    if (workerRef.current) {
      workerRef.current.postMessage(message, transfer || []);
    }
  }, []);

  const setOnMessage = useCallback((handler: (e: MessageEvent) => void) => {
    if (workerRef.current) {
      workerRef.current.onmessage = handler;
    }
  }, []);

  return {
    postMessage,
    setOnMessage,
    terminate: () => workerRef.current?.terminate(),
  };
}
