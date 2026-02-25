/**
 * Checks if the browser supports WebGPU and the necessary features (like shader-f16).
 * @returns {Promise<boolean>}
 */
export async function checkWebGPU(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // Core check: whether the hardware supports fp16
        return adapter.features.has('shader-f16');
      }
      return false
    } catch (e) {
      console.warn('WebGPU not available, falling back to WASM', e);
    }
  }
  return false;
}
