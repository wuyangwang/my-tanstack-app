import { AutoTokenizer, env, pipeline, type PipelineType } from '@huggingface/transformers';
import { checkWebGPU } from '../lib/webgpu';

// onnxEnv.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';
// env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0-dev.20250409-89f8206ba4/dist/';

// Skip local model check since we are in the browser
env.allowLocalModels = false;
env.useBrowserCache = true;

console.log('---------env ',env)

interface PipelineMessageContext {
  requestId: number;
}

type InferenceDevice = 'webgpu' | 'wasm';
type InferenceDtype = 'fp16' | 'q8';

function getPreferredDtype(task: PipelineType, model: string, device: InferenceDevice): InferenceDtype {
  const lowerModel = model.toLowerCase();
  const isAsr = task === 'automatic-speech-recognition';
  const isWhisper = lowerModel.includes('whisper');
  const isMoonshine = lowerModel.includes('moonshine');

  if (device === 'wasm') {
    return 'q8';
  }

  if (isAsr && isWhisper) {
    return 'fp16';
  }

  if (isAsr && isMoonshine) {
    return 'q8';
  }

  return 'q8';
}

function shouldRetryWithQ8(error: unknown) {
  const message = String((error as any)?.message ?? '').toLowerCase();
  return (
    message.includes('dtype') ||
    message.includes('fp16') ||
    message.includes('shader-f16') ||
    message.includes('unsupported')
  );
}

function shouldFallbackToWasm(error: unknown) {
  const message = String((error as any)?.message ?? '');
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('webgpu') ||
    lowerMessage.includes('validation') ||
    message.includes('ComputePipeline')
  );
}

async function ensureMoonshineTokenizer(
  task: PipelineType,
  model: string,
  pipelineInstance: any,
  requestId: number
) {
  const isMoonshineAsrModel =
    task === 'automatic-speech-recognition' &&
    model.toLowerCase().includes('moonshine');

  if (!isMoonshineAsrModel) {
    return;
  }

  if (pipelineInstance?.processor?.tokenizer) {
    return;
  }

  self.postMessage({
    status: 'init',
    requestId,
    message: `Tokenizer missing for ${model}, loading tokenizer from model root...`
  });

  try {
    const tokenizer = await AutoTokenizer.from_pretrained(model, {
      subfolder: '',
    });

    if (!tokenizer) {
      throw new Error('Tokenizer not found in model repository.');
    }

    if (pipelineInstance?.processor?.components) {
      pipelineInstance.processor.components.tokenizer = tokenizer;
    }
    pipelineInstance.tokenizer = tokenizer;
  } catch (error: any) {
    throw new Error(
      `Moonshine tokenizer 加载失败，请先改用 Whisper 模型。原始错误: ${error?.message ?? error}`
    );
  }
}

/**
 * Common configuration and pipeline initialization for Hugging Face Transformers.
 */
export async function getPipeline(
  task: PipelineType,
  model: string,
  options: any = {},
  context: PipelineMessageContext
) {
  const {
    progress_callback: externalProgressCallback,
    device: requestedDevice,
    ...restOptions
  } = options;

  // Check for WebGPU support
  const isWebGPUSupported = await checkWebGPU();
  const isMoonshineAsrModel =
    task === 'automatic-speech-recognition' &&
    model.toLowerCase().includes('moonshine');
  const autoDevice = isWebGPUSupported && !isMoonshineAsrModel ? 'webgpu' : 'wasm';
  const device = (requestedDevice ?? autoDevice) as 'webgpu' | 'wasm';
  console.log('isWebGPUSupported', isWebGPUSupported)

  self.postMessage({
    status: 'init',
    requestId: context.requestId,
    message: `Initializing ${model} on ${device}...`
  });

  const createPipeline = async (targetDevice: InferenceDevice, targetDtype: InferenceDtype) => {
    return pipeline(task, model, {
      device: targetDevice as any,
      dtype: targetDtype,
      progress_callback: (progress: any) => {
        self.postMessage({
          status: 'progress',
          requestId: context.requestId,
          file: progress.file,
          progress: progress.progress
        });
        if (typeof externalProgressCallback === 'function') {
          externalProgressCallback(progress);
        }
      },
      ...restOptions
    });
  };

  let p: any;
  let loadedDevice: 'webgpu' | 'wasm' = device;
  let loadedDtype: InferenceDtype = getPreferredDtype(task, model, device);
  try {
    p = await createPipeline(device, loadedDtype);
  } catch (error: any) {
    const canRetryWithQ8 =
      device === 'webgpu' &&
      loadedDtype === 'fp16' &&
      shouldRetryWithQ8(error);

    if (canRetryWithQ8) {
      self.postMessage({
        status: 'init',
        requestId: context.requestId,
        message: `fp16 initialization failed for ${model}, retrying on webgpu(q8)...`
      });
      loadedDtype = 'q8';
      try {
        p = await createPipeline('webgpu', loadedDtype);
      } catch (retryError: any) {
        if (!shouldFallbackToWasm(retryError)) {
          throw retryError;
        }
        self.postMessage({
          status: 'init',
          requestId: context.requestId,
          message: `WebGPU initialization failed for ${model}, retrying on wasm(q8)...`
        });
        loadedDevice = 'wasm';
        loadedDtype = 'q8';
        p = await createPipeline('wasm', loadedDtype);
      }
    } else if (device === 'webgpu' && shouldFallbackToWasm(error)) {
      self.postMessage({
        status: 'init',
        requestId: context.requestId,
        message: `WebGPU initialization failed for ${model}, retrying on wasm(q8)...`
      });
      loadedDevice = 'wasm';
      loadedDtype = 'q8';
      p = await createPipeline('wasm', loadedDtype);
    } else {
      throw error;
    }
  }

  await ensureMoonshineTokenizer(task, model, p, context.requestId);

  self.postMessage({
    status: 'ready',
    requestId: context.requestId,
    message: `Model loaded on ${loadedDevice} (${loadedDtype})`
  });
  return p;
}

/**
 * Handle worker errors and send messages back to main thread.
 */
export function handleError(error: any, requestId: number) {
  console.error('Worker error:', error);
  self.postMessage({
    status: 'error',
    requestId,
    error: error?.message || 'Unknown worker error',
  });
}
