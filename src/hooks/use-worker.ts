import { useEffect, useRef, useCallback } from 'react';

const DEFAULT_OPTIONS: WorkerOptions = { type: 'module' };

export function useWorker(url: URL, options: WorkerOptions = DEFAULT_OPTIONS) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const worker = new Worker(url, options);
    workerRef.current = worker;

    return () => {
      worker.terminate();
    };
  }, [url, options]);

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
