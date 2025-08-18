/*
 * Decoder
 * ---------------------------------------------
 * Designed for tiny bundles (JS13K-friendly). This file is reasonably
 * commented for readability; minify + tree-shake for production.
 *
 * Supports the subset emitted by the reference encoder:
 *  - Header: 0xF1 (magic+version), ULEB width/height, flags
 *  - Color mode: TSV8 (Tiny HSV in 1 byte per palette entry)
 *  - Optional transparent index at 0
 *  - Tokens: RLE, LITERAL, COPY, CONTROL{ END, SOLID, PAL_ADD_N }
 *
 * Output shapes:
 *  - decode(Uint8Array | string) → { width, height, indices, bpi, paletteTSV8, transparentIndex }
 *  - expandToRGBA(decoded) → Uint8Array RGBA length = w*h*4
 *
 * Tree-shakable exports:
 *  - class TinySpriteDecoder (default)
 *  - functions: decodeTS85, decodeBase64, tsv8ToRGBA, expandToRGBA
 */

/* =============================
 * Small utilities (bit & varint)
 * ============================= */
class BitReader {
    constructor(bytes, offset = 0) {
        this.b = bytes;
        this.i = offset; // byte index
        this.buf = 0;
        this.c = 0; // bit buffer + count
    }
    _need(n) {
        while (this.c < n) {
            const v = this.i < this.b.length ? this.b[this.i++] : 0;
            this.buf = (this.buf << 8) | v;
            this.c += 8;
        }
    }
    readBits(n) {
        // MSB-first
        this._need(n);
        const shift = this.c - n;
        const v = (this.buf >>> shift) & ((1 << n) - 1);
        this.c -= n;
        this.buf &= (1 << this.c) - 1; // keep remaining bits
        return v;
    }
    align() {
        const mod = this.c & 7;
        if (mod) this.readBits(mod);
    }
}

function readULEB(bytes, iRef) {
    let v = 0,
        s = 0,
        i = iRef.i;
    for (;;) {
        const b = bytes[i++];
        v |= (b & 0x7f) << s;
        s += 7;
        if (!(b & 0x80)) break;
    }
    iRef.i = i;
    return v >>> 0;
}

/* =============================
 * TSV8 (Tiny HSV) → RGBA
 * ============================= */
function tsv8ToRGBA(tsv) {
    // Decode H4 S2 V2 to sRGB. Cheap HSV->RGB.
    const H4 = (tsv >> 4) & 0x0f,
        S2 = (tsv >> 2) & 0x03,
        V2 = tsv & 0x03;
    const s = S2 / 3;
    const v = V2 / 3;
    if (S2 === 0) {
        // grey
        const g = (v * 255) | 0;
        return [g, g, g, 255];
    }
    const h = (H4 / 16) * 6; // 0..6
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    let r = 0,
        g = 0,
        b = 0;
    if (h < 1) {
        r = c;
        g = x;
        b = 0;
    } else if (h < 2) {
        r = x;
        g = c;
        b = 0;
    } else if (h < 3) {
        r = 0;
        g = c;
        b = x;
    } else if (h < 4) {
        r = 0;
        g = x;
        b = c;
    } else if (h < 5) {
        r = x;
        g = 0;
        b = c;
    } else {
        r = c;
        g = 0;
        b = x;
    }
    const m = v - c;
    const R = ((r + m) * 255) | 0,
        G = ((g + m) * 255) | 0,
        B = ((b + m) * 255) | 0;
    return [R, G, B, 255];
}

function expandToRGBA(decoded) {
    const { width: w, height: h, indices, bpi, paletteTSV8, transparentIndex } = decoded;
    const out = new Uint8Array(w * h * 4);
    // Precompute palette RGBA table (index → RGBA)
    const pal = [];
    let offset = 0;
    if (transparentIndex === 0) {
        pal[0] = [0, 0, 0, 0];
    }
    for (let i = 0; i < paletteTSV8.length; i++) pal[(transparentIndex === 0 ? 1 : 0) + i] = tsv8ToRGBA(paletteTSV8[i]);
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const [r, g, b, a] = pal[idx] || [0, 0, 0, 255];
        out[offset++] = r;
        out[offset++] = g;
        out[offset++] = b;
        out[offset++] = a;
    }
    return out;
}

/* =============================
 * Decoder core
 * ============================= */
const CLASS_RLE = 0,
    CLASS_LITERAL = 1,
    CLASS_COPY = 2,
    CLASS_CTRL = 3;
const CTRL_END = 0x00,
    CTRL_SOLID = 0x01,
    CTRL_PAL_ADD_N = 0x03;

class TinySpriteDecoder {
    decode(input) {
        // Accept Uint8Array or ts85/base64 string
        let bytes;
        if (typeof input === "string") {
            bytes = input.startsWith("ts1|") ? decodeTS85(input) : input.startsWith("ts1b|") ? decodeBase64(input) : decodeBase64(input); // fallback
        } else bytes = input;

        // Header
        let iRef = { i: 0 };
        const magic = bytes[iRef.i++];
        if (magic !== 0xf1) throw new Error("!bv");
        const width = readULEB(bytes, iRef);
        const height = readULEB(bytes, iRef);
        const flags = bytes[iRef.i++];

        const colorMode = (flags >> 6) & 3; // expect 0 (TSV8)
        const bpi = ((flags >> 3) & 7) + 1;
        const hasTK = !!(flags & 0x04);
        /* const hasTA = !!(flags & 0x02); const profile = flags & 1; */

        let transparentIndex = null;
        if (hasTK) transparentIndex = bytes[iRef.i++]; // expect 0

        // Token stream starts at iRef.i
        const br = new BitReader(bytes, iRef.i);

        const total = width * height;
        // Indices are small; use Uint16 for safety, later downsize if wanted
        const out = new Uint16Array(total);
        let op = 0; // output pointer in indices

        let paletteTSV8 = new Uint8Array(0);

        const writeRepeat = (index, len) => {
            for (let k = 0; k < len; k++) out[op++] = index;
        };

        const writeLiteral = (len) => {
            for (let k = 0; k < len; k++) out[op++] = br.readBits(bpi);
        };

        for (;;) {
            const cls = br.readBits(2);
            if (cls === CLASS_RLE) {
                const len = this._readVar(br);
                const index = br.readBits(bpi);
                writeRepeat(index, len);
            } else if (cls === CLASS_LITERAL) {
                const len = this._readVar(br);
                writeLiteral(len);
            } else if (cls === CLASS_COPY) {
                const off = this._readVar(br);
                const len = this._readVar(br);
                const src = op - off;
                for (let k = 0; k < len; k++) out[op++] = out[src + k];
            } else {
                // CONTROL
                const sub = br.readBits(8);
                if (sub === CTRL_END) break;
                else if (sub === CTRL_SOLID) {
                    const idx = br.readBits(bpi);
                    for (let k = 0; k < total; k++) out[k] = idx;
                    op = total;
                } else if (sub === CTRL_PAL_ADD_N) {
                    const count = this._readVar(br);
                    // read count bytes aligned to byte boundary (BitWriter wrote whole bytes)
                    br.align();
                    const start = (iRef.i = br.i); // peek current absolute byte index
                    const newPal = bytes.subarray(start, start + count);
                    // advance reader
                    br.i += count;
                    iRef.i += count;
                    // concat palettes
                    const old = paletteTSV8;
                    paletteTSV8 = new Uint8Array(old.length + count);
                    paletteTSV8.set(old, 0);
                    paletteTSV8.set(newPal, old.length);
                } else {
                    throw new Error("!uc " + sub);
                }
            }
        }

        // Downsize to minimal type (optional for size/runtime)
        let max = 0;
        for (let k = 0; k < op; k++) if (out[k] > max) max = out[k];
        const indices = max <= 0xff ? new Uint8Array(out) : out;

        return { width, height, indices, bpi, paletteTSV8, transparentIndex };
    }

    _readVar(br) {
        // ULEB128 over the bitstream boundary (byte-aligned by writer)
        br.align();
        let v = 0,
            s = 0;
        const bytes = br.b;
        let i = br.i;
        for (;;) {
            const b = bytes[i++];
            v |= (b & 0x7f) << s;
            s += 7;
            if (!(b & 0x80)) break;
        }
        br.i = i;
        return v >>> 0;
    }
}

/* =============================
 * Optional string decoders (tree-shakable)
 * ============================= */
function decodeBase64(str) {
    if (str.startsWith("ts1b|")) str = str.slice(5);
    if (typeof Buffer !== "undefined" && Buffer.from) {
        return new Uint8Array(Buffer.from(str, "base64"));
    }
    // browser
    const bin = atob(str);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
}

function decodeTS85(str) {
    if (str.startsWith("ts1|")) str = str.slice(4);
    // Alphabet must match encoder
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%()*+-./:;=?@^_{|}~";
    const map = new Map();
    for (let i = 0; i < chars.length; i++) map.set(chars[i], i);
    const out = [];
    let i = 0;
    while (i < str.length) {
        const c = str[i++];
        if (c === "z") {
            out.push(0, 0, 0, 0);
            continue;
        }
        const rem = str.length - (i - 1);
        const take = Math.min(5, rem);
        const block = [c];
        for (let k = 1; k < take; k++) block[k] = str[i++];
        // decode 5 chars → 4 bytes; last block may be shorter
        let v = 0;
        for (let k = 0; k < block.length; k++) v = v * 85 + (map.get(block[k]) || 0);
        const pad = 5 - block.length;
        v *= Math.pow(85, pad);
        const b0 = (v >>> 24) & 255,
            b1 = (v >>> 16) & 255,
            b2 = (v >>> 8) & 255,
            b3 = v & 255;
        if (block.length >= 2) out.push(b0);
        if (block.length >= 3) out.push(b1);
        if (block.length >= 4) out.push(b2);
        if (block.length >= 5) out.push(b3);
    }
    return new Uint8Array(out);
}

/* =============================
 * Named helpers (tree-shakable)
 * ============================= */
const expandToRGBAHelper = (decoded) => expandToRGBA(decoded);

// ESM/CJS/global exports
export default TinySpriteDecoder;
export { TinySpriteDecoder, decodeTS85, decodeBase64, tsv8ToRGBA, expandToRGBAHelper as expandToRGBA };

// CJS fallback (optional)
try {
    if (typeof module !== "undefined") module.exports = TinySpriteDecoder;
} catch (_) {}
