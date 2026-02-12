"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { useWorker } from "./use-worker";
import { decodeAudioData } from "@/lib/audio-utils";
import WhisperWorker from "@/lib/whisper-worker.ts?worker";

export type TranscriptionTask = "transcribe" | "translate";
export type TranscriptionLanguage = "chinese" | "english";

export interface TranscriptionResult {
  text: string;
  chunks: Array<{
    timestamp: [number, number];
    text: string;
  }>;
}

export function useTranscription() {
  const [model, setModel] = useState("onnx-community/whisper-tiny");
  const [task, setTask] = useState<TranscriptionTask>("transcribe");
  const [language, setLanguage] = useState<TranscriptionLanguage>("chinese");
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [result, setResult] = useState<TranscriptionResult | null>(null);

  const workerUrl = useMemo(() => new WhisperWorker(), []);
  const { postMessage, setOnMessage } = useWorker(workerUrl);

  useEffect(() => {
    setOnMessage((e: MessageEvent) => {
      const { status: workerStatus, message, result: workerResult, error, file, progress: p } = e.data;
      
      switch (workerStatus) {
        case "init":
          setStatus(message);
          setProgress({});
          break;
        case "progress":
          if (file) {
            setProgress(prev => ({ ...prev, [file]: p }));
          }
          break;
        case "processing":
          setStatus(message);
          setProgress({});
          break;
        case "ready":
          setStatus("");
          setProgress({});
          break;
        case "complete":
          setResult(workerResult);
          setLoading(false);
          setStatus("");
          setProgress({});
          toast.success("转换成功");
          break;
        case "error":
          toast.error(`错误: ${error || message}`);
          setLoading(false);
          setStatus("");
          setProgress({});
          break;
      }
    });
  }, [setOnMessage]);

  const transcribe = useCallback(async (audioData: ArrayBuffer) => {
    setLoading(true);
    setResult(null);
    
    try {
      setStatus("正在解码音频...");
      const audio = await decodeAudioData(audioData);
      
      postMessage({
        audio,
        model,
        task,
        language,
      });
    } catch (error: any) {
      toast.error(`音频处理失败: ${error.message}`);
      setLoading(false);
      setStatus("");
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
