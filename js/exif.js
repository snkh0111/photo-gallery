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
    equipment: '',
  };

  try {
    const buffer = await file.arrayBuffer();
    const view = new DataView(buffer);
    const len = view.byteLength;

    // Check JPEG SOI marker (must be 0xFFD8)
    if (len < 4 || view.getUint16(0, false) !== 0xffd8) {
      console.log('EXIF: Not a JPEG file (missing SOI)');
      return result;
    }

    // Scan JPEG segments for APP1/EXIF
    let offset = 2;
    let tiffOffset = 0;
    let segmentsScanned = 0;

    while (offset < len - 2 && segmentsScanned < 50) {
      // Skip any padding 0xFF bytes
      const b = view.getUint8(offset);
      if (b !== 0xff) {
        console.log('EXIF: Unexpected byte at offset', offset, '=', b.toString(16));
        break;
      }

      const markerByte = view.getUint8(offset + 1);
      const marker = (b << 8) | markerByte;
      segmentsScanned++;

      // RST markers (0xFFD0-0xFFD7): no length, just skip the 2-byte marker
      if (marker >= 0xffd0 && marker <= 0xffd7) {
        offset += 2;
        continue;
      }

      // SOI (0xFFD8): shouldn't appear mid-file, but skip if found
      if (marker === 0xffd8) {
        offset += 2;
        continue;
      }

      // EOI (0xFFD9): end of image
      if (marker === 0xffd9) {
        break;
      }

      // All other markers have a 2-byte length after the 2-byte marker
      offset += 2;
      if (offset + 2 > len) break;

      const segLen = view.getUint16(offset, false);

      if (marker === 0xffe1) {
        // APP1 — could be EXIF or XMP
        if (offset + 2 + 6 <= len) {
          const id = readString(view, offset + 2, 6);
          if (id === 'Exif\x00\x00') {
            tiffOffset = offset + 2 + 6; // after length + "Exif\0\0"
            console.log('EXIF: Found EXIF APP1 at offset', tiffOffset);
            break;
          }
        }
      }

      // Skip this segment (segLen includes the 2 length bytes)
      offset += Math.max(segLen, 2);
    }

    if (!tiffOffset) {
      console.log('EXIF: No EXIF APP1 segment found after scanning', segmentsScanned, 'segments');
      return result;
    }

    // Parse TIFF header
    if (tiffOffset + 8 > len) {
      console.log('EXIF: TIFF header beyond file end');
      return result;
    }

    const byteOrder = view.getUint16(tiffOffset, false);
    let isLE;
    if (byteOrder === 0x4949) {
      isLE = true;  // Intel (little-endian)
    } else if (byteOrder === 0x4d4d) {
      isLE = false; // Motorola (big-endian)
    } else {
      console.log('EXIF: Unknown byte order:', byteOrder.toString(16));
      return result;
    }

    const tiffMagic = view.getUint16(tiffOffset + 2, isLE);
    if (tiffMagic !== 0x002a) {
      console.log('EXIF: Bad TIFF magic:', tiffMagic.toString(16));
      return result;
    }

    const ifd0Offset = view.getUint32(tiffOffset + 4, isLE);
    if (tiffOffset + ifd0Offset > len) {
      console.log('EXIF: IFD0 beyond file end');
      return result;
    }

    console.log('EXIF: Parsing IFD0 at', tiffOffset + ifd0Offset, 'byteOrder:', isLE ? 'LE' : 'BE');

    // Parse IFD0
    parseIFD(view, tiffOffset + ifd0Offset, isLE, tiffOffset, result, len);

    // Format results
    formatExifResult(result);

    console.log('EXIF: Parsed result:', JSON.stringify(result));
    return result;
  } catch (e) {
    console.error('EXIF: Parse error:', e.message || e);
    return result;
  }
}

function parseIFD(view, ifdOffset, isLE, tiffBase, result, maxLen) {
  if (ifdOffset + 2 > maxLen) return;

  const entryCount = view.getUint16(ifdOffset, isLE);
  if (entryCount > 200) {
    console.log('EXIF: Suspicious IFD entry count:', entryCount);
    return;
  }

  let subExifOffset = 0;

  for (let i = 0; i < entryCount; i++) {
    const entryOff = ifdOffset + 2 + i * 12;
    if (entryOff + 12 > maxLen) break;

    const tag = view.getUint16(entryOff, isLE);
    const type = view.getUint16(entryOff + 2, isLE);
    const count = view.getUint32(entryOff + 4, isLE);
    const typeSize = getTypeSize(type);
    const dataSize = typeSize * count;

    let value;
    if (dataSize <= 4 && type !== 5 && type !== 10) {
      // Value fits in the 4-byte field
      const raw = view.getUint32(entryOff + 8, isLE);
      if (type === 2) {
        // Short ASCII string
        value = String.fromCharCode(raw & 0xff, (raw >> 8) & 0xff, (raw >> 16) & 0xff, (raw >> 24) & 0xff).replace(/\0+$/, '');
      } else if (type === 3) {
        value = raw & 0xffff;
      } else {
        value = raw;
      }
    } else {
      // Value at external offset
      const dataOff = tiffBase + view.getUint32(entryOff + 8, isLE);
      if (dataOff + dataSize <= maxLen) {
        value = readTagValue(view, dataOff, type, count, isLE);
      } else {
        continue;
      }
    }

    switch (tag) {
      case 0x010f: // Make
        if (typeof value === 'string') result.make = value.trim();
        break;
      case 0x0110: // Model
        if (typeof value === 'string') result.model = value.trim();
        break;
      case 0x829a: // ExposureTime
        if (Array.isArray(value) && value.length >= 2 && value[1] > 0) {
          const sec = value[0] / value[1];
          result.shutter = sec >= 1 ? sec.toFixed(1) + 's' : '1/' + Math.round(1 / sec) + 's';
        }
        break;
      case 0x829d: // FNumber
        if (Array.isArray(value) && value.length >= 2 && value[0] > 0) {
          const fnum = value[0] / value[1];
          result.aperture = 'f/' + fnum.toFixed(1);
        }
        break;
      case 0x8827: // ISOSpeedRatings
        if (typeof value === 'number') {
          result.iso = 'ISO ' + value;
        } else if (Array.isArray(value)) {
          result.iso = 'ISO ' + value[0];
        }
        break;
      case 0x920a: // FocalLength
        if (Array.isArray(value) && value.length >= 2 && value[1] > 0) {
          result.focalLength = Math.round(value[0] / value[1]) + 'mm';
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
      case 0xa434: // LensSpecification (fallback)
        if (typeof value === 'string' && !result.lens) {
          result.lens = value.trim();
        }
        break;
      case 0x8769: // ExifIFDPointer
        if (typeof value === 'number' && tiffBase + value < maxLen) {
          subExifOffset = tiffBase + value;
        }
        break;
    }
  }

  // Recurse into EXIF sub-IFD
  if (subExifOffset > 0) {
    parseIFD(view, subExifOffset, isLE, tiffBase, result, maxLen);
  }
}

function getTypeSize(type) {
  const s = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  return s[type] || 1;
}

function readTagValue(view, offset, type, count, isLE) {
  if (type === 2) {
    return readString(view, offset, count).replace(/\0+$/, '');
  }
  if (type === 3) {
    const vals = [];
    for (let i = 0; i < count; i++) vals.push(view.getUint16(offset + i * 2, isLE));
    return count === 1 ? vals[0] : vals;
  }
  if (type === 4) {
    const vals = [];
    for (let i = 0; i < count; i++) vals.push(view.getUint32(offset + i * 4, isLE));
    return count === 1 ? vals[0] : vals;
  }
  if (type === 5) {
    // RATIONAL
    const vals = [];
    for (let i = 0; i < count; i++) {
      vals.push(view.getUint32(offset + i * 8, isLE));
      vals.push(view.getUint32(offset + i * 8 + 4, isLE));
    }
    return count === 1 ? [vals[0], vals[1]] : vals;
  }
  if (type === 10) {
    const vals = [];
    for (let i = 0; i < count; i++) {
      vals.push(view.getInt32(offset + i * 8, isLE));
      vals.push(view.getInt32(offset + i * 8 + 4, isLE));
    }
    return count === 1 ? [vals[0], vals[1]] : vals;
  }
  return view.getUint32(offset, isLE);
}

function readString(view, offset, length) {
  let str = '';
  const max = Math.min(length, 256);
  for (let i = 0; i < max; i++) {
    if (offset + i >= view.byteLength) break;
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    str += String.fromCharCode(c);
  }
  return str;
}

function formatExifResult(result) {
  // Date: "2026:07:15 14:30:00" → "2026-07-15"
  if (result.dateTaken) {
    const m = result.dateTaken.match(/^(\d{4}):(\d{2}):(\d{2})/);
    if (m) result.dateTaken = m[1] + '-' + m[2] + '-' + m[3];
  }

  // Equipment: "Make Model + Lens"
  if (result.make || result.model) {
    let model = result.model || '';
    if (result.make && model.toUpperCase().startsWith(result.make.toUpperCase())) {
      model = model.slice(result.make.length).trim();
    }
    result.equipment = [result.make, model].filter(Boolean).join(' ');
    if (result.lens && result.lens !== result.equipment) {
      result.equipment += ' + ' + result.lens;
    }
  }
}
