/**
 * ChromaFloor - Zero-Dependency ISO/IEC 18004 QR Code SVG Generator
 * Fast, pure JavaScript QR encoder supporting Versions 1 to 25 at EC Level L and M.
 * Optimized for dark-club offline dancefloor scanning (large chunky modules, crisp SVG).
 *
 * UMD: window.ChromaQR / module.exports
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChromaQR = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // -------------------------------------------------------------
  // Galois Field GF(256) Arithmetic with primitive polynomial 0x11D (285)
  // -------------------------------------------------------------
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);

  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) {
        x ^= 0x11D; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
      }
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return GF_EXP[GF_LOG[x] + GF_LOG[y]];
  }

  // Multiply two GF(256) polynomials
  function polyMul(p1, p2) {
    const result = new Uint8Array(p1.length + p2.length - 1);
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        result[i + j] ^= gfMul(p1[i], p2[j]);
      }
    }
    return result;
  }

  // Precomputed generator polynomials cache
  const GENERATOR_CACHE = {};
  function getGeneratorPoly(degree) {
    if (GENERATOR_CACHE[degree]) return GENERATOR_CACHE[degree];
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
      poly = polyMul(poly, new Uint8Array([1, GF_EXP[i]]));
    }
    GENERATOR_CACHE[degree] = poly;
    return poly;
  }

  // Compute Reed-Solomon Error Correction Codewords for a message block
  function rsComputeRemainder(dataBytes, ecLength) {
    const gen = getGeneratorPoly(ecLength);
    const msg = new Uint8Array(dataBytes.length + ecLength);
    msg.set(dataBytes);

    for (let i = 0; i < dataBytes.length; i++) {
      const coef = msg[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          msg[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return msg.subarray(dataBytes.length);
  }

  // -------------------------------------------------------------
  // ISO/IEC 18004 Tables for Versions 1..25 at EC Level L
  // [TotalCodewords, ECCodewordsPerBlock, Group1Blocks, Group1DataBytes, Group2Blocks, Group2DataBytes]
  // -------------------------------------------------------------
  const VERSION_TABLE_L = [
    null, // 0-index unused
    // V1: 26 total, 7 ec per block, 1 block of 19 data
    [26, 7, 1, 19, 0, 0],
    // V2: 44 total, 10 ec per block, 1 block of 34 data
    [44, 10, 1, 34, 0, 0],
    // V3: 70 total, 15 ec per block, 1 block of 55 data
    [70, 15, 1, 55, 0, 0],
    // V4: 100 total, 20 ec per block, 1 block of 80 data
    [100, 20, 1, 80, 0, 0],
    // V5: 134 total, 26 ec per block, 1 block of 108 data
    [134, 26, 1, 108, 0, 0],
    // V6: 172 total, 18 ec per block, 2 blocks of 68 data
    [172, 18, 2, 68, 0, 0],
    // V7: 196 total, 20 ec per block, 2 blocks of 78 data
    [196, 20, 2, 78, 0, 0],
    // V8: 242 total, 24 ec per block, 2 blocks of 97 data
    [242, 24, 2, 97, 0, 0],
    // V9: 292 total, 30 ec per block, 2 blocks of 116 data
    [292, 30, 2, 116, 0, 0],
    // V10: 346 total, 18 ec per block, 2 blocks of 68 data, 2 blocks of 69 data
    [346, 18, 2, 68, 2, 69],
    // V11: 404 total, 20 ec per block, 4 blocks of 81 data
    [404, 20, 4, 81, 0, 0],
    // V12: 466 total, 24 ec per block, 2 blocks of 92 data, 2 blocks of 93 data
    [466, 24, 2, 92, 2, 93],
    // V13: 532 total, 26 ec per block, 4 blocks of 107 data
    [532, 26, 4, 107, 0, 0],
    // V14: 581 total, 30 ec per block, 3 blocks of 115 data, 1 block of 116 data
    [581, 30, 3, 115, 1, 116],
    // V15: 655 total, 22 ec per block, 5 blocks of 87 data, 1 block of 88 data
    [655, 22, 5, 87, 1, 88],
    // V16: 733 total, 24 ec per block, 5 blocks of 98 data, 1 block of 99 data
    [733, 24, 5, 98, 1, 99],
    // V17: 815 total, 28 ec per block, 1 block of 107 data, 5 blocks of 108 data
    [815, 28, 1, 107, 5, 108],
    // V18: 901 total, 30 ec per block, 5 blocks of 120 data, 1 block of 121 data
    [901, 30, 5, 120, 1, 121],
    // V19: 991 total, 28 ec per block, 3 blocks of 113 data, 4 blocks of 114 data
    [991, 28, 3, 113, 4, 114],
    // V20: 1085 total, 28 ec per block, 3 blocks of 107 data, 5 blocks of 108 data
    [1085, 28, 3, 107, 5, 108],
    // V21: 1156 total, 28 ec per block, 4 blocks of 116 data, 4 blocks of 117 data
    [1156, 28, 4, 116, 4, 117],
    // V22: 1258 total, 28 ec per block, 2 blocks of 111 data, 7 blocks of 112 data
    [1258, 28, 2, 111, 7, 112],
    // V23: 1364 total, 30 ec per block, 4 blocks of 121 data, 5 blocks of 122 data
    [1364, 30, 4, 121, 5, 122],
    // V24: 1474 total, 30 ec per block, 6 blocks of 117 data, 4 blocks of 118 data
    [1474, 30, 6, 117, 4, 118],
    // V25: 1588 total, 26 ec per block, 8 blocks of 106 data, 4 blocks of 107 data
    [1588, 26, 8, 106, 4, 107]
  ];

  // Alignment pattern center coordinates (ISO/IEC 18004 Table E.1)
  const ALIGNMENT_COORDS = [
    [], // V0
    [], // V1
    [6, 18], // V2
    [6, 22], // V3
    [6, 26], // V4
    [6, 30], // V5
    [6, 34], // V6
    [6, 22, 38], // V7
    [6, 24, 42], // V8
    [6, 26, 46], // V9
    [6, 28, 50], // V10
    [6, 30, 54], // V11
    [6, 32, 58], // V12
    [6, 34, 62], // V13
    [6, 26, 46, 66], // V14
    [6, 26, 48, 70], // V15
    [6, 26, 50, 74], // V16
    [6, 30, 54, 78], // V17
    [6, 30, 56, 82], // V18
    [6, 30, 58, 86], // V19
    [6, 34, 62, 90], // V20
    [6, 28, 50, 72, 94], // V21
    [6, 26, 50, 74, 98], // V22
    [6, 30, 54, 74, 102], // V23 (ISO Table E.1: 74)
    [6, 28, 54, 80, 106], // V24
    [6, 32, 58, 84, 110]  // V25
  ];

  // Precomputed 18-bit Version Info strings for V7..V25 (BCH (18, 6) poly 0x1F25)
  // v is 6-bit version, lower 12 bits are error correction remainder
  function getVersionInfoBits(v) {
    let rem = v << 12;
    for (let i = 17; i >= 12; i--) {
      if ((rem >>> i) & 1) {
        rem ^= (0x1F25 << (i - 12));
      }
    }
    return (v << 12) | rem;
  }

  // Precomputed 15-bit Format Info bits for EC Level L (01) and mask 0..7
  // Generator poly 0x537 (BCH 15, 5), XORed with 0x5412
  // ISO Table C.1 for EC Level L (bits: 0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976)
  const FORMAT_INFO_LEVEL_L = [
    0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976
  ];

  function getFormatInfoBits(maskPattern) {
    return FORMAT_INFO_LEVEL_L[maskPattern & 7];
  }

  // UTF-8 string to byte array
  function toUTF8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(str);
    }
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
      } else if (code < 0xD800 || code >= 0xE000) {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      } else {
        // Surrogate pair
        i++;
        code = 0x10000 + (((code & 0x3FF) << 10) | (str.charCodeAt(i) & 0x3FF));
        bytes.push(
          0xF0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3F),
          0x80 | ((code >> 6) & 0x3F),
          0x80 | (code & 0x3F)
        );
      }
    }
    return new Uint8Array(bytes);
  }

  // -------------------------------------------------------------
  // BitBuffer helper
  // -------------------------------------------------------------
  class BitBuffer {
    constructor() {
      this.buffer = [];
      this.length = 0;
    }
    put(num, count) {
      for (let i = 0; i < count; i++) {
        this.putBit(((num >>> (count - i - 1)) & 1) === 1);
      }
    }
    putBit(bit) {
      const byteIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= byteIndex) {
        this.buffer.push(0);
      }
      if (bit) {
        this.buffer[byteIndex] |= (0x80 >>> (this.length % 8));
      }
      this.length++;
    }
    getBytes() {
      return new Uint8Array(this.buffer);
    }
  }

  // -------------------------------------------------------------
  // Determine minimum version for byte data at EC Level L
  // -------------------------------------------------------------
  function findVersion(dataByteLength) {
    for (let v = 1; v <= 25; v++) {
      const entry = VERSION_TABLE_L[v];
      const maxDataCodewords = (entry[2] * entry[3]) + (entry[4] * entry[5]);
      // Byte mode header = 4 bits
      // Character count indicator = 8 bits (V 1..9) or 16 bits (V 10..25)
      const cciBits = v <= 9 ? 8 : 16;
      const totalBitsNeeded = 4 + cciBits + (dataByteLength * 8);
      const totalBytesNeeded = Math.ceil(totalBitsNeeded / 8);
      if (totalBytesNeeded <= maxDataCodewords) {
        return v;
      }
    }
    throw new Error('Data too long for QR versions 1..25 at EC Level L');
  }

  // -------------------------------------------------------------
  // Encode Byte mode data into codewords with interleaving
  // -------------------------------------------------------------
  function createDataCodewords(rawBytes, version) {
    const entry = VERSION_TABLE_L[version];
    const totalDataCodewords = (entry[2] * entry[3]) + (entry[4] * entry[5]);
    const bb = new BitBuffer();

    // 1. Mode indicator: Byte mode = 0b0100 (4 bits)
    bb.put(0x4, 4);

    // 2. Character count indicator: 8 bits for V1..9, 16 bits for V10..25
    const cciBits = version <= 9 ? 8 : 16;
    bb.put(rawBytes.length, cciBits);

    // 3. Data bytes
    for (let i = 0; i < rawBytes.length; i++) {
      bb.put(rawBytes[i], 8);
    }

    // 4. Terminator: up to 4 bits of 0s
    const bitsRemaining = (totalDataCodewords * 8) - bb.length;
    const terminatorLength = Math.min(4, bitsRemaining);
    bb.put(0, terminatorLength);

    // 5. Bit-pad to byte boundary
    if (bb.length % 8 !== 0) {
      bb.put(0, 8 - (bb.length % 8));
    }

    // 6. Pad bytes alternating 0xEC (11101100) and 0x11 (00010001)
    const currentBytes = bb.getBytes();
    const dataCodewords = new Uint8Array(totalDataCodewords);
    dataCodewords.set(currentBytes);
    let padByte = 0xEC;
    for (let i = currentBytes.length; i < totalDataCodewords; i++) {
      dataCodewords[i] = padByte;
      padByte = (padByte === 0xEC) ? 0x11 : 0xEC;
    }

    return dataCodewords;
  }

  // Split data into blocks, compute EC, and interleave
  function interleaveCodewords(dataCodewords, version) {
    const entry = VERSION_TABLE_L[version];
    const [totalCodewords, ecPerBlock, g1Blocks, g1Data, g2Blocks, g2Data] = entry;
    const totalBlocks = g1Blocks + g2Blocks;

    const blocksData = [];
    const blocksEC = [];
    let offset = 0;

    for (let i = 0; i < g1Blocks; i++) {
      const slice = dataCodewords.subarray(offset, offset + g1Data);
      offset += g1Data;
      blocksData.push(slice);
      blocksEC.push(rsComputeRemainder(slice, ecPerBlock));
    }
    for (let i = 0; i < g2Blocks; i++) {
      const slice = dataCodewords.subarray(offset, offset + g2Data);
      offset += g2Data;
      blocksData.push(slice);
      blocksEC.push(rsComputeRemainder(slice, ecPerBlock));
    }

    // Interleave data codewords
    const interleaved = new Uint8Array(totalCodewords);
    let p = 0;
    const maxDataBlockLen = Math.max(g1Data, g2Data || 0);
    for (let col = 0; col < maxDataBlockLen; col++) {
      for (let b = 0; b < totalBlocks; b++) {
        if (col < blocksData[b].length) {
          interleaved[p++] = blocksData[b][col];
        }
      }
    }

    // Interleave error correction codewords
    for (let col = 0; col < ecPerBlock; col++) {
      for (let b = 0; b < totalBlocks; b++) {
        interleaved[p++] = blocksEC[b][col];
      }
    }

    return interleaved;
  }

  // -------------------------------------------------------------
  // Matrix Construction
  // -------------------------------------------------------------
  function createMatrix(version) {
    const size = version * 4 + 17;
    // Values: 0 = light, 1 = dark
    const modules = [];
    const isFunction = [];
    for (let r = 0; r < size; r++) {
      modules.push(new Int8Array(size));
      isFunction.push(new Uint8Array(size));
    }

    function setFunction(r, c, val) {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        modules[r][c] = val ? 1 : 0;
        isFunction[r][c] = 1;
      }
    }

    // 1. Finder patterns at Top-Left, Top-Right, Bottom-Left
    function placeFinderPattern(row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rPos = row + r;
          const cPos = col + c;
          if (rPos >= 0 && rPos < size && cPos >= 0 && cPos < size) {
            if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
              if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                setFunction(rPos, cPos, 1);
              } else {
                setFunction(rPos, cPos, 0);
              }
            } else {
              // White separator around finder
              setFunction(rPos, cPos, 0);
            }
          }
        }
      }
    }

    placeFinderPattern(0, 0);
    placeFinderPattern(0, size - 7);
    placeFinderPattern(size - 7, 0);

    // 2. Timing patterns: row 6 and col 6
    for (let i = 8; i < size - 8; i++) {
      const bit = (i % 2 === 0) ? 1 : 0;
      setFunction(6, i, bit);
      setFunction(i, 6, bit);
    }

    // 3. Dark module at (row = 4 * version + 9, col = 8)
    setFunction(4 * version + 9, 8, 1);

    // 4. Alignment patterns for Version >= 2
    const alignCoords = ALIGNMENT_COORDS[version] || [];
    for (let i = 0; i < alignCoords.length; i++) {
      for (let j = 0; j < alignCoords.length; j++) {
        const row = alignCoords[i];
        const col = alignCoords[j];

        // Skip if overlaps with any of the 3 finder patterns
        if ((row <= 8 && col <= 8) || (row <= 8 && col >= size - 8) || (row >= size - 8 && col <= 8)) {
          continue;
        }

        // 5x5 alignment pattern: outer 1, middle 0, center 1
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
              setFunction(row + r, col + c, 1);
            } else {
              setFunction(row + r, col + c, 0);
            }
          }
        }
      }
    }

    // 5. Reserve Format Info areas (around finders)
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        setFunction(8, i, 0);
        setFunction(i, 8, 0);
      }
    }
    for (let i = 0; i < 8; i++) {
      setFunction(size - 1 - i, 8, 0);
      setFunction(8, size - 1 - i, 0);
    }

    // 6. Reserve Version Info areas for V >= 7 (3x6 blocks)
    if (version >= 7) {
      for (let y = 0; y < 6; y++) {
        for (let x = 0; x < 3; x++) {
          setFunction(size - 11 + x, y, 0); // Top-Right (x: size-11..size-9, y: 0..5)
          setFunction(y, size - 11 + x, 0); // Bottom-Left (x: 0..5, y: size-11..size-9)
        }
      }
    }

    return { size, modules, isFunction };
  }

  // -------------------------------------------------------------
  // Data placement: 2-column zigzag upward/downward
  // -------------------------------------------------------------
  function placeDataCodewords(matObj, codewords) {
    const { size, modules, isFunction } = matObj;
    let bitIndex = 0;
    const totalBits = codewords.length * 8;

    let upward = true;
    for (let right = size - 1; right > 0; right -= 2) {
      // Column 6 is the vertical timing pattern, skip it
      if (right === 6) {
        right = 5;
      }
      const left = right - 1;

      for (let count = 0; count < size; count++) {
        const row = upward ? (size - 1 - count) : count;
        const cols = [right, left];

        for (let i = 0; i < 2; i++) {
          const col = cols[i];
          if (!isFunction[row][col]) {
            let bit = 0;
            if (bitIndex < totalBits) {
              const byteVal = codewords[Math.floor(bitIndex / 8)];
              bit = (byteVal >>> (7 - (bitIndex % 8))) & 1;
              bitIndex++;
            }
            modules[row][col] = bit;
          }
        }
      }
      upward = !upward;
    }
  }

  // -------------------------------------------------------------
  // Masking & Format Info / Version Info placement
  // -------------------------------------------------------------
  const MASK_FNS = [
    (r, c) => (r + c) % 2 === 0,
    (r, c) => r % 2 === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  ];

  // Apply Format Info bits according to ISO/IEC 18004
  function applyFormatInfo(mat, size, fb) {
    // Top-Left Format Info:
    // Bits 14 down to 7 at row 8, col 0..8 (skipping 6):
    mat[8][0] = (fb >>> 14) & 1;
    mat[8][1] = (fb >>> 13) & 1;
    mat[8][2] = (fb >>> 12) & 1;
    mat[8][3] = (fb >>> 11) & 1;
    mat[8][4] = (fb >>> 10) & 1;
    mat[8][5] = (fb >>> 9) & 1;
    mat[8][7] = (fb >>> 8) & 1;
    mat[8][8] = (fb >>> 7) & 1;

    // Bits 6 down to 0 at col 8, row 7..0 (skipping 6):
    mat[7][8] = (fb >>> 6) & 1;
    mat[5][8] = (fb >>> 5) & 1;
    mat[4][8] = (fb >>> 4) & 1;
    mat[3][8] = (fb >>> 3) & 1;
    mat[2][8] = (fb >>> 2) & 1;
    mat[1][8] = (fb >>> 1) & 1;
    mat[0][8] = (fb >>> 0) & 1;

    // Second Copy:
    // Bottom-Left (col 8, rows size-1 down to size-7) has bits 14 down to 8:
    mat[size - 1][8] = (fb >>> 14) & 1;
    mat[size - 2][8] = (fb >>> 13) & 1;
    mat[size - 3][8] = (fb >>> 12) & 1;
    mat[size - 4][8] = (fb >>> 11) & 1;
    mat[size - 5][8] = (fb >>> 10) & 1;
    mat[size - 6][8] = (fb >>> 9) & 1;
    mat[size - 7][8] = (fb >>> 8) & 1;

    // Top-Right (row 8, cols size-8 to size-1) has bits 7 down to 0:
    mat[8][size - 8] = (fb >>> 7) & 1;
    mat[8][size - 7] = (fb >>> 6) & 1;
    mat[8][size - 6] = (fb >>> 5) & 1;
    mat[8][size - 5] = (fb >>> 4) & 1;
    mat[8][size - 4] = (fb >>> 3) & 1;
    mat[8][size - 3] = (fb >>> 2) & 1;
    mat[8][size - 2] = (fb >>> 1) & 1;
    mat[8][size - 1] = (fb >>> 0) & 1;
  }

  // Apply Version Info bits for V >= 7
  function applyVersionInfo(mat, size, version) {
    if (version < 7) return;
    const bits = getVersionInfoBits(version);
    for (let y = 0; y < 6; y++) {
      for (let x = 0; x < 3; x++) {
        const bit = (bits >>> (y * 3 + x)) & 1;
        // Top-Right: row y, col (size - 11 + x)
        mat[y][size - 11 + x] = bit;
        // Bottom-Left: row (size - 11 + x), col y
        mat[size - 11 + x][y] = bit;
      }
    }
  }

  // Evaluate ISO penalty score for a completed masked matrix
  function calculatePenaltyScore(mat, size) {
    let score = 0;

    // Rule 1: 5 or more same color in row/column
    for (let r = 0; r < size; r++) {
      let count = 1;
      for (let c = 1; c < size; c++) {
        if (mat[r][c] === mat[r][c - 1]) {
          count++;
        } else {
          if (count >= 5) score += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) score += 3 + (count - 5);
    }
    for (let c = 0; c < size; c++) {
      let count = 1;
      for (let r = 1; r < size; r++) {
        if (mat[r][c] === mat[r - 1][c]) {
          count++;
        } else {
          if (count >= 5) score += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) score += 3 + (count - 5);
    }

    // Rule 2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const val = mat[r][c];
        if (val === mat[r + 1][c] && val === mat[r][c + 1] && val === mat[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    // Rule 3: 1:1:3:1:1 pattern (dark-light-dark-dark-dark-light-dark) surrounded by 4 light
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size - 6; c++) {
        if (mat[r][c] === 1 && mat[r][c + 1] === 0 && mat[r][c + 2] === 1 &&
            mat[r][c + 3] === 1 && mat[r][c + 4] === 1 && mat[r][c + 5] === 0 && mat[r][c + 6] === 1) {
          if (c >= 4 && mat[r][c - 1] === 0 && mat[r][c - 2] === 0 && mat[r][c - 3] === 0 && mat[r][c - 4] === 0) {
            score += 40;
          }
          if (c + 10 < size && mat[r][c + 7] === 0 && mat[r][c + 8] === 0 && mat[r][c + 9] === 0 && mat[r][c + 10] === 0) {
            score += 40;
          }
        }
      }
    }
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size - 6; r++) {
        if (mat[r][c] === 1 && mat[r + 1][c] === 0 && mat[r + 2][c] === 1 &&
            mat[r + 3][c] === 1 && mat[r + 4][c] === 1 && mat[r + 5][c] === 0 && mat[r + 6][c] === 1) {
          if (r >= 4 && mat[r - 1][c] === 0 && mat[r - 2][c] === 0 && mat[r - 3][c] === 0 && mat[r - 4][c] === 0) {
            score += 40;
          }
          if (r + 10 < size && mat[r + 7][c] === 0 && mat[r + 8][c] === 0 && mat[r + 9][c] === 0 && mat[r + 10][c] === 0) {
            score += 40;
          }
        }
      }
    }

    // Rule 4: Balance of dark and light modules
    let darkCount = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (mat[r][c] === 1) darkCount++;
      }
    }
    const totalModules = size * size;
    const ratio = (darkCount / totalModules) * 100;
    const prev5 = Math.floor(ratio / 5) * 5;
    const next5 = prev5 + 5;
    const step = Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5);
    score += step * 10;

    return score;
  }

  // -------------------------------------------------------------
  // Full QR Code Generation Pipeline
  // -------------------------------------------------------------
  function encode(text, options) {
    const opt = options || {};
    const rawBytes = toUTF8Bytes(String(text || ''));
    const version = opt.version ? Math.max(1, Math.min(25, opt.version)) : findVersion(rawBytes.length);

    // 1. Data codewords & Error Correction with Interleaving
    const dataCodewords = createDataCodewords(rawBytes, version);
    const interleavedCodewords = interleaveCodewords(dataCodewords, version);

    // 2. Base Matrix with Function Patterns
    const baseMat = createMatrix(version);
    placeDataCodewords(baseMat, interleavedCodewords);

    // 3. Mask Selection (choose mask with lowest penalty score)
    const { size, modules, isFunction } = baseMat;
    let bestMask = 0;
    let minScore = Infinity;
    let bestMatrix = null;

    for (let mask = 0; mask < 8; mask++) {
      const maskFn = MASK_FNS[mask];
      // Clone modules
      const testMat = [];
      for (let r = 0; r < size; r++) {
        testMat.push(new Int8Array(modules[r]));
      }

      // Apply mask to non-function modules
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!isFunction[r][c] && maskFn(r, c)) {
            testMat[r][c] ^= 1;
          }
        }
      }

      // Apply format info and version info
      const formatBits = getFormatInfoBits(mask);
      applyFormatInfo(testMat, size, formatBits);
      applyVersionInfo(testMat, size, version);

      const score = calculatePenaltyScore(testMat, size);
      if (score < minScore) {
        minScore = score;
        bestMask = mask;
        bestMatrix = testMat;
      }
    }

    return {
      version,
      size,
      mask: bestMask,
      modules: bestMatrix
    };
  }

  /**
   * Generates crisp, fast-rendering SVG string
   * Uses single <path> with subpaths "M x y h1 v1 h-1 z" for seam-free rendering at any DPI
   */
  function toSVG(text, options) {
    const opt = options || {};
    const margin = typeof opt.margin === 'number' ? opt.margin : 4;
    const dark = opt.dark || '#000000';
    const light = opt.light || '#FFFFFF';

    const qr = encode(text, opt);
    const size = qr.size;
    const totalSize = size + margin * 2;

    let pathD = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (qr.modules[r][c] === 1) {
          const x = c + margin;
          const y = r + margin;
          pathD += `M${x} ${y}h1v1h-1z`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" shape-rendering="crispEdges" width="100%" height="100%"><rect width="100%" height="100%" fill="${light}"/><path d="${pathD}" fill="${dark}"/></svg>`;
  }

  return {
    encode,
    toSVG,
    findVersion,
    rsComputeRemainder,
    VERSION_TABLE_L,
    ALIGNMENT_COORDS
  };
});
