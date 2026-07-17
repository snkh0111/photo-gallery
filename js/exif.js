/**
 * Lightweight EXIF parser for JPEG files
 * Reads camera make/model, aperture, shutter, ISO, focal length, lens, date taken
 */

/**
 * Parse EXIF data from a JPEG file blob
 * @param {Blob} file - JPEG image file
 * @returns {Promise<Object>} extracted EXIF fields
 */
async function parseExif(file) {
  const result = {
    make: '',
    model: '',
    lens: '',
    aperture: '',
    shutter: '',
    iso: '',
    focalLength: '',
    dateTaken: '',
  };

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);

    // Check JPEG SOI marker
    if (view.getUint16(0, false) !== 0xffd8) return result;

    let offset = 2;
    let tiffOffset = 0;

    // Find EXIF APP1 marker
    while (offset < view.byteLength - 1) {
      const marker = view.getUint16(offset, false);
      offset += 2;

      if (marker === 0xffe1) {
        // APP1 - likely EXIF
        const length = view.getUint16(offset, false);
        const exifId = readString(view, offset + 2, 6);
        // 'Exif\0\0' = 45 78 69 66 00 00
        if (exifId === 'Exif\x00\x00') {
          tiffOffset = offset + 8;
          break;
        }
        offset += length;
      } else if (marker >= 0xffd0 && marker <= 0xffd9) {
        // Other markers without length
      } else if (marker >= 0xffc0 && marker <= 0xfffe) {
        if (offset >= view.byteLength - 1) break;
        const length = view.getUint16(offset, false);
        offset += length;
      } else {
        break;
      }
    }

    if (!tiffOffset) return result;

    // Read TIFF header
    const byteAlign = view.getUint16(tiffOffset, false);
    const isLE = byteAlign === 0x4949; // 'II' = little-endian
    if (byteAlign !== 0x4949 && byteAlign !== 0x4d4d) return result; // not TIFF

    // Check TIFF magic
    if (view.getUint16(tiffOffset + 2, isLE) !== 0x002a) return result;

    let ifdOffset = tiffOffset + view.getUint32(tiffOffset + 4, isLE);

    // Parse IFD0 (main image)
    parseIFD(view, ifdOffset, isLE, tiffOffset, result);

    // Try to find EXIF sub-IFD for DateTimeOriginal
    // Already handled in parseIFD if tag 0x8769 is present

    // Format results
    formatExifResult(result);

    return result;
  } catch (e) {
    console.warn('EXIF parsing failed:', e);
    return result;
  }
}

function parseIFD(view, ifdOffset, isLE, tiffBase, result) {
  const count = view.getUint16(ifdOffset, isLE);
  let subExifOffset = 0;

  for (let i = 0; i < count; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;

    const tag = view.getUint16(entryOffset, isLE);
    const type = view.getUint16(entryOffset + 2, isLE);
    const numComponents = view.getUint32(entryOffset + 4, isLE);
    const dataSize = getTypeSize(type) * numComponents;

    let value;
    if (dataSize <= 4) {
      value = view.getUint32(entryOffset + 8, isLE);
    } else {
      const dataOffset = tiffBase + view.getUint32(entryOffset + 8, isLE);
      value = readTagValue(view, dataOffset, type, numComponents, isLE);
    }

    switch (tag) {
      case 0x010f:
        result.make = typeof value === 'string' ? value.trim() : '';
        break;
      case 0x0110:
        result.model = typeof value === 'string' ? value.trim() : '';
        break;
      case 0x829a: // ExposureTime
        if (typeof value === 'number') {
          result.shutter = formatShutterSpeed(value);
        } else if (Array.isArray(value) && value.length === 2) {
          result.shutter = formatShutterSpeed(value[0] / value[1]);
        }
        break;
      case 0x829d: // FNumber
        if (typeof value === 'number') {
          result.aperture = 'f/' + value.toFixed(1);
        } else if (Array.isArray(value) && value.length === 2) {
          result.aperture = 'f/' + (value[0] / value[1]).toFixed(1);
        }
        break;
      case 0x8827: // ISO
        if (typeof value === 'number') {
          result.iso = 'ISO ' + value;
        } else if (Array.isArray(value)) {
          result.iso = 'ISO ' + value[0];
        }
        break;
      case 0x920a: // FocalLength
        if (typeof value === 'number') {
          result.focalLength = Math.round(value) + 'mm';
        } else if (Array.isArray(value) && value.length === 2) {
          const fl = value[0] / value[1];
          result.focalLength = Math.round(fl) + 'mm';
        }
        break;
      case 0x9003: // DateTimeOriginal
        if (typeof value === 'string') {
          result.dateTaken = value.trim();
        }
        break;
      case 0xa433: // LensModel
        if (typeof value === 'string') {
          result.lens = value.trim();
        }
        break;
      case 0xa434: // LensSpecification
        if (typeof value === 'string' && !result.lens) {
          result.lens = value.trim();
        }
        break;
      case 0x8769: // ExifIFDPointer
        if (typeof value === 'number') {
          subExifOffset = tiffBase + value;
        }
        break;
    }
  }

  // Parse sub-IFD (EXIF-specific) for DateTimeOriginal etc.
  if (subExifOffset > 0) {
    parseIFD(view, subExifOffset, isLE, tiffBase, result);
  }
}

function getTypeSize(type) {
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  return sizes[type] || 1;
}

function readTagValue(view, offset, type, count, isLE) {
  if (type === 2) {
    // ASCII string
    return readString(view, offset, count).replace(/\0+$/, '');
  }
  if (type === 3) {
    // SHORT (uint16)
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(view.getUint16(offset + i * 2, isLE));
    }
    return count === 1 ? values[0] : values;
  }
  if (type === 4) {
    // LONG (uint32)
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(view.getUint32(offset + i * 4, isLE));
    }
    return count === 1 ? values[0] : values;
  }
  if (type === 5) {
    // RATIONAL (uint32/uint32)
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(view.getUint32(offset + i * 8, isLE));
      values.push(view.getUint32(offset + i * 8 + 4, isLE));
    }
    return count === 1 ? [values[0], values[1]] : values;
  }
  if (type === 10) {
    // SRATIONAL (int32/int32)
    const values = [];
    for (let i = 0; i < count; i++) {
      values.push(view.getInt32(offset + i * 8, isLE));
      values.push(view.getInt32(offset + i * 8 + 4, isLE));
    }
    return count === 1 ? [values[0], values[1]] : values;
  }
  return view.getUint32(offset, isLE);
}

function readString(view, offset, length) {
  let str = '';
  for (let i = 0; i < Math.min(length, 256); i++) {
    if (offset + i >= view.byteLength) break;
    const char = view.getUint8(offset + i);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

function formatShutterSpeed(seconds) {
  if (seconds >= 1) {
    return seconds + 's';
  }
  const denominator = Math.round(1 / seconds);
  return '1/' + denominator + 's';
}

function formatExifResult(result) {
  // Format date: "2026:07:15 14:30:00" → "2026-07-15"
  if (result.dateTaken && result.dateTaken.includes(':')) {
    const parts = result.dateTaken.split(' ');
    result.dateTaken = parts[0].replace(/:/g, '-');
  }

  // Build equipment string: "Make Model + Lens"
  if (result.make || result.model) {
    // Remove duplicate make from model (some cameras include make in model)
    let model = result.model;
    if (result.make && model.startsWith(result.make)) {
      model = model.slice(result.make.length).trim();
    }
    result.equipment = [result.make, model].filter(Boolean).join(' ');
    if (result.lens) {
      result.equipment += ' + ' + result.lens;
    }
  }
}
