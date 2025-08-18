/*
 * tinysprites v1 — Encoder (JavaScript, no deps)
 * ------------------------------------------------------------
 * Purpose-built, ultra-compact encoder for tiny pixel-art sprites.
 * Produces the tinysprites (TS) binary stream ready for js/string shipping
 * and later decoding by a tiny decoder (planned v1 decoder fits <3KB min+gzip).
 *
 * Core ideas implemented here:
 *  - Byte-minimal header (magic/version + ULEB128 width/height + flags)
 *  - Color modes: TSV8 (default), RGB332, PAL12, RGB888 (palette entries encoded on-stream)
 *  - Bits-per-index (bpi) selection based on palette size (1..8 bpp)
 *  - Token stream with 2-bit classes: RLE, LITERAL, COPY, CONTROL
 *  - CONTROL ops used in v1: END, SOLID, ROW_REPEAT, PAL_ADDBATCH, PAL_PATCH, PAT_DEF, PAT_USE
 *  - Greedy LZ/RLE hybrid with row-aware COPY and micro-pattern dictionary
 *  - Optional quantization from RGBA -> palette (median-cut-lite) for convenience
 *  - String wrapper (Base64 URL-safe) for easy embedding
 *
 * Focus: encoder ergonomics + strong compression on micro sprites
 * (12x12, 16x16, 32x32). Decoder remains simple and streaming-friendly.
 *
 * This file contains encoder-only logic. No editor/UI logic here.
 * Licensed MIT.
 */

/* ============================================================
 * Top-level export
 * ============================================================ */
export const TinySprites = Object.freeze({
    /** Version nibble */
    VERSION: 1,
    ColorMode: Object.freeze({ TSV8: 0, RGB332: 1, PAL12: 2, RGB888: 3 }),
    /**
     * Encode a sprite into tinysprites binary (Uint8Array).
     * Accepts either {indices,palette} or {rgba} input forms.
     *
     * @param {Object} opts
     * @param {number} opts.width  - width in pixels
     * @param {number} opts.height - height in pixels
     * @param {Uint8Array|number[]} [opts.indices] - palette indices length = w*h (optional if rgba provided)
     * @param {Array<number>|Uint8Array} [opts.rgba] - RGBA bytes length = w*h*4 (optional if indices provided)
     * @param {Array<{r:number,g:number,b:number,a?:number}>|Array<number>} [opts.palette] - palette colors (RGB or 0xRRGGBB numbers)
     * @param {number} [opts.maxPalette=16]  - maximum palette size when quantizing
     * @param {number} [opts.transparencyIndex=-1] - index (0..N-1) that is transparent; -1 = none
     * @param {number} [opts.colorMode=TinySprites.ColorMode.TSV8] - palette entry encoding mode
     * @param {"auto"|"general"|"planar"} [opts.profile="auto"]
     * @param {boolean} [opts.enablePatterns=true] - enable PAT_DEF/PAT_USE micro-dictionary
     * @param {boolean} [opts.enableRowRepeat=true] - enable ROW_REPEAT optimization
     * @param {boolean} [opts.enableCopy=true] - enable LZ COPY references
     * @param {boolean} [opts.enableRLE=true] - enable run-length encoding
     * @param {number} [opts.solidThreshold=1.0] - if 1.0, use SOLID only when fully solid; <1 to try delta (not used in v1)
     * @param {boolean} [opts.returnString=false] - if true, return Base64 URL-safe string instead of bytes
     * @param {boolean} [opts.fast=false] - if true, use faster/greedier pass (slightly worse compression)
     * @param {Array<{index:number,rgb:{r:number,g:number,b:number}|number|Array<number>}>} [opts.paletteDeltas=null] - optional palette patches after initial batch
     * @returns {Uint8Array|string}
     */
    encode(opts) {
        const cfg = _normalizeOptions(opts);

        // Coerce dimensions early (string → int; clamp invalid)
        const w = Number(cfg.width) | 0;
        const h = Number(cfg.height) | 0;

        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
            console.error("[TinySprites.encode] Bad dims", {
                rawW: cfg.width,
                rawH: cfg.height,
                typeW: typeof cfg.width,
                typeH: typeof cfg.height,
            });
            throw new Error("width/height must be positive integers");
        }

        // Build palette + indices if RGBA input
        let indices = cfg.indices;
        let paletteRGB = _normalizePalette(cfg.palette);

        if (!indices) {
            if (!cfg.rgba) throw new Error("Provide either indices or rgba input");
            const res = buildPaletteAndIndicesFromRGBA(cfg.rgba, w, h, cfg.maxPalette, cfg.fast);
            indices = res.indices;
            paletteRGB = res.paletteRGB; // array of {r,g,b}
        }

        // Validate indices length
        if (indices.length !== w * h) {
            throw new Error(`indices length ${indices.length} != ${w * h}`);
        }

        // Compute palette size actually used
        const used = computeUsedIndices(indices);
        const paletteSize = Math.max(used.size, paletteRGB ? paletteRGB.length : 0);

        // Bits-per-index (bpi)
        const bpi = Math.min(8, Math.max(1, Math.ceil(Math.log2(Math.max(1, paletteSize)))));

        // Build encoded palette entries according to color mode
        const colorMode = cfg.colorMode;
        const palBytes = encodePaletteEntries(paletteRGB, colorMode);

        // Prepare encoder state
        const st = new EncoderState({
            width: w,
            height: h,
            indices: asUint8(indices),
            bpi,
            transparencyIndex: cfg.transparencyIndex,
            profile: cfg.profile,
            colorMode,
            enablePatterns: cfg.enablePatterns,
            enableRowRepeat: cfg.enableRowRepeat,
            enableCopy: cfg.enableCopy,
            enableRLE: cfg.enableRLE,
            solidThreshold: cfg.solidThreshold,
            fast: cfg.fast,
        });

        // Detect single-color full-solid
        if (st.isFullySolid()) {
            const bytes = assembleBytes_HeaderAndStream({ st, palBytes, tokensWriter: (bw) => emitSolidStream(st, bw) });
            return cfg.returnString ? toBase64Url(bytes) : bytes;
        }

        // Pre-pass: discover micro-patterns (PAT_DEF) if enabled
        let patterns = [];
        if (st.enablePatterns) {
            patterns = discoverPatternsWithDeltas(st.indices, w, h, 3, 12, st.fast ? 6 : 10);
            console.log("[TinySprites.encode] Discovered patterns (with deltas):", patterns.length, patterns);
        }

        // Build token stream
        // Ensure pattern definitions are emitted before usage by attaching them to the writer
        const tokensWriter = (bw) => encodeTokenStream(st, bw, patterns);
        tokensWriter.__patterns__ = patterns;

        // Prepare optional palette patches payload (if provided)
        let palPatches = null;
        if (Array.isArray(cfg.paletteDeltas) && cfg.paletteDeltas.length) {
            palPatches = cfg.paletteDeltas.map((p) => {
                const idx = p.index | 0;
                const rgb = normalizeRGB(p.rgb);
                const bytes = encodePaletteEntryOne(rgb, colorMode);
                return { idx, bytes };
            });
        }

        const bytes = assembleBytes_HeaderAndStream({ st, palBytes, palPatches, tokensWriter });
        return cfg.returnString ? toBase64Url(bytes) : bytes;
    },

    /** Convenience wrapper: returns a Base64 URL-safe string ("ts1|...") */
    encodeToString(opts) {
        return "ts1|" + TinySprites.encode({ ...opts, returnString: true });
    },
});

/* ============================================================
 * Internal helpers & structures
 * ============================================================ */

/** @typedef {{width:number,height:number,indices:Uint8Array,bpi:number,transparencyIndex:number,profile:string,colorMode:number,enablePatterns:boolean,enableRowRepeat:boolean,enableCopy:boolean,enableRLE:boolean,solidThreshold:number,fast:boolean}} EncState */

class EncoderState /** @implements EncState */ {
    constructor(cfg) {
        Object.assign(this, cfg);
        this.pixelCount = this.width * this.height;
        // For COPY search: rolling map from 3-index signature -> recent positions (ring buffer)
        this.sigMap = new Map();
        this.windowLimit = 8192; // max lookback indices (kept small for tiny sprites)
    }
    isFullySolid() {
        const arr = this.indices;
        const first = arr[0];
        for (let i = 1; i < arr.length; i++) if (arr[i] !== first) return false;
        return true;
    }
}

function _normalizeOptions(opts) {
    const def = {
        colorMode: TinySprites.ColorMode.TSV8,
        maxPalette: 16,
        profile: "auto",
        transparencyIndex: -1,
        enablePatterns: true,
        enableRowRepeat: true,
        enableCopy: true,
        enableRLE: true,
        solidThreshold: 1.0,
        returnString: false,
        fast: false,
        // New: optional deltas to patch specific palette entries after the initial batch
        // Format: [{ index: number, rgb: {r,g,b} | 0xRRGGBB | [r,g,b] }, ...]
        paletteDeltas: null,
    };
    return Object.freeze({ ...def, ...opts });
}

function normalizeRGB(x) {
    if (typeof x === "number") return { r: (x >>> 16) & 255, g: (x >>> 8) & 255, b: x & 255 };
    if (Array.isArray(x)) return { r: x[0] | 0, g: x[1] | 0, b: x[2] | 0 };
    return { r: x.r | 0, g: x.g | 0, b: x.b | 0 };
}

function _normalizePalette(pal) {
    if (!pal) return null;
    const out = [];
    for (const c of pal) {
        if (typeof c === "number") out.push({ r: (c >>> 16) & 255, g: (c >>> 8) & 255, b: c & 255 });
        else if (c && typeof c === "object") out.push({ r: c.r | 0, g: c.g | 0, b: c.b | 0 });
    }
    return out;
}

function asUint8(arr) {
    if (arr instanceof Uint8Array) return arr;
    const u = new Uint8Array(arr.length);
    for (let i = 0; i < arr.length; i++) u[i] = arr[i] | 0;
    return u;
}

function computeUsedIndices(indices) {
    const s = new Set();
    for (let i = 0; i < indices.length; i++) s.add(indices[i]);
    return s;
}

/* ============================================================
 * Palette entry encoding
 * ============================================================ */

/**
 * Encode palette entries into bytes according to color mode.
 * @param {Array<{r:number,g:number,b:number}>|null} paletteRGB
 * @param {number} colorMode
 * @returns {Uint8Array} palBytes (may be empty)
 */
function encodePaletteEntries(paletteRGB, colorMode) {
    if (!paletteRGB || paletteRGB.length === 0) return new Uint8Array(0);
    const bytes = [];
    switch (colorMode) {
        case TinySprites.ColorMode.TSV8:
            for (const { r, g, b } of paletteRGB) bytes.push(rgbToTSV8(r, g, b));
            break;
        case TinySprites.ColorMode.RGB332:
            for (const { r, g, b } of paletteRGB) bytes.push(((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6));
            break;
        case TinySprites.ColorMode.PAL12:
            for (const { r, g, b } of paletteRGB) {
                const R = r >> 4,
                    G = g >> 4,
                    B = b >> 4; // 4:4:4
                bytes.push((R << 4) | G, B << 4); // store as 12 bits = 1.5 bytes; we pack as 2 bytes with low nibble zero
            }
            break;
        case TinySprites.ColorMode.RGB888:
            for (const { r, g, b } of paletteRGB) bytes.push(r, g, b);
            break;
        default:
            throw new Error("Unknown color mode");
    }
    return Uint8Array.from(bytes);
}

/** Convert sRGB (0..255) → TSV8 byte (H4 S2 V2) */
function rgbToTSV8(r, g, b) {
    // Compute HSV in [0,1]
    const rf = r / 255,
        gf = g / 255,
        bf = b / 255;
    const max = Math.max(rf, gf, bf),
        min = Math.min(rf, gf, bf);
    const d = max - min;
    let h = 0; // 0..1
    if (d !== 0) {
        if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) / 6;
        else if (max === gf) h = ((bf - rf) / d + 2) / 6;
        else h = ((rf - gf) / d + 4) / 6;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    const H = (s === 0 ? 0 : Math.round(h * 15)) & 15; // hue irrelevant if grey
    const S = Math.round(s * 3) & 3;
    const V = Math.round(v * 3) & 3;
    return (H << 4) | (S << 2) | V;
}

/* ============================================================
 * Bit writer & varints
 * ============================================================ */

class BitWriter {
    constructor() {
        this.buf = [];
        this.cur = 0;
        this.bitpos = 0;
    }
    /** write n bits (n<=32), low bits of value first */
    writeBits(val, n) {
        let v = val >>> 0;
        let bits = n | 0;
        while (bits > 0) {
            const take = Math.min(8 - this.bitpos, bits);
            this.cur |= (v & ((1 << take) - 1)) << this.bitpos;
            this.bitpos += take;
            v >>>= take;
            bits -= take;
            if (this.bitpos === 8) {
                this.buf.push(this.cur);
                this.cur = 0;
                this.bitpos = 0;
            }
        }
    }
    writeByte(b) {
        this.writeBits(b & 255, 8);
    }
    writeULEB128(n) {
        let v = n >>> 0;
        while (v >= 0x80) {
            this.writeByte((v & 0x7f) | 0x80);
            v >>>= 7;
        }
        this.writeByte(v);
    }
    /** Align to next byte boundary (pad with zeros) */
    align() {
        if (this.bitpos > 0) {
            this.buf.push(this.cur);
            this.cur = 0;
            this.bitpos = 0;
        }
    }
    toUint8() {
        this.align();
        return Uint8Array.from(this.buf);
    }
}

/* ============================================================
 * Tokens & stream emission
 * ============================================================ */

// Token class prefixes (2 bits): 00 RLE, 01 LITERAL, 10 COPY, 11 CONTROL
const TK = Object.freeze({ RLE: 0, LIT: 1, CPY: 2, CTRL: 3 });
// CONTROL sub-opcodes (1 byte after class=CTRL)
const CTRL = Object.freeze({
    END: 0x00,
    SOLID: 0x01,
    NEWROW: 0x02, // reserved hint (not used by encoder yet)
    ROW_REPEAT: 0x06,
    SKIP: 0x07, // reserved
    PAL_ADDBATCH: 0x30, // followed by count (ULEB) and palette bytes according to color mode
    PAL_PATCH: 0x31, // count (ULEB), then repeated [index (ULEB) + raw color bytes]
    PAT_DEF: 0x40, // id (0..15), len (ULEB), payload (packed indices)
    PAT_USE: 0x41, // id (0..15), repeat (ULEB)
    PAT_DEF_DELTA: 0x42, // newId(0..15), baseId(0..15), editsCount(ULEB), then edits: offset(ULEB)+index(bpi)
});

/** Encode ONE palette entry into raw bytes according to color mode. */
function encodePaletteEntryOne(rgb, colorMode) {
    const { r, g, b } = rgb;
    switch (colorMode) {
        case TinySprites.ColorMode.TSV8:
            return Uint8Array.from([rgbToTSV8(r, g, b)]);
        case TinySprites.ColorMode.RGB332:
            return Uint8Array.from([((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6)]);
        case TinySprites.ColorMode.PAL12: {
            const R = r >> 4,
                G = g >> 4,
                B = b >> 4;
            return Uint8Array.from([(R << 4) | G, B << 4]);
        }
        case TinySprites.ColorMode.RGB888:
            return Uint8Array.from([r, g, b]);
        default:
            throw new Error("Unknown color mode");
    }
}

/**
 * Assembles final bytes: header + optional transKey + palette block + token stream (provided by callback)
 */
function assembleBytes_HeaderAndStream({ st, palBytes, palPatches, tokensWriter }) {
    const header = [];
    header.push(0xf0 | (TinySprites.VERSION & 0x0f));

    const tmpBW = new BitWriter();
    tmpBW.writeULEB128(st.width);
    tmpBW.writeULEB128(st.height);
    tmpBW.align();
    const wh = tmpBW.toUint8();
    for (const b of wh) header.push(b);

    let flags = ((st.colorMode & 3) << 6) | (((st.bpi - 1) & 7) << 3);
    if (st.transparencyIndex >= 0) flags |= 0b100;
    const profile = st.profile === "planar" ? 1 : 0;
    flags |= profile;
    header.push(flags & 255);
    if (st.transparencyIndex >= 0) header.push(st.transparencyIndex & 255);

    const bw = new BitWriter();

    if (palBytes.length > 0) {
        bw.writeBits(TK.CTRL, 2);
        bw.writeByte(CTRL.PAL_ADDBATCH);
        bw.writeULEB128(palBytes.length);
        bw.align();
        for (const b of palBytes) bw.writeByte(b);
    }

    if (Array.isArray(palPatches) && palPatches.length) {
        bw.writeBits(TK.CTRL, 2);
        bw.writeByte(CTRL.PAL_PATCH);
        bw.writeULEB128(palPatches.length);
        bw.align();
        for (const patch of palPatches) {
            bw.writeULEB128(patch.idx >>> 0);
            for (const b of patch.bytes) bw.writeByte(b);
        }
    }

    // Emit pattern definitions (supports base defs and delta defs)
    const patterns = tokensWriter.__patterns__ || [];
    for (const p of patterns) {
        if (p.type === "delta") {
            bw.writeBits(TK.CTRL, 2);
            bw.writeByte(CTRL.PAT_DEF_DELTA);
            bw.writeByte(p.id & 0x0f);
            bw.writeByte(p.baseId & 0x0f);
            bw.writeULEB128(p.edits.length);
            for (const e of p.edits) {
                bw.writeULEB128(e.off >>> 0);
                bw.writeBits(e.val & ((1 << st.bpi) - 1), st.bpi);
            }
        } else {
            bw.writeBits(TK.CTRL, 2);
            bw.writeByte(CTRL.PAT_DEF);
            bw.writeByte(p.id & 0x0f);
            bw.writeULEB128(p.len);
            for (let k = 0; k < p.len; k++) bw.writeBits(p.indices[k], st.bpi);
        }
    }

    tokensWriter(bw);

    bw.writeBits(TK.CTRL, 2);
    bw.writeByte(CTRL.END);
    bw.align();

    const stream = bw.toUint8();
    const out = new Uint8Array(header.length + stream.length);
    out.set(header, 0);
    out.set(stream, header.length);
    return out;
}

/** Emit a SOLID stream (whole image single index) */
function emitSolidStream(st, bw) {
    bw.writeBits(TK.CTRL, 2);
    bw.writeByte(CTRL.SOLID);
    bw.writeBits(st.indices[0], st.bpi);
}

/**
 * Discover repeating micro-patterns to define with PAT_DEF.
 * Returns array of {id,len,indices} sorted by usefulness.
 */
function discoverPatterns(indices, w, h, minLen = 3, maxLen = 12, maxPatterns = 10) {
    const N = indices.length;
    console.log("[TinySprites.discoverPatterns] Input:", { N, w, h, minLen, maxLen, maxPatterns });
    const freq = new Map();
    const keyOf = (start, len) => {
        let k = `${len}|`;
        for (let i = 0; i < len; i++) k += String.fromCharCode(indices[start + i]);
        return k;
    };
    for (let i = 0; i < N; i++) {
        const maxL = Math.min(maxLen, N - i);
        let prev = indices[i];
        let sameRun = 1;
        for (let L = minLen; L <= maxL; L++) {
            const last = indices[i + L - 1];
            if (last === prev) sameRun++;
            else sameRun = 1;
            prev = last;
            // skip pure single-color runs (RLE will handle)
            if (sameRun === L) continue;
            const k = keyOf(i, L);
            freq.set(k, (freq.get(k) || 0) + 1);
        }
    }
    // Score patterns by total saved vs literal: occurrences*(L*bpi) - (defCost + usesCost)
    const cands = [];
    for (const [k, count] of freq) {
        if (count < 3) continue; // must repeat
        const bar = k.indexOf("|");
        const L = parseInt(k.slice(0, bar), 10);
        const seq = k.slice(bar + 1);
        const arr = new Array(L);
        for (let i = 0; i < L; i++) arr[i] = seq.charCodeAt(i);
        cands.push({ len: L, indices: arr, count });
    }
    // Heuristic sort: longer first, then frequency
    cands.sort((a, b) => b.len - a.len || b.count - a.count);
    const take = Math.min(maxPatterns, cands.length, 16); // up to 16 IDs (0..15)
    const out = [];
    for (let i = 0; i < take; i++) out.push({ id: i, len: cands[i].len, indices: cands[i].indices });
    console.log("[TinySprites.discoverPatterns] Discovered patterns:", out.length, "candidates:", cands.length, "final patterns:", out);
    return out;
}

/** Build raw pattern candidates (no IDs), reusing your existing mining logic */
function discoverPatternCandidates(indices, w, h, minLen = 3, maxLen = 12) {
    const N = indices.length;
    const freq = new Map();
    const keyOf = (start, len) => {
        let k = `${len}|`;
        for (let i = 0; i < len; i++) k += String.fromCharCode(indices[start + i]);
        return k;
    };
    for (let i = 0; i < N; i++) {
        const maxL = Math.min(maxLen, N - i);
        let prev = indices[i];
        let sameRun = 1;
        for (let L = minLen; L <= maxL; L++) {
            const last = indices[i + L - 1];
            if (last === prev) sameRun++;
            else sameRun = 1;
            prev = last;
            if (sameRun === L) continue; // RLE will handle pure runs
            const k = keyOf(i, L);
            freq.set(k, (freq.get(k) || 0) + 1);
        }
    }
    const cands = [];
    for (const [k, count] of freq) {
        if (count < 3) continue;
        const bar = k.indexOf("|");
        const L = parseInt(k.slice(0, bar), 10);
        const seq = k.slice(bar + 1);
        const arr = new Array(L);
        for (let i = 0; i < L; i++) arr[i] = seq.charCodeAt(i);
        cands.push({ len: L, indices: arr, count });
    }
    // prefer longer + more frequent
    cands.sort((a, b) => b.len - a.len || b.count - a.count);
    return cands;
}

/** Compute edits (offset,val) to turn base -> target */
function editsBetween(base, target) {
    const edits = [];
    for (let i = 0; i < target.length; i++) {
        if (base[i] !== target[i]) edits.push({ off: i, val: target[i] });
    }
    return edits;
}

/**
 * Plan up to 16 patterns: some as full PAT_DEF, others as PAT_DEF_DELTA from a leader.
 * Heuristic: same length & small edit count (<= len/8, capped at 4) → delta.
 */
function discoverPatternsWithDeltas(indices, w, h, minLen = 3, maxLen = 12, maxPatterns = 10) {
    const cands = discoverPatternCandidates(indices, w, h, minLen, maxLen);
    const out = [];
    const leaders = []; // {id,len,indices}

    let nextId = 0;
    const idCap = 16;
    const target = Math.min(maxPatterns, cands.length, idCap);

    for (const cand of cands) {
        if (nextId >= target) break;

        // find a compatible leader
        let chosenLeader = null,
            chosenEdits = null;
        for (const L of leaders) {
            if (L.len !== cand.len) continue;
            const edits = editsBetween(L.indices, cand.indices);
            const thr = Math.min(4, Math.max(1, Math.floor(cand.len / 8))); // small patch threshold
            if (edits.length > 0 && edits.length <= thr) {
                chosenLeader = L;
                chosenEdits = edits;
                break;
            }
        }

        if (chosenLeader) {
            out.push({
                id: nextId++,
                type: "delta",
                baseId: chosenLeader.id,
                len: cand.len,
                indices: cand.indices, // materialized for matcher
                edits: chosenEdits,
            });
        } else {
            const id = nextId++;
            const def = { id, type: "def", len: cand.len, indices: cand.indices };
            out.push(def);
            leaders.push({ id, len: cand.len, indices: cand.indices });
        }
    }

    // Sorting: longer first so encoder favors big matches;
    // within same length, put base defs before deltas.
    out.sort((a, b) => b.len - a.len || (a.type === "def" && b.type !== "def" ? -1 : a.type !== "def" && b.type === "def" ? 1 : 0));
    return out;
}

/* ============================================================
 * Encoding core
 * ============================================================ */

function encodeTokenStream(st, bw, patterns) {
    const W = st.width,
        H = st.height,
        N = st.pixelCount,
        data = st.indices;
    let pos = 0;

    // Helper to flush a literal run
    let litStart = -1;
    const flushLiteral = () => {
        if (litStart >= 0) {
            const len = pos - litStart;
            if (len > 0) {
                // Emit LITERAL
                bw.writeBits(TK.LIT, 2);
                bw.writeULEB128(len);
                for (let i = 0; i < len; i++) bw.writeBits(data[litStart + i], st.bpi);
            }
            litStart = -1;
        }
    };

    // Precompute pattern map for quick match
    const patMap = new Map();
    for (const p of patterns) {
        const key = p.indices.join(",");
        patMap.set(key, p);
    }

    // Row repeat helper
    const rowEqual = (r1, r2) => {
        const o1 = r1 * W,
            o2 = r2 * W;
        for (let i = 0; i < W; i++) if (data[o1 + i] !== data[o2 + i]) return false;
        return true;
    };

    // COPY support structures
    const sigMap = new Map(); // signature -> array of positions
    const pushSig = (i) => {
        if (i + 2 >= N) return;
        const a = data[i],
            b = data[i + 1],
            c = data[i + 2];
        const sig = (a << 16) | (b << 8) | c; // 24-bit signature
        let arr = sigMap.get(sig);
        if (!arr) {
            arr = [];
            sigMap.set(sig, arr);
        }
        arr.push(i);
        if (arr.length > 32) arr.shift(); // keep recent limited
    };
    for (let i = 0; i < Math.min(N, st.windowLimit); i++) pushSig(i);

    for (let y = 0; y < H; y++) {
        const rowStart = y * W;
        const nextRowStart = rowStart + W;

        // Try ROW_REPEAT (copy previous row) if enabled and y>0
        if (st.enableRowRepeat && y > 0 && rowEqual(y - 1, y)) {
            flushLiteral();
            bw.writeBits(TK.CTRL, 2);
            bw.writeByte(CTRL.ROW_REPEAT);
            pos = nextRowStart;
            // push signatures for this row into history (as if written)
            for (let i = rowStart; i < nextRowStart; i++) pushSig(i);
            continue;
        }

        while (pos < nextRowStart) {
            // Option 1: RLE
            let best = { kind: "lit", score: 0, len: 1 };

            if (st.enableRLE) {
                const i0 = pos;
                const v = data[i0];
                let L = 1;
                const maxL = nextRowStart - pos;
                while (i0 + L < nextRowStart && data[i0 + L] === v) L++;
                if (L >= 2) {
                    const cost = tokenCost_RLE(st, L); // in bits
                    const saved = literalCost(st, L) - cost;
                    if (saved > 0) best = { kind: "rle", score: saved, len: L, v };
                }
            }

            // Option 2: COPY (LZ)
            if (st.enableCopy && pos + 3 < nextRowStart) {
                const a = data[pos],
                    b = data[pos + 1],
                    c = data[pos + 2];
                const sig = (a << 16) | (b << 8) | c;
                const cand = sigMap.get(sig);
                if (cand && cand.length) {
                    // Find best match length among candidates
                    let bestLen = 0,
                        bestOff = 0;
                    for (let k = cand.length - 1; k >= 0; k--) {
                        const p = cand[k];
                        if (p >= pos) continue;
                        const off = pos - p;
                        if (off > st.windowLimit) break;
                        const maxL = Math.min(nextRowStart - pos, nextRowStart - p); // stay in row for better locality
                        let L = 3;
                        while (L < maxL && data[p + L] === data[pos + L]) L++;
                        if (L > bestLen) {
                            bestLen = L;
                            bestOff = off;
                            if (st.fast && L >= 8) break;
                        }
                    }
                    if (bestLen >= 3) {
                        const cost = tokenCost_COPY(st, bestOff, bestLen);
                        const saved = literalCost(st, bestLen) - cost;
                        if (saved > best.score) best = { kind: "cpy", score: saved, len: bestLen, off: bestOff };
                    }
                }
            }

            // Option 3: PATTERN USE (pattern must align at pos)
            if (patterns.length) {
                // Check longest patterns first
                for (const p of patterns) {
                    if (p.len <= nextRowStart - pos) {
                        let match = true;
                        for (let i = 0; i < p.len; i++) {
                            if (data[pos + i] !== p.indices[i]) {
                                match = false;
                                break;
                            }
                        }
                        if (match) {
                            // Count repeats
                            let reps = 1;
                            const maxRep = Math.floor((nextRowStart - pos) / p.len);
                            while (reps < maxRep) {
                                let ok = true;
                                for (let i = 0; i < p.len; i++)
                                    if (data[pos + reps * p.len + i] !== p.indices[i]) {
                                        ok = false;
                                        break;
                                    }
                                if (!ok) break;
                                reps++;
                            }
                            const cost = tokenCost_PATUSE(st, p.id, reps, p.len);
                            const saved = literalCost(st, p.len * reps) - cost;
                            if (saved > best.score) best = { kind: "pat", score: saved, len: p.len * reps, id: p.id, reps };
                            break; // favor first (longest) match
                        }
                    }
                }
            }

            // Emit decision
            if (best.kind === "lit") {
                // extend literal run
                if (litStart < 0) litStart = pos;
                pos++;
            } else {
                // flush pending literal
                flushLiteral();
                if (best.kind === "rle") {
                    bw.writeBits(TK.RLE, 2);
                    bw.writeULEB128(best.len);
                    bw.writeBits(best.v, st.bpi);
                    // advance and update sigs
                    for (let i = 0; i < best.len; i++) pushSig(pos + i);
                    pos += best.len;
                } else if (best.kind === "cpy") {
                    bw.writeBits(TK.CPY, 2);
                    bw.writeULEB128(best.off);
                    bw.writeULEB128(best.len);
                    for (let i = 0; i < best.len; i++) pushSig(pos + i);
                    pos += best.len;
                } else if (best.kind === "pat") {
                    console.log("[TinySprites.encode] Using pattern:", best.id, "reps:", best.reps, "len:", best.len, "pattern data:", patterns.find((p) => p.id === best.id)?.indices);
                    bw.writeBits(TK.CTRL, 2);
                    bw.writeByte(CTRL.PAT_USE);
                    bw.writeByte(best.id & 0x0f);
                    bw.writeULEB128(best.reps);
                    for (let i = 0; i < best.len; i++) pushSig(pos + i);
                    pos += best.len;
                }
            }
        }

        // End of row – flush literals if any
        flushLiteral();
    }
}

/* ============================================================
 * Token cost estimation (bits) for encoder heuristics
 * ============================================================ */

function tokenCost_RLE(st, len) {
    return 2 /*class*/ + varintBits(len) + st.bpi /*index*/;
}
function tokenCost_COPY(st, off, len) {
    return 2 + varintBits(off) + varintBits(len);
}
function tokenCost_PATUSE(st, id, reps, patLen) {
    return 2 /*class*/ + 8 /*sub*/ + 8 /*id byte*/ + varintBits(reps);
}
function literalCost(st, len) {
    return 2 /*class*/ + varintBits(len) + len * st.bpi;
}
function varintBits(n) {
    // 7 bits per byte plus 1 continuation bit except last
    let v = n >>> 0,
        bytes = 1;
    while (v >= 0x80) {
        v >>>= 7;
        bytes++;
    }
    return bytes * 8;
}

/* ============================================================
 * Palette + indices from RGBA (quantization)
 * ============================================================ */

/**
 * Build palette and indices from RGBA pixels using a small median-cut quantizer.
 * @param {Uint8Array|number[]} rgba - length = w*h*4
 * @returns {{paletteRGB:Array<{r:number,g:number,b:number}>,indices:Uint8Array}}
 */
function buildPaletteAndIndicesFromRGBA(rgba, w, h, maxPalette = 16, fast = false) {
    const N = w * h;
    if (rgba.length !== N * 4) throw new Error("rgba length mismatch");
    // Collect colors, ignore alpha==0 (transparent) from palette stats
    const colors = [];
    colors.length = N;
    let uniqueMap = new Map();
    let uniqList = [];
    for (let i = 0; i < N; i++) {
        const r = rgba[i * 4] | 0,
            g = rgba[i * 4 + 1] | 0,
            b = rgba[i * 4 + 2] | 0,
            a = rgba[i * 4 + 3] | 0;
        colors[i] = { r, g, b, a };
        const key = (r << 16) | (g << 8) | b;
        if (!uniqueMap.has(key)) {
            uniqueMap.set(key, true);
            uniqList.push({ r, g, b });
        }
    }
    if (uniqList.length <= maxPalette) {
        const paletteRGB = uniqList;
        const indices = new Uint8Array(N);
        // map exact
        const idxMap = new Map();
        for (let i = 0; i < paletteRGB.length; i++) idxMap.set((paletteRGB[i].r << 16) | (paletteRGB[i].g << 8) | paletteRGB[i].b, i);
        for (let i = 0; i < N; i++) {
            const c = colors[i];
            const k = (c.r << 16) | (c.g << 8) | c.b;
            const ix = idxMap.get(k);
            indices[i] = ix ?? 0;
        }
        return { paletteRGB, indices };
    }
    // Median-cut quantization
    const boxes = [makeBox(uniqList)];
    while (boxes.length < maxPalette) {
        // pick box with largest range
        boxes.sort((a, b) => b.range - a.range);
        const box = boxes.shift();
        if (!box || box.colors.length <= 1) break;
        const ch = box.maxCh;
        box.colors.sort((c1, c2) => c1[ch] - c2[ch]);
        const mid = (box.colors.length / 2) | 0;
        const left = makeBox(box.colors.slice(0, mid));
        const right = makeBox(box.colors.slice(mid));
        boxes.push(left, right);
    }
    // Palette = average color of boxes
    const paletteRGB = boxes.map(avgColor);
    // Map every pixel to nearest palette color (Euclidean RGB)
    const indices = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
        const c = colors[i];
        let best = 0,
            bestD = 1e9;
        for (let p = 0; p < paletteRGB.length; p++) {
            const pr = paletteRGB[p].r,
                pg = paletteRGB[p].g,
                pb = paletteRGB[p].b;
            const dr = pr - c.r,
                dg = pg - c.g,
                db = pb - c.b;
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) {
                bestD = d;
                best = p;
            }
        }
        indices[i] = best;
    }
    return { paletteRGB, indices };
}

function makeBox(colors) {
    let minR = 255,
        minG = 255,
        minB = 255,
        maxR = 0,
        maxG = 0,
        maxB = 0;
    for (const c of colors) {
        if (c.r < minR) minR = c.r;
        if (c.r > maxR) maxR = c.r;
        if (c.g < minG) minG = c.g;
        if (c.g > maxG) maxG = c.g;
        if (c.b < minB) minB = c.b;
        if (c.b > maxB) maxB = c.b;
    }
    const rangeR = maxR - minR,
        rangeG = maxG - minG,
        rangeB = maxB - minB;
    let maxCh = "r",
        range = rangeR;
    if (rangeG > range) {
        maxCh = "g";
        range = rangeG;
    }
    if (rangeB > range) {
        maxCh = "b";
        range = rangeB;
    }
    return { colors: colors.slice(), minR, maxR, minG, maxG, minB, maxB, maxCh, range };
}
function avgColor(box) {
    let r = 0,
        g = 0,
        b = 0;
    for (const c of box.colors) {
        r += c.r;
        g += c.g;
        b += c.b;
    }
    const n = Math.max(1, box.colors.length);
    return { r: (r / n) | 0, g: (g / n) | 0, b: (b / n) | 0 };
}

/* ============================================================
 * String wrapper (Base64 URL-safe)
 * ============================================================ */

function toBase64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    let b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return b64;
}

/* ============================================================
 * API DOCS (Encoder)
 * ============================================================ */

/**
  API: TinySprites.encode(opts) → Uint8Array | string
  -----------------------------------------------
  Encodes one sprite into tinysprites v1 binary.
  
  Input forms:
    // Palette indices (preferred when you already have a palette)
    TinySprites.encode({
      width, height,
      indices: Uint8Array|number[],
      palette: Array<{r,g,b}>|Array<0xRRGGBB>,
      transparencyIndex: -1|number,
      colorMode: TinySprites.ColorMode.TSV8|RGB332|PAL12|RGB888,
      enablePatterns: true,
      enableRowRepeat: true,
      enableCopy: true,
      enableRLE: true,
      paletteDeltas: [{ index: 3, rgb: {r:200,g:120,b:40} }, { index: 5, rgb: 0x33AAFF }],
      returnString: false,    // true → returns Base64 URL-safe string without prefix
    })
  
    // Raw RGBA (encoder will quantize to a palette up to maxPalette entries)
    TinySprites.encode({ width, height, rgba: Uint8Array, maxPalette: 16 })
  
  Convenience:
    TinySprites.encodeToString(opts) → "ts1|{Base64-URL}"
  
  Design details:
    - Header:
        B0 = 0xF0|version
        W = ULEB128, H = ULEB128
        B1 flags = [mode:2][(bpi-1):3][hasTrans:1][tiling:1][profile:1]
        [transparencyIndex (opt)]
    - Stream:
        Tokens preceded by 2-bit class (RLE=00, LITERAL=01, COPY=10, CONTROL=11)
        CONTROL ops used:
          END (0x00)
          SOLID (0x01) – whole image single index
          ROW_REPEAT (0x06) – copy previous row
          PAL_ADDBATCH (0x30) – count (ULEB), then raw palette bytes
          PAL_PATCH (0x31) – count (ULEB), then repeated [index (ULEB) + raw color bytes] for changed entries
          PAT_DEF (0x40) – id (0..15), len (ULEB), payload (indices bit-packed)
          PAT_USE (0x41) – id, repeat (ULEB)
  
  Notes:
    - Encoder selects bits-per-index (bpi) from palette size.
    - COPY search uses a small rolling signature with 8K lookback and per-sig history.
    - Pattern discovery is a fast heuristic; gains on decorative repeats.
    - ROW_REPEAT is checked per row; great for stripes and mirrored frames.
    - Quantizer is a small median-cut; pass indices+palette to skip it.
    - paletteDeltas allows patching specific palette entries with PAL_PATCH after initial PAL_ADDBATCH.
  
  Future-proofing:
    - Header reserves tiling/anim bit.
    - CONTROL space leaves room for more ops (NEWROW, SKIP, CRC, etc.).
  
  Example usage:
    import { TinySprites } from './encoder.js';
    const bytes = TinySprites.encode({ width:12, height:12, rgba });
    const s = TinySprites.encodeToString({ width:12, height:12, rgba }); // "ts1|..."
  */
