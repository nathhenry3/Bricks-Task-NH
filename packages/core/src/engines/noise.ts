import { nextSecureFloat } from "../infrastructure/random";

export interface GaussianNoiseConfig {
  width: number;
  height: number;
  mean: number;
  stdDev: number;
}

/**
 * Box-Muller transform to generate standard normally distributed random numbers.
 */
function randomGaussian(mean: number, stdDev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = nextSecureFloat();
  while (v === 0) v = nextSecureFloat();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return num * stdDev + mean;
}

/**
 * Generates an ImageData object containing Gaussian visual noise.
 * Useful as a background for cognitive tasks like SFT.
 */
export function generateGaussianNoiseImage(
  ctx: CanvasRenderingContext2D,
  config: GaussianNoiseConfig,
): ImageData {
  const { width, height, mean, stdDev } = config;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  const length = width * height * 4;

  for (let i = 0; i < length; i += 4) {
    let val = Math.round(randomGaussian(mean, stdDev));
    if (val < 0) val = 0;
    if (val > 255) val = 255;

    // Grayscale
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255; // Fully opaque
  }

  return imageData;
}

/**
 * Renders Gaussian noise directly onto a canvas context.
 */
export function renderGaussianNoise(
  ctx: CanvasRenderingContext2D,
  config: GaussianNoiseConfig,
  x = 0,
  y = 0,
): void {
  const imageData = generateGaussianNoiseImage(ctx, config);
  ctx.putImageData(imageData, x, y);
}
