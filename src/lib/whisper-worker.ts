import { pipeline, env } from '@huggingface/transformers';

// Skip local model check since we are in the browser
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber: any = null;

async function getTranscriber(model: string) {
  if (transcriber && transcriber.model.config._name_or_path === model) {
    return transcriber;
  }

  // Check for WebGPU support
  let device = 'wasm';
  if ('gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        device = 'webgpu';
      }
    } catch (e) {
      console.warn('WebGPU not available, falling back to WASM', e);
    }
  }
  
  self.postMessage({ status: 'init', message: `Initializing ${model} on ${device}...` });
  
  transcriber = await pipeline('automatic-speech-recognition', model, {
    device: device as any,
    dtype: device === 'webgpu' ? 'fp16' : 'fp32',
    progress_callback: (progress: any) => {
      self.postMessage({
        status: 'progress',
        ...progress
      });
    }
  });
  
  self.postMessage({ status: 'ready', message: `Model loaded on ${device}` });
  return transcriber;
}

self.onmessage = async (event) => {
  const { audio, model, task, language } = event.data;
  
  try {
    const p = await getTranscriber(model);
    
    self.postMessage({ status: 'processing', message: 'Transcribing...' });
    
    const result = await p(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      task: task,
      language: language,
      return_timestamps: true,
    });
    
    self.postMessage({ status: 'complete', result });
  } catch (error: any) {
    console.error('Worker error:', error);
    self.postMessage({ status: 'error', message: error.message });
  }
};
