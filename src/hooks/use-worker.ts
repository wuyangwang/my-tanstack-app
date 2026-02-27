import { useEffect, useRef, useCallback } from 'react';

export type WorkerType = 'object-detection' | 'transcription';

export function useWorker(type: WorkerType) {
  const workerRef = useRef<Worker | null>(null);
  const onMessageRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    let worker: Worker;
    
    switch (type) {
      case 'object-detection':
        worker = new Worker(
          new URL('../pipeline-worker/object-detection-worker.ts?worker', import.meta.url),
          { type: 'module' }
        );
        break;
      case 'transcription':
        worker = new Worker(
          new URL('../pipeline-worker/whisper-worker.ts?worker', import.meta.url),
          { type: 'module' }
        );
        break;
      default:
        return;
    }

    workerRef.current = worker;
    
    if (onMessageRef.current) {
      worker.onmessage = onMessageRef.current;
    }

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [type]);

  const postMessage = useCallback((message: any, transfer: Transferable[] = []) => {
    if (workerRef.current) {
      workerRef.current.postMessage(message, transfer);
    }
  }, []);

  const setOnMessage = useCallback((handler: (e: MessageEvent) => void) => {
    onMessageRef.current = handler;
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
