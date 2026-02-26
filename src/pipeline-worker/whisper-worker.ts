import { getPipeline, handleError } from './shared';

let transcriber: any = null;

async function getTranscriber(model: string) {
  if (transcriber && transcriber.model.config._name_or_path === model) {
    return transcriber;
  }

  transcriber = await getPipeline('automatic-speech-recognition', model);
  return transcriber;
}

self.onmessage = async (event) => {
  const { audio, model, task, language } = event.data;

  try {
    const p = await getTranscriber(model);

    self.postMessage({ status: 'processing', message: 'Processing audio...' });

    // Whisper standard ASR
    const result = await p(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: task,
      language: language,
      return_timestamps: true,
    });

    self.postMessage({ status: 'complete', result });
  } catch (error: any) {
    handleError(error);
  }
};
