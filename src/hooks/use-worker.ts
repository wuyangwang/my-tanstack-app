import { useEffect, useRef, useCallback } from 'react';

export function useWorker(workerUrl: URL | string) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(workerUrl, { type: 'module' });
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, [workerUrl]);

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
