import { env, AutoProcessor, AutoModel, RawImage, pipeline } from '@huggingface/transformers';
import { checkWebGPU } from './webgpu';

// Skip local model check since we are in the browser
env.allowLocalModels = false;
env.useBrowserCache = true;

let detector: any = null;

async function getDetector(model: string) {
  if (detector && detector.model.config._name_or_path === model) {
    return detector;
  }

  // Check for WebGPU support
  const isWebGPUSupported = await checkWebGPU();
  const device = isWebGPUSupported ? 'webgpu' : 'wasm';

  self.postMessage({ status: 'init', message: `Initializing ${model} on ${device}...` });

  detector = await pipeline('object-detection', model, {
    device: device as any,
    dtype: isWebGPUSupported ? 'fp16' : 'q8', // fall back to quantized if no webgpu
    progress_callback: (progress: any) => {
      self.postMessage({
        status: 'progress',
        ...progress
      });
    }
  });

  self.postMessage({ status: 'ready', message: `Model loaded on ${device}` });
  return detector;
}

self.onmessage = async (event) => {
  const { image, model, threshold } = event.data;

  try {
    const p = await getDetector(model);

    // image is expected to be an ImageBitmap or similar that RawImage can handle
    const rawImage = await RawImage.read(image);
    
    const result = await p(rawImage, {
      threshold: threshold || 0.5,
      percentage: true,
    });

    self.postMessage({ status: 'complete', result });
  } catch (error: any) {
    console.error('Worker error:', error);
    self.postMessage({ status: 'error', message: error.message });
  }
};
