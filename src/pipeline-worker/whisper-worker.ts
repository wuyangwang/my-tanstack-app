import { getPipeline, handleError } from './shared';
import type {
  TranscriptionLanguage,
  TranscriptionTask,
  TranscriptionWorkerRequest,
  TranscriptionWorkerResponse,
} from '../lib/worker-messages';

let transcriber: any = null;
let transcriberModel = "";
let isProcessing = false;

async function getTranscriber(model: string, requestId: number) {
  if (transcriber && transcriberModel === model) {
    return transcriber;
  }

  transcriber = await getPipeline('automatic-speech-recognition', model, {}, { requestId });
  transcriberModel = model;
  return transcriber;
}

function toLanguageCode(language: TranscriptionLanguage) {
  return language === "chinese" ? "zh" : "en";
}

function isWhisperModel(model: string) {
  return model.toLowerCase().includes("whisper");
}

function buildAsrOptions(model: string, task: TranscriptionTask, language: TranscriptionLanguage) {
  const options: Record<string, unknown> = {
    chunk_length_s: 30,
    stride_length_s: 5,
    language: toLanguageCode(language),
    return_timestamps: true,
  };

  // `translate` is Whisper-specific in this app.
  if (task === "translate") {
    if (!isWhisperModel(model)) {
      throw new Error("当前模型不支持翻译任务，请切换到 Whisper 模型。");
    }
    options.task = "translate";
  } else {
    options.task = "transcribe";
  }

  return options;
}

self.onmessage = async (event: MessageEvent<TranscriptionWorkerRequest>) => {
  const { audio, model, task, language, requestId, type } = event.data;
  if (type !== 'transcription:run') return;
  if (!audio) return;

  // Avoid overlapping long-running ASR calls.
  if (isProcessing) {
    return;
  }

  isProcessing = true;
  try {
    const p = await getTranscriber(model, requestId);

    const processingMessage: TranscriptionWorkerResponse = {
      status: 'processing',
      requestId,
      message: 'Processing audio...',
    };
    self.postMessage(processingMessage);

    const result = await p(audio, buildAsrOptions(model, task, language));

    const completeMessage: TranscriptionWorkerResponse = {
      status: 'complete',
      requestId,
      result,
    };
    self.postMessage(completeMessage);
  } catch (error: any) {
    handleError(error, requestId);
  } finally {
    isProcessing = false;
  }
};
