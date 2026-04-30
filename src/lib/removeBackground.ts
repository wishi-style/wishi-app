import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MAX_DIM = 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenterPromise: Promise<any> | null = null;
function getSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = pipeline("background-removal", "briaai/RMBG-1.4", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      device: "webgpu" as any,
    }).catch(() =>
      pipeline("background-removal", "briaai/RMBG-1.4")
    );
  }
  return segmenterPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function resize(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  let { width, height } = image;
  if (width > height && width > MAX_DIM) {
    height = Math.round((height * MAX_DIM) / width);
    width = MAX_DIM;
  } else if (height > MAX_DIM) {
    width = Math.round((width * MAX_DIM) / height);
    height = MAX_DIM;
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function removeBackground(src: string): Promise<string> {
  const segmenter = await getSegmenter();
  const img = await loadImage(src);
  const canvas = resize(img);
  const result = await segmenter(canvas.toDataURL("image/png"));
  const out = Array.isArray(result) ? result[0] : result;
  if (out?.url) return out.url;
  if (out?.toDataURL) return out.toDataURL();
  if (out?.image?.toDataURL) return out.image.toDataURL();

  const mask = out?.mask ?? out;
  const maskData: Uint8Array = mask.data;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < maskData.length; i++) {
    imgData.data[i * 4 + 3] = maskData[i];
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}
