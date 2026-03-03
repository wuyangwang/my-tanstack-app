import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorker } from './use-worker';
import type {
  DetectionResult,
  ObjectDetectionWorkerRequest,
  ObjectDetectionWorkerResponse,
} from '@/lib/worker-messages';

export function useObjectDetection() {
  const [model, setModel] = useState('onnx-community/rfdetr_medium-ONNX');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [results, setResults] = useState<DetectionResult[]>([]);
  const inFlightRef = useRef(false);
  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);
  
  const { postMessage, setOnMessage } = useWorker('object-detection');

  useEffect(() => {
    setOnMessage((event: MessageEvent<ObjectDetectionWorkerResponse>) => {
      const data = event.data;
      if (activeRequestIdRef.current !== data.requestId) {
        return;
      }

      switch (data.status) {
        case 'init':
          setLoading(true);
          setStatus(data.message);
          break;
        case 'progress':
          if (data.file) {
            setProgress((prev) => ({ ...prev, [data.file]: data.progress }));
          }
          break;
        case 'ready':
          setLoading(false);
          setStatus('Ready');
          break;
        case 'complete':
          inFlightRef.current = false;
          activeRequestIdRef.current = null;
          setLoading(false);
          setResults(data.result);
          break;
        case 'error':
          inFlightRef.current = false;
          activeRequestIdRef.current = null;
          setLoading(false);
          setStatus(`Error: ${data.error}`);
          break;
      }
    });
  }, [setOnMessage]);

  const detect = useCallback(async (image: string | ImageBitmap, threshold = 0.5) => {
    if (inFlightRef.current) {
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        image.close();
      }
      return false;
    }

    inFlightRef.current = true;
    setLoading(true);
    setProgress({});
    const requestId = ++requestCounterRef.current;
    activeRequestIdRef.current = requestId;
    const transfer = (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) ? [image] : [];
    try {
      const message: ObjectDetectionWorkerRequest = {
        type: 'object-detection:run',
        requestId,
        image,
        model,
        threshold
      };
      postMessage(message, transfer);
      return true;
    } catch (error) {
      inFlightRef.current = false;
      activeRequestIdRef.current = null;
      setLoading(false);
      if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        image.close();
      }
      throw error;
    }
  }, [postMessage, model]);

  return {
    model,
    setModel,
    detect,
    loading,
    status,
    progress,
    results,
    setResults
  };
}
