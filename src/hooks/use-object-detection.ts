import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWorker } from './use-worker';

export interface DetectionResult {
  label: string;
  score: number;
  box: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
}

export function useObjectDetection() {
  const [model, setModel] = useState('onnx-community/rfdetr_medium-ONNX');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [results, setResults] = useState<DetectionResult[]>([]);
  
  const worker = new Worker(new URL('../lib/object-detection-worker.ts?worker&url', import.meta.url), { type: 'module' })
  const { postMessage, setOnMessage } = useWorker(worker);

  useEffect(() => {
    setOnMessage((event: MessageEvent) => {
      const { status, message, result, file, progress: p } = event.data;

      switch (status) {
        case 'init':
          setLoading(true);
          setStatus(message);
          break;
        case 'progress':
          setProgress((prev) => ({ ...prev, [file]: p }));
          break;
        case 'ready':
          setLoading(false);
          setStatus('Ready');
          break;
        case 'complete':
          setResults(result);
          break;
        case 'error':
          setLoading(false);
          setStatus(`Error: ${message}`);
          break;
      }
    });
  }, [setOnMessage]);

  const detect = useCallback(async (image: ImageBitmap, threshold = 0.5) => {
    postMessage({
      image,
      model,
      threshold
    }, [image]);
  }, [postMessage, model]);

  return {
    model,
    setModel,
    detect,
    loading,
    status,
    progress,
    results
  };
}
