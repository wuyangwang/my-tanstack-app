import { env, pipeline, type PipelineType } from '@huggingface/transformers';
import { checkWebGPU } from '../lib/webgpu';

// onnxEnv.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';
// env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';

// Skip local model check since we are in the browser
env.allowLocalModels = false;
env.useBrowserCache = true;

console.log('---------env ',env)

/**
 * Common configuration and pipeline initialization for Hugging Face Transformers.
 */
export async function getPipeline(task: PipelineType, model: string, options: any = {}) {
  // Check for WebGPU support
  const isWebGPUSupported = await checkWebGPU();
  const device = isWebGPUSupported ? 'webgpu' : 'wasm';
  console.log('isWebGPUSupported', isWebGPUSupported)

  self.postMessage({ status: 'init', message: `Initializing ${model} on ${device}...` });

  const p = await pipeline(task, model, {
    device: device as any,
    dtype: isWebGPUSupported ? 'fp16' : 'q8', // fall back to quantized if no webgpu
    progress_callback: (progress: any) => {
      self.postMessage({
        status: 'progress',
        ...progress
      });
    },
    ...options
  });

  self.postMessage({ status: 'ready', message: `Model loaded on ${device}` });
  return p;
}

/**
 * Handle worker errors and send messages back to main thread.
 */
export function handleError(error: any) {
  console.error('Worker error:', error);
  self.postMessage({ status: 'error', message: error.message });
}
