import { Input, ALL_FORMATS, BlobSource, CanvasSink, Output, Mp4OutputFormat, BufferTarget, Conversion } from 'mediabunny';

export interface LivePhotoResult {
  imageBlob: Blob;
  videoBlob: Blob | null;
  imagePreviewUrl: string;
  videoUrl: string | null;
}

/**
 * Extracts the image and video from an Apple Live Photo (HEIF/HEIC/MOV container).
 * If the file is a regular image, it returns the image with null video data.
 * @param file The uploaded file
 * @returns An object containing the image and video blobs and their preview URLs
 */
export async function extractLivePhoto(file: File): Promise<LivePhotoResult> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  // 1. Try to Extract Video Track
  let videoTrack;
  try {
    videoTrack = await input.getPrimaryVideoTrack();
  } catch (error) {
    videoTrack = null;
  }

  if (!videoTrack) {
    // If no video track, treat as a regular image
    const imagePreviewUrl = URL.createObjectURL(file);
    return {
      imageBlob: file,
      videoBlob: null,
      imagePreviewUrl,
      videoUrl: null,
    };
  }

  const videoOutput = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output: videoOutput,
  });
  await conversion.execute();

  const videoBlob = new Blob([videoOutput.target.buffer], { type: 'video/mp4' });
  const videoUrl = URL.createObjectURL(videoBlob);

  // 2. Extract Static Image (First frame of the video track for consistency, or primary item)
  // Note: Using CanvasSink to get a displayable PNG since browsers have limited HEIC support.
  const sink = new CanvasSink(videoTrack);
  const { canvas } = await sink.getCanvas(0);
  
  const imageBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create image blob from canvas.'));
    }, 'image/png');
  });

  const imagePreviewUrl = URL.createObjectURL(imageBlob);

  return {
    imageBlob,
    videoBlob,
    imagePreviewUrl,
    videoUrl,
  };
}

/**
 * Revokes the URLs created by extractLivePhoto to free up memory.
 */
export function revokeLivePhotoUrls(result: LivePhotoResult) {
  URL.revokeObjectURL(result.imagePreviewUrl);
  if (result.videoUrl) {
    URL.revokeObjectURL(result.videoUrl);
  }
}
