import { IOS_LOCALE_MAP } from './storeLocales.mjs';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CREATIVE_UPLOAD_SPECS = { header: { width:3840,height:1646 }, search: { width:3840,height:2560 } };
export function validateCreativeImage({ placement, locale, data } = {}) {
  if (!Object.hasOwn(CREATIVE_UPLOAD_SPECS, placement)) throw new Error('Choose Header or Search Results.');
  if (!Object.hasOwn(IOS_LOCALE_MAP, locale) && locale !== 'fil') throw new Error('Unsupported Studio language.');
  if (typeof data !== 'string' || !data.length || data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('Provide a JPEG smaller than 10 MB.');
  }
  const bytes = Buffer.from(data, 'base64');
  if (bytes.toString('base64') !== data || bytes.length > MAX_IMAGE_BYTES || bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) {
    throw new Error('The creative must be a complete JPEG.');
  }
  const spec = CREATIVE_UPLOAD_SPECS[placement];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 17) {
      if (bytes[offset + 2] !== 8 || bytes[offset + 7] !== 3) throw new Error('Use an RGB JPEG without transparency.');
      if (bytes.readUInt16BE(offset + 3) !== spec.height || bytes.readUInt16BE(offset + 5) !== spec.width) {
        throw new Error(`This creative must be ${spec.width} × ${spec.height} pixels.`);
      }
      return bytes;
    }
    offset += length;
  }
  throw new Error('Could not read the JPEG dimensions.');
}

