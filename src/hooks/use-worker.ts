import { useEffect, useRef, useCallback } from 'react';

export function useWorker(worker: Worker | null) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (!worker) return;
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, [worker]);

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
