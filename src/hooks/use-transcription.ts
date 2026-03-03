import { useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useWorker } from "./use-worker";
import { decodeAudioData } from "@/lib/audio-utils";
import type {
	TranscriptionLanguage,
	TranscriptionResult,
	TranscriptionTask,
	TranscriptionWorkerRequest,
	TranscriptionWorkerResponse,
} from "@/lib/worker-messages";

export type { TranscriptionTask, TranscriptionLanguage, TranscriptionResult };

export function useTranscription() {
  const [model, setModel] = useState("onnx-community/whisper-tiny");
  const [task, setTask] = useState<TranscriptionTask>("transcribe");
  const [language, setLanguage] = useState<TranscriptionLanguage>("chinese");
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const inFlightRef = useRef(false);
  const requestCounterRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const { postMessage, setOnMessage } = useWorker('transcription');

  useEffect(() => {
    setOnMessage((e: MessageEvent<TranscriptionWorkerResponse>) => {
      const data = e.data;
      if (activeRequestIdRef.current !== data.requestId) {
        return;
      }
      
      switch (data.status) {
        case "init":
          setStatus(data.message);
          setProgress({});
          break;
        case "progress":
          if (data.file) {
            setProgress(prev => ({ ...prev, [data.file]: data.progress }));
          }
          break;
        case "processing":
          setStatus(data.message);
          setProgress({});
          break;
        case "ready":
          setStatus("");
          setProgress({});
          break;
        case "complete":
          inFlightRef.current = false;
          activeRequestIdRef.current = null;
          setResult(data.result);
          setLoading(false);
          setStatus("");
          setProgress({});
          toast.success("转换成功");
          break;
        case "error":
          inFlightRef.current = false;
          activeRequestIdRef.current = null;
          toast.error(`错误: ${data.error}`);
          setLoading(false);
          setStatus("");
          setProgress({});
          break;
      }
    });
  }, [setOnMessage]);

  const transcribe = useCallback(async (audioData: ArrayBuffer) => {
    if (inFlightRef.current) {
      return false;
    }

    inFlightRef.current = true;
    setLoading(true);
    setProgress({});
    setResult(null);
    
    try {
      setStatus("正在解码音频...");
      const audio = await decodeAudioData(audioData);
      const requestId = ++requestCounterRef.current;
      activeRequestIdRef.current = requestId;
      
      const message: TranscriptionWorkerRequest = {
        type: "transcription:run",
        requestId,
        audio,
        model,
        task,
        language,
      };

      postMessage(message, [audio.buffer as ArrayBuffer]);
      return true;
    } catch (error: any) {
      inFlightRef.current = false;
      activeRequestIdRef.current = null;
      toast.error(`音频处理失败: ${error.message}`);
      setLoading(false);
      setStatus("");
      return false;
    }
  }, [postMessage, model, task, language]);

  return {
    // Settings
    model,
    setModel,
    task,
    setTask,
    language,
    setLanguage,
    
    // Actions
    transcribe,
    
    // State
    loading,
    status,
    progress,
    result,
  };
}
