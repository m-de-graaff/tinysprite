/*
 * tinysprites — Reference Encoder (JavaScript)
 * ------------------------------------------------
 * Purpose-built ultra-compact sprite encoder for pixel art.
 *
 * This file implements the encoder for the tinysprites v1 bitstream format.
 * It produces compressed sprite data that can be decoded by compatible decoders.
 *
 * Features:
 *   - Versioned header: magic + version (0xF1), ULEB128 width/height, flags
 *   - Color mode: TSV8 palette entries (8-bit Tiny HSV)
 *   - Bits-per-index (bpi) auto-selection (1..8)
 *   - Optional transparent-index key in header
 *   - Token stream with 2-bit classes:
 *       00 RLE(len, index)
 *       01 LITERAL(len, indices)
 *       10 COPY(offset, len)
 *       11 CONTROL(subtype, payload)
 *     CONTROL subtypes used:
 *       0x00 END
 *       0x01 SOLID(index)
 *       0x03 PAL_ADD_N (varint count, followed by `count` palette entries)
 *   - Simple but effective LZSS-style matcher (COPY) + RLE + LITERAL selection
 *   - TSV8 color quantization from RGBA
 *   - String wrapper: ts85 (Ascii85-like) and base64 helpers
 *   - ESM/CJS/UMD-friendly exports
 *
 * Bitstream layout (v1):
 *   B0: 0b1111vvvv  (magic/version: v=1 -> 0xF1)
 *   W : width  (ULEB128)
 *   H : height (ULEB128)
 *   B1: flags
 *       bits 7..6: color_mode (00 = TSV8)
 *       bits 5..3: (bpi-1)  → 1..8 bits per pixel index
 *       bit  2   : has_transparency_key
 *       bit  1   : has_tiling_or_animation (0 in v1 encoder)
 *       bit  0   : compression_profile (0 = general)
 *   [opt] transparency_key: 1 byte (index) if bit2 set
 *   [stream] tokens (bit-packed, MSB-first within fields)
 *
 * Token encoding (all fields are bit-level packed, MSB-first):
 *   CLASS = 2 bits (00=RLE, 01=LITERAL, 10=COPY, 11=CONTROL)
 *   - RLE:      CLASS | varuint(len) | index(bpi)
 *   - LITERAL:  CLASS | varuint(len) | indices[len]*(bpi)
 *   - COPY:     CLASS | varuint(offset) | varuint(len)
 *   - CONTROL:  CLASS | subtype(8)
 *       subtype 0x00 END
 *       subtype 0x01 SOLID  | index(bpi)
 *       subtype 0x03 PAL_ADD_N | varuint(count) | entries[count]
 *           entries in TSV8 mode are 1 byte each
 *
 * ULEB128 (varuint) byte format: little-endian 7-bit groups; MSB is continue.
 * We write bytes into the bitstream with writeByte (which writes 8 bits MSB-first).
 *
 * Index semantics:
 *   All pixels reference a palette index [0..(palette_size-1)] using bpi bits.
 *   In TSV8 color mode, palette entries are written as 1-byte TSV8 codes via
 *   PAL_ADD_N (0x03). The transparent index, if any, is **not required** to
 *   have a palette entry; it simply decodes to alpha=0.
 *
 * Usage:
 *   - encodeTinySpriteRGBA(w,h,rgba,opts) → Uint8Array
 *   - tsPack(u8) → "ts1|..." short string (ts85) for embedding
 *   - write u8 to a file .tspr or embed string in code/assets
 */

/* =============================
 * Bit-level writing utilities and variable-length integer encoding
 * ============================= */

class BitWriter {
    constructor() {
        this.bytes = [];
        this.bitbuf = 0; // Accumulated bits (LSB side)
        this.bitcount = 0; // Number of bits currently in bitbuf (0..7)
    }

    /** Write `n` bits from `value` (take the lowest `n` bits), MSB-first. */
    writeBits(value, n) {
        // Emit bits MSB-first: starting from bit (n-1) down to 0
        for (let i = n - 1; i >= 0; i--) {
            const bit = (value >>> i) & 1;
            this.bitbuf = (this.bitbuf << 1) | bit;
            this.bitcount++;
            if (this.bitcount === 8) this._flushByte();
        }
    }

    /** Write a full byte (8 bits) */
    writeByte(b) {
        this.writeBits(b & 0xff, 8);
    }

    /** Write a ULEB128 varuint. */
    writeVarUint(n) {
        // LEB128 encoding: 7-bit groups, continuation MSB bit set if more follow
        do {
            let byte = n & 0x7f;
            n >>>= 7;
            if (n !== 0) byte |= 0x80;
            this.writeByte(byte);
        } while (n !== 0);
    }

    /** Align to next byte boundary by padding zero bits. */
    alignToByte() {
        if (this.bitcount > 0) {
            this.bitbuf <<= 8 - this.bitcount;
            this._flushByte();
        }
    }

    _flushByte() {
        this.bytes.push(this.bitbuf & 0xff);
        this.bitbuf = 0;
        this.bitcount = 0;
    }

    /** Get final Uint8Array (auto-align). */
    toUint8Array() {
        this.alignToByte();
        return new Uint8Array(this.bytes);
    }
}

/** Write ULEB128 varuint into a plain byte array. */
function writeULEB128ToArray(arr, n) {
    do {
        let byte = n & 0x7f;
        n >>>= 7;
        if (n !== 0) byte |= 0x80;
        arr.push(byte);
    } while (n !== 0);
}

/* =============================
 * TSV8 color space conversion and quantization
 * ============================= */

/** Convert RGBA (0..255) to HSV (0..360, 0..1, 0..1). */
function rgbaToHSV(r, g, b, a = 255) {
    // Alpha is handled separately from HSV conversion
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
}

/** Quantize HSV to TSV8 byte: H4 S2 V2 => (H<<4)|(S<<2)|V */
function hsvToTSV8Byte(h, s, v) {
    let H4 = 0,
        S2 = 0,
        V2 = 0;
    // Value buckets: 4 levels (0..3) with uniform spacing
    V2 = Math.max(0, Math.min(3, Math.floor(v * 4)));
    if (V2 > 3) V2 = 3;

    // Saturation buckets: 4 levels (0..3) with uniform spacing
    S2 = Math.max(0, Math.min(3, Math.floor(s * 4)));
    if (S2 > 3) S2 = 3;

    if (S2 === 0) {
        H4 = 0; // Hue is irrelevant for greyscale colors
    } else {
        // 16 hue bins around the color wheel (360° / 16 = 22.5° per bin)
        H4 = Math.floor((((h % 360) + 360) % 360) / 22.5);
        if (H4 < 0) H4 = 0;
        if (H4 > 15) H4 = 15;
    }
    return ((H4 & 0x0f) << 4) | ((S2 & 0x03) << 2) | (V2 & 0x03);
}

/** Convert RGBA to TSV8 byte by HSV quantization. */
function rgbaToTSV8Byte(r, g, b, a = 255) {
    const { h, s, v } = rgbaToHSV(r, g, b, a);
    return hsvToTSV8Byte(h, s, v);
}

/* =============================
 * Palette generation and pixel indexing
 * ============================= */

/**
 * Build a palette of TSV8 bytes and an index buffer for the image.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - length = width * height * 4
 * @param {object} opts
 *   - transparentRGBA?: [r,g,b,a] value to treat as fully transparent (priority)
 *   - alphaThreshold?: number (0..255), defaults 0: alpha <= threshold -> transparent
 *   - stableOrder?: boolean (default true) preserve first-seen order for palette
 *
 * @returns {object} { indices: Uint8Array, paletteTSV8: Uint8Array, transparentIndex: number|null }
 */
function buildIndexedTSV8(width, height, rgba, opts = {}) {
    const { transparentRGBA = null, alphaThreshold = 0, stableOrder = true } = opts;

    const N = width * height;
    const indices = new Uint16Array(N); // we'll downsize later

    // Map from TSV8 byte to palette index
    const map = new Map();
    const palette = []; // array of TSV8 bytes
    let transparentIndex = null;

    // Reserve index 0 for transparency if needed
    // transparentIndex will be assigned when first transparent pixel is encountered

    const colorKeyFromRGBA = (r, g, b, a) => (r << 24) | (g << 16) | (b << 8) | a;
    const transparentKey = transparentRGBA ? colorKeyFromRGBA(transparentRGBA[0] | 0, transparentRGBA[1] | 0, transparentRGBA[2] | 0, transparentRGBA[3] | 0) : null;

    let palCount = 0;

    for (let i = 0, p = 0; i < N; i++, p += 4) {
        const r = rgba[p],
            g = rgba[p + 1],
            b = rgba[p + 2],
            a = rgba[p + 3];

        const isTransparent = (transparentKey !== null && colorKeyFromRGBA(r, g, b, a) === transparentKey) || (transparentKey === null && a <= alphaThreshold);

        if (isTransparent) {
            if (transparentIndex === null) {
                transparentIndex = 0; // claim 0
            }
            indices[i] = transparentIndex;
            continue;
        }

        const tsv8 = rgbaToTSV8Byte(r, g, b, a);
        let idx = map.get(tsv8);
        if (idx === undefined) {
            // Assign next palette index, avoiding conflict with transparency
            if (transparentIndex === 0 && palCount === 0) {
                // Index 0 is reserved for transparency, first color gets index 1
                idx = 1;
            } else {
                idx = palCount;
            }
            // Ensure no conflict with transparency reserve
            if (transparentIndex === 0 && idx === 0) idx = 1;

            // If stableOrder, push to palette in encountered order
            if (stableOrder) {
                palette[idx - (transparentIndex === 0 ? 1 : 0)] = tsv8;
            } else {
                palette.push(tsv8);
            }
            map.set(tsv8, idx);
            palCount = Math.max(palCount, idx + 1);
        }
        indices[i] = idx;
    }

    // Build compact palette array without holes
    // If transparency uses index 0, palette[0] is unused and we store only real colors
    let paletteTSV8;
    if (transparentIndex === 0) {
        // Count real colors and build palette starting from index 1
        const usedColors = new Set(map.keys());
        paletteTSV8 = new Uint8Array(usedColors.size);
        // Map indices 1..maxIndex to palette array positions 0..(size-1)
        let out = 0;
        const indexToTSV = new Map();
        for (const [tsv8, idx] of map.entries()) indexToTSV.set(idx, tsv8);
        for (let idx = 1; idx < palCount; idx++) {
            const tsv = indexToTSV.get(idx);
            if (tsv === undefined) continue;
            paletteTSV8[out++] = tsv;
        }
    } else {
        // No transparency conflict, build palette normally
        paletteTSV8 = new Uint8Array(map.size);
        const indexToTSV = new Map();
        for (const [tsv8, idx] of map.entries()) indexToTSV.set(idx, tsv8);
        let out = 0;
        for (let idx = 0; idx < palCount; idx++) {
            const tsv = indexToTSV.get(idx);
            if (tsv === undefined) continue;
            paletteTSV8[out++] = tsv;
        }
    }

    // Choose optimal typed array size for indices based on maximum value
    let maxIndex = 0;
    for (let i = 0; i < N; i++) if (indices[i] > maxIndex) maxIndex = indices[i];
    let indexArray;
    if (maxIndex <= 0xff) indexArray = new Uint8Array(indices);
    else indexArray = new Uint16Array(indices);

    return {
        indices: indexArray,
        paletteTSV8,
        transparentIndex,
    };
}

/* =============================
 * Token writing functions for each compression type
 * ============================= */

const CLASS_RLE = 0b00;
const CLASS_LITERAL = 0b01;
const CLASS_COPY = 0b10;
const CLASS_CTRL = 0b11;

const CTRL_END = 0x00;
const CTRL_SOLID = 0x01;
const CTRL_PAL_ADD_N = 0x03; // followed by varuint(count) + TSV8 bytes

function writeTokenClass(w, cls) {
    w.writeBits(cls & 0b11, 2);
}

function writeRLE(w, len, index, bpi) {
    writeTokenClass(w, CLASS_RLE);
    w.writeVarUint(len >>> 0);
    w.writeBits(index >>> 0, bpi);
}

function writeLiteral(w, seq, start, len, bpi) {
    writeTokenClass(w, CLASS_LITERAL);
    w.writeVarUint(len >>> 0);
    for (let i = 0; i < len; i++) {
        w.writeBits(seq[start + i] >>> 0, bpi);
    }
}

function writeCopy(w, offset, len) {
    writeTokenClass(w, CLASS_COPY);
    w.writeVarUint(offset >>> 0);
    w.writeVarUint(len >>> 0);
}

function writeControlByte(w, subtype) {
    writeTokenClass(w, CLASS_CTRL);
    w.writeByte(subtype & 0xff);
}

function writeEnd(w) {
    writeControlByte(w, CTRL_END);
}

function writeSolid(w, index, bpi) {
    writeControlByte(w, CTRL_SOLID);
    w.writeBits(index >>> 0, bpi);
}

function writePalAddN(w, tsv8PaletteBytes /* Uint8Array */) {
    writeControlByte(w, CTRL_PAL_ADD_N);
    w.writeVarUint(tsv8PaletteBytes.length >>> 0);
    for (let i = 0; i < tsv8PaletteBytes.length; i++) {
        w.writeByte(tsv8PaletteBytes[i]);
    }
}

/* =============================
 * LZ77 compression matcher and token selection logic
 * ============================= */

class LZMatcher {
    /**
     * A tiny rolling-hash matcher for sequences of palette indices.
     *
     * @param {Uint8Array|Uint16Array} indices
     * @param {number} width
     * @param {number} height
     * @param {object} opts
     *   - minMatch: minimum length for COPY (default 3)
     *   - maxChain: max backref candidates to check (default 32)
     *   - window: max backward distance to consider (default 8192)
     */
    constructor(indices, width, height, opts = {}) {
        this.idx = indices;
        this.W = width;
        this.H = height;
        this.N = indices.length;

        this.minMatch = Math.max(2, opts.minMatch ?? 3);
        this.maxChain = opts.maxChain ?? 32;
        this.window = opts.window ?? 8192;

        // Hash table for 4-index rolling windows
        this.HASH_SIZE = 1 << 15; // 32768 buckets
        this.head = new Int32Array(this.HASH_SIZE).fill(-1);
        this.next = new Int32Array(this.N).fill(-1);

        this._seedHashes();
    }

    _hash4(a, b, c, d) {
        // A simple mix for small integers
        let h = ((a * 0x9e3779b1) ^ (b * 0x85ebca77) ^ (c * 0xc2b2ae35) ^ (d * 0x27d4eb2f)) >>> 0;
        return h & (this.HASH_SIZE - 1);
    }

    _seedHashes() {
        const n = this.N;
        for (let i = 0; i + 3 < n; i++) {
            const a = this.idx[i] | 0;
            const b = this.idx[i + 1] | 0;
            const c = this.idx[i + 2] | 0;
            const d = this.idx[i + 3] | 0;
            const h = this._hash4(a, b, c, d);
            this.next[i] = this.head[h];
            this.head[h] = i;
        }
    }

    /** Find best back-reference at position `pos`. */
    findBest(pos) {
        const n = this.N;
        if (pos + this.minMatch >= n) return null;

        const a = this.idx[pos] | 0;
        const b = this.idx[pos + 1] | 0;
        const c = this.idx[pos + 2] | 0;
        const d = this.idx[pos + 3] | 0;
        const h = this._hash4(a, b, c, d);

        let bestLen = 0;
        let bestOff = 0;

        let cand = this.head[h];
        let chain = 0;
        while (cand >= 0 && chain < this.maxChain) {
            const off = pos - cand;
            if (off > 0 && off <= this.window) {
                // Extend match
                let L = 0;
                const maxL = Math.min(258, n - pos); // upper cap
                while (L < maxL && this.idx[cand + L] === this.idx[pos + L]) L++;
                if (L >= this.minMatch && L > bestLen) {
                    bestLen = L;
                    bestOff = off;
                    if (L >= 64) break; // good enough; short-circuit
                }
            }
            cand = this.next[cand];
            chain++;
        }

        if (bestLen >= this.minMatch) return { offset: bestOff, length: bestLen };
        return null;
    }
}

/**
 * Greedy tokenization: choose optimal compression among RLE, COPY, and LITERAL.
 * Emits tokens using the provided BitWriter.
 */
function encodeIndicesWithTokens(w, indices, width, height, bpi, opts = {}) {
    const N = indices.length;
    // Early: check SOLID
    let first = indices[0];
    let allSame = true;
    for (let i = 1; i < N; i++)
        if (indices[i] !== first) {
            allSame = false;
            break;
        }
    if (allSame) {
        writeSolid(w, first, bpi);
        writeEnd(w);
        return;
    }

    const matcher = new LZMatcher(indices, width, height, opts.lz || {});

    // LITERAL buffer (pending)
    let litStart = 0;
    let litLen = 0;

    const flushLiteral = () => {
        if (litLen > 0) {
            writeLiteral(w, indices, litStart, litLen, bpi);
            litStart += litLen;
            litLen = 0;
        }
    };

    let i = 0;
    while (i < N) {
        // RLE candidate
        let runLen = 1;
        const cur = indices[i];
        while (i + runLen < N && indices[i + runLen] === cur) runLen++;

        // COPY candidate
        let best = null;
        if (i + 3 < N) best = matcher.findBest(i);

        // Decide
        // Heuristic cost model:
        //  - RLE wins if runLen >= 3 (usually)
        //  - COPY wins if best && (copyCost < literalCostOfSameRange)
        //  - Otherwise accumulate literal

        const costLiteralBits = (len) => /*class*/ 2 + /*varint len*/ 8 + len * bpi; // rough
        const costRLEBits = (len) => 2 + 8 + bpi; // varint approx
        const costCOPYBits = (off, len) => 2 + 8 + 8; // 2 + varint(off) + varint(len) rough

        // Prefer RLE for long runs
        if (runLen >= (opts.rleMinRun || 3)) {
            // Flush any pending literal preceding this run
            flushLiteral();
            writeRLE(w, runLen, cur, bpi);
            i += runLen;
            // move literal anchor
            litStart = i;
            litLen = 0;
            continue;
        }

        if (best) {
            // Compare against writing as literal
            const litBits = costLiteralBits(best.length);
            const cpyBits = costCOPYBits(best.offset, best.length);
            if (cpyBits + (opts.copyFavorBiasBits || 0) < litBits) {
                flushLiteral();
                writeCopy(w, best.offset, best.length);
                i += best.length;
                litStart = i;
                litLen = 0;
                continue;
            }
        }

        // Otherwise, extend literal
        if (litLen === 0) litStart = i;
        litLen++;
        i++;

        // Optionally flush literal periodically to keep varints small
        const maxLitLen = opts.maxLiteral || 1 << 12;
        if (litLen >= maxLitLen) {
            flushLiteral();
            litStart = i;
            litLen = 0;
        }
    }

    // Flush trailing literal
    flushLiteral();
    writeEnd(w);
}

/* =============================
 * Main encoder API functions
 * ============================= */

const COLOR_MODE_TSV8 = 0; // flags bits 7..6 = 00

/** Compute minimal bits-per-index to encode [0..maxIndex]. */
function computeBPI(paletteCount, transparentIndex) {
    // paletteCount = number of real colors; transparent index (if any) occupies one index value.
    let maxIndexValue = paletteCount - 1;
    if (transparentIndex === 0) maxIndexValue = paletteCount; // colors are at 1..paletteCount; max index = paletteCount
    let bpi = 1;
    while (1 << bpi <= maxIndexValue) bpi++;
    if (bpi < 1) bpi = 1;
    if (bpi > 8) bpi = 8;
    return bpi;
}

/** Build header flags byte. */
function buildFlagsByte({ colorMode, bpi, hasTransparency, hasTA = false, profile = 0 }) {
    let flags = 0;
    flags |= (colorMode & 0x03) << 6;
    flags |= ((bpi - 1) & 0x07) << 3;
    if (hasTransparency) flags |= 0x04;
    if (hasTA) flags |= 0x02;
    if (profile) flags |= 0x01;
    return flags;
}

/**
 * Encode from RGBA buffer.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba - length = width*height*4
 * @param {object} opts
 *   - transparentRGBA?: [r,g,b,a]
 *   - alphaThreshold?: number (0..255)
 *   - lz?: { minMatch, maxChain, window }
 *   - rleMinRun?: number (default 3)
 *   - maxLiteral?: number
 *   - solidFillThreshold?: number (0..1), if >= ratio of single color, use SOLID
 * @returns {Uint8Array}
 */
function encodeTinySpriteRGBA(width, height, rgba, opts = {}) {
    if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
        throw new Error("rgba must be Uint8Array of length width*height*4");
    }

    const { indices, paletteTSV8, transparentIndex } = buildIndexedTSV8(width, height, rgba, opts);

    // Optional SOLID heuristic (already handled inside tokenization by exact check),
    // but we can short-circuit earlier if ratio is high.
    if (opts.solidFillThreshold != null) {
        const ratios = colorRatios(indices);
        if (ratios.maxRatio >= opts.solidFillThreshold) {
            // Build minimal stream with SOLID
            const bpi = computeBPI(paletteTSV8.length, transparentIndex);
            const flags = buildFlagsByte({ colorMode: COLOR_MODE_TSV8, bpi, hasTransparency: transparentIndex === 0 });

            const bytes = [];
            bytes.push(0xf1);
            writeULEB128ToArray(bytes, width);
            writeULEB128ToArray(bytes, height);
            bytes.push(flags);
            if (transparentIndex === 0) bytes.push(0x00); // index 0

            const w = new BitWriter();
            if (paletteTSV8.length > 0) writePalAddN(w, paletteTSV8);
            const dominantIndex = ratios.maxIndex;
            writeSolid(w, dominantIndex, bpi);
            writeEnd(w);

            const stream = w.toUint8Array();
            const out = new Uint8Array(bytes.length + stream.length);
            out.set(bytes, 0);
            out.set(stream, bytes.length);
            return out;
        }
    }

    // Compute bpi and header
    const bpi = computeBPI(paletteTSV8.length, transparentIndex);
    const flags = buildFlagsByte({ colorMode: COLOR_MODE_TSV8, bpi, hasTransparency: transparentIndex === 0 });

    // Header bytes
    const header = [];
    header.push(0xf1);
    writeULEB128ToArray(header, width);
    writeULEB128ToArray(header, height);
    header.push(flags);
    if (transparentIndex === 0) header.push(0x00);

    const w = new BitWriter();
    // Palette payload
    if (paletteTSV8.length > 0) writePalAddN(w, paletteTSV8);
    // Tokenize indices
    encodeIndicesWithTokens(w, indices, width, height, bpi, opts);

    const stream = w.toUint8Array();
    const out = new Uint8Array(header.length + stream.length);
    out.set(header, 0);
    out.set(stream, header.length);
    return out;
}

/** Compute color ratios to support SOLID heuristic. */
function colorRatios(indices) {
    const counts = new Map();
    for (let i = 0; i < indices.length; i++) {
        const v = indices[i];
        counts.set(v, (counts.get(v) || 0) + 1);
    }
    let maxIndex = 0,
        maxCount = 0;
    for (const [k, c] of counts.entries()) {
        if (c > maxCount) {
            maxCount = c;
            maxIndex = k;
        }
    }
    return { maxIndex, maxCount, maxRatio: maxCount / indices.length };
}

/**
 * Encode directly from pre-indexed pixels + TSV8 palette entries.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Uint16Array} indices - palette indices per pixel
 * @param {Uint8Array} paletteTSV8 - bytes of TSV8 entries in index order
 * @param {object} opts - same as encodeTinySpriteRGBA
 */
function encodeTinySpriteIndexed(width, height, indices, paletteTSV8, opts = {}) {
    const transparentIndex = opts.transparentIndex === 0 ? 0 : null; // only support index 0 as transparent
    const bpi = computeBPI(paletteTSV8.length, transparentIndex);
    const flags = buildFlagsByte({ colorMode: COLOR_MODE_TSV8, bpi, hasTransparency: transparentIndex === 0 });

    const header = [];
    header.push(0xf1);
    writeULEB128ToArray(header, width);
    writeULEB128ToArray(header, height);
    header.push(flags);
    if (transparentIndex === 0) header.push(0x00);

    const w = new BitWriter();
    if (paletteTSV8.length > 0) writePalAddN(w, paletteTSV8);
    encodeIndicesWithTokens(w, indices, width, height, bpi, opts);

    const stream = w.toUint8Array();
    const out = new Uint8Array(header.length + stream.length);
    out.set(header, 0);
    out.set(stream, header.length);
    return out;
}

/* =============================
 * String encoding for embedding in code and assets
 * ============================= */

/** Simple Base64 pack with prefix */
function toBase64(u8) {
    if (typeof Buffer !== "undefined") {
        return "ts1b|" + Buffer.from(u8).toString("base64");
    }
    // Browser
    let bin = "";
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    // btoa expects binary string
    return "ts1b|" + btoa(bin);
}

/**
 * Compact Base85 packer (Ascii85 variant). Not the absolute shortest possible,
 * but shorter than base64 by ~5–10% typically. URL-safe variant.
 */
function toTS85(u8) {
    // Ascii85 encoding groups of 4 bytes -> 5 chars.
    // We'll use a URL-safe alphabet set and no <~ ~> wrappers.
    const alphabet = [];
    // 85 ASCII characters chosen to be URL-safe & printable
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%()*+-./:;=?@^_{|}~";
    for (let i = 0; i < chars.length; i++) alphabet[i] = chars[i];

    let out = "ts1|";
    const len = u8.length;
    let i = 0;
    while (i + 3 < len) {
        const chunk = (u8[i] << 24) | (u8[i + 1] << 16) | (u8[i + 2] << 8) | u8[i + 3];
        i += 4;
        if (chunk === 0) {
            out += "z";
            continue;
        } // short zero run
        let v = chunk >>> 0;
        const c5 = new Array(5);
        for (let k = 4; k >= 0; k--) {
            c5[k] = v % 85;
            v = (v / 85) | 0;
        }
        for (let k = 0; k < 5; k++) out += alphabet[c5[k]];
    }
    const remain = len - i;
    if (remain > 0) {
        let chunk = 0;
        for (let k = 0; k < remain; k++) chunk |= u8[i + k] << ((3 - k) * 8);
        let v = chunk >>> 0;
        const c5 = new Array(5);
        for (let k = 4; k >= 0; k--) {
            c5[k] = v % 85;
            v = (v / 85) | 0;
        }
        for (let k = 0; k < remain + 1; k++) out += alphabet[c5[k]];
    }
    return out;
}

/* =============================
 * Utility functions and testing helpers
 * ============================= */

/** Create a simple RGBA buffer from a 2D array of [r,g,b,a] values. */
function rgbaFromMatrix(mat /* Array< Array<[r,g,b,a]> > */) {
    const h = mat.length;
    const w = mat[0].length;
    const out = new Uint8Array(w * h * 4);
    let p = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [r, g, b, a] = mat[y][x];
            out[p++] = r;
            out[p++] = g;
            out[p++] = b;
            out[p++] = a == null ? 255 : a;
        }
    }
    return { width: w, height: h, rgba: out };
}

/** Quick encoder wrapper returning both bytes and string forms. */
function encodeSprite({ width, height, rgba }, opts = {}) {
    const bytes = encodeTinySpriteRGBA(width, height, rgba, opts);
    return { bytes, ts85: toTS85(bytes), b64: toBase64(bytes) };
}

/* =============================
 * Module exports for various environments
 * ============================= */

const tinyspritesEncoder = {
    encodeTinySpriteRGBA,
    encodeTinySpriteIndexed,
    toTS85,
    toBase64,
    rgbaFromMatrix,
    // exposed for advanced users / tests
    _internals: {
        BitWriter,
        buildIndexedTSV8,
        rgbaToHSV,
        hsvToTSV8Byte,
        rgbaToTSV8Byte,
        LZMatcher,
        encodeIndicesWithTokens,
        constants: {
            CLASS_RLE,
            CLASS_LITERAL,
            CLASS_COPY,
            CLASS_CTRL,
            CTRL_END,
            CTRL_SOLID,
            CTRL_PAL_ADD_N,
            COLOR_MODE_TSV8,
        },
    },
};

// ESM / CJS / global
try {
    if (typeof module !== "undefined") module.exports = tinyspritesEncoder;
} catch (_) {}
try {
    if (typeof exports !== "undefined") exports.default = tinyspritesEncoder;
} catch (_) {}
try {
    if (typeof window !== "undefined") window.tinyspritesEncoder = tinyspritesEncoder;
} catch (_) {}
try {
    if (typeof globalThis !== "undefined") globalThis.tinyspritesEncoder = tinyspritesEncoder;
} catch (_) {}

/* =============================
 * Usage example (commented)
 * ============================= */

/**
// Example: encode a 12x12 red square with a green cross
const { width, height, rgba } = (function(){
  const w=12,h=12; const rgba=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    const red = (x===6 || y===6)?0:255; // red background
    const green = (x===6 || y===6)?255:0; // green cross
    rgba[i]=red; rgba[i+1]=green; rgba[i+2]=0; rgba[i+3]=255;
  }
  return {width:w,height:h,rgba};
})();

const { bytes, ts85, b64 } = tinyspritesEncoder.encodeSprite({ width, height, rgba }, {
  solidFillThreshold: 0.95, // optional
  rleMinRun: 3,
  lz: { minMatch: 3, maxChain: 32, window: 4096 },
});

console.log('tinysprite bytes', bytes);
console.log('as ts85 string', ts85);
console.log('as base64 string', b64);
*/
