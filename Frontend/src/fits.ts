export type FitsImage = {
  fileName: string;
  imageUrl: string;
  width: number;
  height: number;
  axes: number[];
  bitpix: number;
  min: number;
  max: number;
  finitePixels: number;
  hdu: string;
};

const FITS_BLOCK_SIZE = 2880;
const CARD_SIZE = 80;
const HISTOGRAM_BINS = 2048;
const MAX_IMAGE_PIXELS = 40_000_000;

function cardValue(card: string): string | undefined {
  if (card[8] !== "=") return undefined;
  const raw = card.slice(10).trimStart();

  if (raw.startsWith("'")) {
    let value = "";
    for (let index = 1; index < raw.length; index += 1) {
      if (raw[index] !== "'") {
        value += raw[index];
      } else if (raw[index + 1] === "'") {
        value += "'";
        index += 1;
      } else {
        break;
      }
    }
    return value.trimEnd();
  }

  return raw.split("/", 1)[0].trim();
}

function numericValue(header: Map<string, string>, key: string, fallback?: number): number {
  const raw = header.get(key);
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw?.replace(/[dD]/, "E"));
  if (!Number.isFinite(value)) throw new Error(`Invalid FITS header value for ${key}.`);
  return value;
}

function readPixel(view: DataView, offset: number, bitpix: number): number {
  switch (bitpix) {
    case 8:
      return view.getUint8(offset);
    case 16:
      return view.getInt16(offset, false);
    case 32:
      return view.getInt32(offset, false);
    case 64:
      return Number(view.getBigInt64(offset, false));
    case -32:
      return view.getFloat32(offset, false);
    case -64:
      return view.getFloat64(offset, false);
    default:
      throw new Error(`Unsupported FITS BITPIX value: ${bitpix}.`);
  }
}

function percentile(
  histogram: Uint32Array,
  count: number,
  min: number,
  max: number,
  fraction: number,
): number {
  if (min === max) return min;
  const target = Math.floor((count - 1) * fraction);
  let cumulative = 0;
  for (let index = 0; index < histogram.length; index += 1) {
    cumulative += histogram[index];
    if (cumulative > target) {
      return min + ((index + 0.5) / histogram.length) * (max - min);
    }
  }
  return max;
}

export async function decodeFitsImage(file: File): Promise<FitsImage> {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > 512 * 1024 * 1024) {
    throw new Error("FITS files larger than 512 MiB are not supported in this browser view.");
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decodeCard = (offset: number) => {
    let card = "";
    for (let index = 0; index < CARD_SIZE; index += 1) {
      card += String.fromCharCode(bytes[offset + index]);
    }
    return card;
  };
  let offset = 0;
  let validFitsHeader = false;

  while (offset + FITS_BLOCK_SIZE <= bytes.length) {
    const header = new Map<string, string>();
    let foundEnd = false;
    const headerStart = offset;

    while (!foundEnd) {
      if (offset + FITS_BLOCK_SIZE > bytes.length) {
        throw new Error("The FITS header is incomplete.");
      }
      for (let index = 0; index < FITS_BLOCK_SIZE; index += CARD_SIZE) {
        const card = decodeCard(offset + index);
        const key = card.slice(0, 8).trim();
        if (key === "END") {
          foundEnd = true;
          break;
        }
        const value = cardValue(card);
        if (key && value !== undefined) header.set(key, value);
      }
      offset += FITS_BLOCK_SIZE;
    }

    const isPrimary = header.get("SIMPLE") === "T";
    const extension = header.get("XTENSION")?.trim().toUpperCase();
    validFitsHeader ||= isPrimary || Boolean(extension);

    const bitpix = numericValue(header, "BITPIX");
    const axisCount = numericValue(header, "NAXIS");
    if (!Number.isInteger(axisCount) || axisCount < 0 || axisCount > 999) {
      throw new Error("The FITS header contains an invalid NAXIS value.");
    }
    const axes = Array.from({ length: axisCount }, (_, index) =>
      numericValue(header, `NAXIS${index + 1}`),
    );
    if (axes.some((axis) => !Number.isSafeInteger(axis) || axis < 0)) {
      throw new Error("The FITS header contains invalid image dimensions.");
    }

    if (![8, 16, 32, 64, -32, -64].includes(bitpix)) {
      throw new Error(`Unsupported FITS BITPIX value: ${bitpix}.`);
    }
    const bytesPerPixel = Math.abs(bitpix) / 8;
    const axisElements = axisCount === 0 ? 0 : axes.reduce((product, axis) => product * axis, 1);
    const groupCount = numericValue(header, "GCOUNT", 1);
    const parameterCount = numericValue(header, "PCOUNT", 0);
    const dataBytes = groupCount * (parameterCount + axisElements * bytesPerPixel);
    if (!Number.isSafeInteger(dataBytes) || dataBytes < 0 || offset + dataBytes > bytes.length) {
      throw new Error("The FITS data section is incomplete or too large.");
    }

    const width = axes[0] ?? 0;
    const height = axes[1] ?? 0;
    const pixelCount = width * height;
    const isImageHdu = isPrimary || extension === "IMAGE";

    if (isImageHdu && axisCount >= 2 && pixelCount > 0 && axisElements >= pixelCount) {
      if (!Number.isSafeInteger(pixelCount) || pixelCount > MAX_IMAGE_PIXELS) {
        throw new Error("This FITS image exceeds the 40-megapixel browser display limit.");
      }

      const blank = header.has("BLANK") ? numericValue(header, "BLANK") : undefined;
      const scale = numericValue(header, "BSCALE", 1);
      const zero = numericValue(header, "BZERO", 0);
      const dataOffset = offset;
      const valueAt = (index: number) => {
        const raw = readPixel(view, dataOffset + index * bytesPerPixel, bitpix);
        return raw === blank ? Number.NaN : raw * scale + zero;
      };
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let finitePixels = 0;

      for (let index = 0; index < pixelCount; index += 1) {
        const value = valueAt(index);
        if (!Number.isFinite(value)) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
        finitePixels += 1;
      }
      if (finitePixels === 0) throw new Error("The FITS image contains no finite pixel values.");

      const histogram = new Uint32Array(HISTOGRAM_BINS);
      if (min !== max) {
        for (let index = 0; index < pixelCount; index += 1) {
          const value = valueAt(index);
          if (!Number.isFinite(value)) continue;
          const bin = Math.min(
            HISTOGRAM_BINS - 1,
            Math.floor(((value - min) / (max - min)) * HISTOGRAM_BINS),
          );
          histogram[bin] += 1;
        }
      } else {
        histogram[0] = finitePixels;
      }

      const low = percentile(histogram, finitePixels, min, max, 0.01);
      const high = percentile(histogram, finitePixels, min, max, 0.99);
      const contrast = high > low ? high - low : 1;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser could not create an image canvas.");
      const image = context.createImageData(width, height);

      for (let index = 0; index < pixelCount; index += 1) {
        const value = valueAt(index);
        const intensity = Number.isFinite(value)
          ? min === max
            ? 128
            : Math.round(Math.max(0, Math.min(1, (value - low) / contrast)) * 255)
          : 0;
        const sourceRow = Math.floor(index / width);
        const column = index % width;
        const target = ((height - 1 - sourceRow) * width + column) * 4;
        image.data[target] = intensity;
        image.data[target + 1] = intensity;
        image.data[target + 2] = intensity;
        image.data[target + 3] = 255;
      }
      context.putImageData(image, 0, 0);

      return {
        fileName: file.name,
        imageUrl: canvas.toDataURL("image/png"),
        width,
        height,
        axes,
        bitpix,
        min,
        max,
        finitePixels,
        hdu: header.get("EXTNAME")?.trim() || (isPrimary ? "PRIMARY" : "IMAGE"),
      };
    }

    offset += Math.ceil(dataBytes / FITS_BLOCK_SIZE) * FITS_BLOCK_SIZE;
    if (offset <= headerStart) throw new Error("The FITS file contains an invalid HDU.");
  }

  if (!validFitsHeader) throw new Error("The selected file does not contain a valid FITS header.");
  throw new Error("No supported two-dimensional FITS image was found.");
}
