import { RawImage } from '@huggingface/transformers';
import { getPipeline, handleError } from './shared';
import type {
  ObjectDetectionWorkerRequest,
  ObjectDetectionWorkerResponse,
} from '../lib/worker-messages';

let detector: any = null;
let detectorModel = "";
let isProcessing = false;

async function getDetector(model: string, requestId: number) {
  if (detector && detectorModel === model) {
    return detector;
  }

  detector = await getPipeline('object-detection', model, {}, { requestId });
  detectorModel = model;
  return detector;
}

function normalizeImageInput(image: unknown) {
  if (typeof OffscreenCanvas !== "undefined" && image instanceof ImageBitmap) {
    const canvas = new OffscreenCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create 2D context for ImageBitmap.");
    }
    ctx.drawImage(image, 0, 0);
    return canvas;
  }

  return image;
}

self.onmessage = async (event: MessageEvent<ObjectDetectionWorkerRequest>) => {
  const { image, model, threshold, requestId, type } = event.data;
  if (!image) return;
  if (type !== 'object-detection:run') return;

  // For streaming mode, drop new frames while the previous inference is still running.
  if (isProcessing) {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      image.close();
    }
    return;
  }

  isProcessing = true;
  try {
    const p = await getDetector(model, requestId);
    const normalizedInput = normalizeImageInput(image);
    const rawImage = await RawImage.read(normalizedInput as any);

    const result = await p(rawImage, {
      threshold: threshold || 0.5,
      percentage: true,
    });

    const response: ObjectDetectionWorkerResponse = {
      status: 'complete',
      requestId,
      result,
    };
    self.postMessage(response);
  } catch (error: any) {
    handleError(error, requestId);
  } finally {
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      image.close();
    }
    isProcessing = false;
  }
};
