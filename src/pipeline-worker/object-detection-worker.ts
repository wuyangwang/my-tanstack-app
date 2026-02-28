import { RawImage } from '@huggingface/transformers';
import { getPipeline, handleError } from './shared';

let detector: any = null;

async function getDetector(model: string) {
  if (detector && detector.model.config._name_or_path === model) {
    return detector;
  }

  detector = await getPipeline('object-detection', model);
  return detector;
}

self.onmessage = async (event) => {
  const { image, model, threshold } = event.data;
  if (!image) return;

  try {
    const p = await getDetector(model);

    const rawImage = await RawImage.read(image);
    
    const result = await p(rawImage, {
      threshold: threshold || 0.5,
      percentage: true,
    });

    self.postMessage({ status: 'complete', result });
  } catch (error: any) {
    handleError(error);
  }
};
