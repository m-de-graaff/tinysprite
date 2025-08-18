/*
 * tinysprites v1 — Decoder (tiny, no deps)
 * ---------------------------------------
 * Minimal, fast, and js13k-friendly decoder for the tinysprites format
 * produced by tinysprites-encoder.js. No editor/UI logic here.
 *
 * Features:
 *  - parses header (version, WxH, flags, transparency key)
 *  - reads palette batches for TSV8, RGB332, PAL12(4:4:4), RGB888
 *  - decodes token stream: RLE, LITERAL, COPY, CONTROL(END, SOLID, ROW_REPEAT, PAL_ADDBATCH, PAT_DEF, PAT_USE)
 *  - returns indices and palette; optional RGBA expansion helper included
 *  - forward-compatible: unknown CONTROL subtypes are skipped if length-bearing (v1 uses only fixed set)
 *
 * Aim: small but clear. Min+gzip is tiny; safe to use in js13k games.
 * MIT License.
 */

export const TS = (() => {
  const CM = { TSV8: 0, RGB332: 1, PAL12: 2, RGB888: 3 };
  const TK = { RLE: 0, LIT: 1, CPY: 2, CTRL: 3 };
  const CTRL = { END: 0x00, SOLID: 0x01, NEWROW: 0x02, ROW_REPEAT: 0x06, SKIP: 0x07, PAL_ADDBATCH: 0x30, PAL_PATCH: 0x31, PAT_DEF: 0x40, PAT_USE: 0x41, PAT_DEF_DELTA: 0x42 };

  /* ---------------- Base64url helpers (for "ts1|...") ---------------- */
  function fromB64Url(s) {
      s = s
          .replace(/^[^|]*\|/, "")
          .replace(/-/g, "+")
          .replace(/_/g, "/");
      const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
      s += pad;
      if (typeof atob !== "undefined") {
          const bin = atob(s);
          const a = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
          return a;
      } else {
          return Uint8Array.from(Buffer.from(s, "base64"));
      }
  }

  /* ---------------- BitReader ---------------- */
  class BR {
      constructor(bytes) {
          this.b = bytes;
          this.i = 0;
          this.cur = 0;
          this.bits = 0;
      }
      readBits(n) {
          let v = 0,
              sh = 0;
          while (n > 0) {
              if (!this.bits) {
                  this.cur = this.b[this.i++] || 0;
                  this.bits = 8;
              }
              const t = Math.min(n, this.bits);
              v |= (this.cur & ((1 << t) - 1)) << sh;
              this.cur >>>= t;
              this.bits -= t;
              n -= t;
              sh += t;
          }
          return v >>> 0;
      }
      byte() {
          return this.readBits(8);
      }
      align() {
          this.bits = 0;
      }
      uleb() {
          let x = 0,
              s = 0,
              b;
          do {
              b = this.byte();
              x |= (b & 0x7f) << s;
              s += 7;
          } while (b & 0x80);
          return x >>> 0;
      }
  }

  /* ---------------- Palette decode ---------------- */
  function tsv8_to_rgb(c) {
      const H = (c >> 4) & 15,
          S = (c >> 2) & 3,
          V = c & 3;
      const s = S / 3,
          v = V / 3;
      if (!S) {
          const g = (v * 255 + 0.5) | 0;
          return [g, g, g];
      }
      const h = (H / 16) * 6;
      const i = Math.floor(h);
      const f = h - i;
      const p = v * (1 - s),
          q = v * (1 - s * f),
          t = v * (1 - s * (1 - f));
      function cvt(x) {
          return (x * 255 + 0.5) | 0;
      }
      let r, g, b;
      switch (i % 6) {
          case 0:
              r = v;
              g = t;
              b = p;
              break;
          case 1:
              r = q;
              g = v;
              b = p;
              break;
          case 2:
              r = p;
              g = v;
              b = t;
              break;
          case 3:
              r = p;
              g = q;
              b = v;
              break;
          case 4:
              r = t;
              g = p;
              b = v;
              break;
          default:
              r = v;
              g = p;
              b = q;
      }
      return [cvt(r), cvt(g), cvt(b)];
  }
  function decodePal(mode, raw) {
      const out = [];
      if (mode === CM.TSV8) {
          for (let i = 0; i < raw.length; i++) out.push(tsv8_to_rgb(raw[i]));
      } else if (mode === CM.RGB332) {
          for (let i = 0; i < raw.length; i++) {
              const x = raw[i];
              out.push([(((x >> 5) & 7) * 36.5) | 0, (((x >> 2) & 7) * 36.5) | 0, ((x & 3) * 85) | 0]);
          }
      } else if (mode === CM.PAL12) {
          for (let i = 0; i < raw.length; i += 2) {
              const R = raw[i] >> 4,
                  G = raw[i] & 15,
                  B = raw[i + 1] >> 4;
              out.push([R * 17, G * 17, B * 17]);
          }
      } else {
          for (let i = 0; i < raw.length; i += 3) out.push([raw[i], raw[i + 1], raw[i + 2]]);
      }
      return out;
  }

  /* ---------------- Public decode ---------------- */
  function decode(input) {
      const bytes = typeof input === "string" ? fromB64Url(input) : input instanceof Uint8Array ? input : new Uint8Array(input);
      let p = 0;
      const b0 = bytes[p++];
      if (b0 >> 4 !== 0xf) throw new Error("TS:bad magic");
      const ver = b0 & 15;
      if (ver !== 1) throw new Error("TS:version");
      // read ULEB width/height from a small, temporary reader
      const rem = bytes.subarray(p);
      const brH = new BR(rem);
      const W = brH.uleb();
      const H = brH.uleb();
      brH.align();
      const whLen = brH.i + (brH.bits ? 1 : 0);
      p += whLen;
      const flags = bytes[p++];
      const mode = (flags >> 6) & 3;
      const bpi = ((flags >> 3) & 7) + 1;
      const hasT = (flags >> 2) & 1;
      const tiling = (flags >> 1) & 1;
      const profile = flags & 1; // tiling/profile unused here
      let tKey = hasT ? bytes[p++] : -1;
      const br = new BR(bytes.subarray(p));

      // palette batch (optional)
      const palette = [];
      function readPaletteBatch() {
          const countBytes = br.uleb();
          br.align();
          const raw = new Uint8Array(countBytes);
          for (let i = 0; i < countBytes; i++) raw[i] = br.byte();
          // derive number of entries from mode
          const sz = mode === CM.RGB888 ? 3 : mode === CM.PAL12 ? 2 : 1;
          const n = Math.floor(raw.length / sz);
          const pal = decodePal(mode, raw);
          for (let i = 0; i < n; i++) palette.push(pal[i]);
      }

      // pattern defs
      const patterns = new Array(16); // small fixed table

      // output indices
      const total = W * H;
      const out = new Uint8Array(total);
      let pos = 0;

      function readIndex() {
          return br.readBits(bpi) & 255;
      }
      function writeIdx(v) {
          out[pos++] = v;
      }

      let done = false;
      while (!done && pos < total) {
          const cls = br.readBits(2);
          if (cls === TK.RLE) {
              const len = br.uleb();
              const v = readIndex();
              for (let i = 0; i < len; i++) writeIdx(v);
          } else if (cls === TK.LIT) {
              const len = br.uleb();
              for (let i = 0; i < len; i++) writeIdx(readIndex());
          } else if (cls === TK.CPY) {
              const off = br.uleb();
              const len = br.uleb();
              for (let i = 0; i < len; i++) {
                  out[pos] = out[pos - off];
                  pos++;
              }
          } else {
              // CONTROL
              const sub = br.byte();
              if (sub === CTRL.END) {
                  done = true;
              } else if (sub === CTRL.SOLID) {
                  const v = readIndex();
                  out.fill(v);
                  pos = total;
              } else if (sub === CTRL.ROW_REPEAT) {
                  // copy previous row
                  if (pos >= W) {
                      for (let i = 0; i < W; i++) {
                          out[pos + i] = out[pos - W + i];
                      }
                      pos += W;
                  } else {
                      // first row fallback: zeroes
                      for (let i = 0; i < W; i++) writeIdx(0);
                  }
              } else if (sub === CTRL.PAL_ADDBATCH) {
                  readPaletteBatch();
              } else if (sub === CTRL.PAL_PATCH) {
                  const count = br.uleb();
                  br.align(); // subsequent reads will be byte-aligned for raw color bytes
                  const nbytes = bytesPerColor(mode);
                  for (let k = 0; k < count; k++) {
                      const idx = br.uleb() >>> 0; // index to patch
                      // read raw color bytes for this mode
                      const raw = new Uint8Array(nbytes);
                      for (let i = 0; i < nbytes; i++) raw[i] = br.byte();
                      const rgb = decodeOneColor(mode, raw);
                      // ensure palette is large enough
                      while (palette.length <= idx) palette.push([0, 0, 0]);
                      palette[idx] = rgb;
                  }
              } else if (sub === CTRL.PAT_DEF) {
                  const id = br.byte() & 15;
                  const len = br.uleb();
                  const arr = new Uint8Array(len);
                  for (let i = 0; i < len; i++) arr[i] = readIndex();
                  patterns[id] = arr;
                  console.log("[TinySprites.decode] Defined pattern:", id, "len:", len, "data:", arr, "patterns array after:", patterns);
              } else if (sub === CTRL.PAT_DEF_DELTA) {
                  const newId = br.byte() & 15;
                  const baseId = br.byte() & 15;
                  const editsCount = br.uleb();
                  const base = patterns[baseId];
                  if (!base) throw new Error("TS:pat-delta base?");
                  const arr = base.slice(); // copy
                  for (let k = 0; k < editsCount; k++) {
                      const off = br.uleb() >>> 0;
                      const val = readIndex();
                      if (off >= arr.length) throw new Error("TS:pat-delta off");
                      arr[off] = val;
                  }
                  patterns[newId] = arr;
              } else if (sub === CTRL.PAT_USE) {
                  const id = br.byte() & 15;
                  const reps = br.uleb();
                  const pat = patterns[id];
                  console.log("[TinySprites.decode] Using pattern:", id, "reps:", reps, "pattern exists:", !!pat, "patterns array:", patterns, "pattern at id", id, ":", patterns[id]);
                  if (!pat) throw new Error("TS:pat?");
                  for (let r = 0; r < reps; r++) {
                      for (let i = 0; i < pat.length; i++) writeIdx(pat[i]);
                  }
              } else if (sub === CTRL.NEWROW) {
                  /* hint, ignore */
              } else if (sub === CTRL.SKIP) {
                  const n = br.uleb();
                  for (let i = 0; i < n; i++) writeIdx(tKey >= 0 ? tKey : 0);
              } else {
                  throw new Error("TS:ctrl? " + sub);
              }
          }
      }

      // assemble result
      return { version: ver, width: W, height: H, bpi, colorMode: mode, transparencyIndex: tKey, indices: out, palette };
  }

  function decodeOneColor(mode, raw) {
      if (mode === CM.TSV8) {
          return tsv8_to_rgb(raw[0]);
      } else if (mode === CM.RGB332) {
          const x = raw[0];
          return [(((x >> 5) & 7) * 36.5) | 0, (((x >> 2) & 7) * 36.5) | 0, ((x & 3) * 85) | 0];
      } else if (mode === CM.PAL12) {
          const R = raw[0] >> 4,
              G = raw[0] & 15,
              B = raw[1] >> 4;
          return [R * 17, G * 17, B * 17];
      } else {
          // RGB888
          return [raw[0] | 0, raw[1] | 0, raw[2] | 0];
      }
  }
  function bytesPerColor(mode) {
      return mode === CM.RGB888 ? 3 : mode === CM.PAL12 ? 2 : 1;
  }

  /* ---------------- RGBA expansion helper ---------------- */
  function toRGBA(decoded) {
      const { indices, palette, transparencyIndex } = decoded;
      const W = decoded.width,
          H = decoded.height;
      const out = new Uint8ClampedArray(W * H * 4);
      for (let i = 0; i < indices.length; i++) {
          const idx = indices[i];
          const o = i * 4;
          if (transparencyIndex === idx) {
              out[o] = out[o + 1] = out[o + 2] = 0;
              out[o + 3] = 0;
              continue;
          }
          const rgb = palette[idx] || [0, 0, 0];
          out[o] = rgb[0] | 0;
          out[o + 1] = rgb[1] | 0;
          out[o + 2] = rgb[2] | 0;
          out[o + 3] = 255;
      }
      return out;
  }

  return { decode, toRGBA, ColorMode: CM };
})();

/* ============================================================
* API DOCS (Decoder)
* ============================================================ */
/**
API: TS.decode(input) → { version,width,height,bpi,colorMode,transparencyIndex,indices,palette }
---------------------------------------------------------------------------------------------
- input: Uint8Array | Array<number> | string (supports "ts1|{base64url}")
- indices: Uint8Array length = width*height, palette indices
- palette: Array<[r,g,b]> decoded from PAL_ADDBATCH according to colorMode

Helper:
TS.toRGBA(decoded) → Uint8ClampedArray length = w*h*4

Token support:
RLE, LITERAL, COPY, CONTROL(END,SOLID,ROW_REPEAT,PAL_ADDBATCH,PAT_DEF,PAT_USE,NEWROW,SKIP)

Notes:
- SOLID fills entire image with single index (fast path)
- PAL_ADDBATCH payload size determines entry count per colorMode
- ROW_REPEAT copies previous row; first row falls back to zeros if used (encoder won’t emit here)
- PAT_DEF stores up to 16 small patterns; PAT_USE repeats them efficiently
- PAT_DEF_DELTA (0x42): define a new pattern from an existing one via edits (offset + new index)
- Decoder throws on unknown CONTROL without length (future versions may include length-bearing blocks)

Usage:
import { TS } from './decoder.js';
const d = TS.decode(spriteBytesOrString);
const rgba = TS.toRGBA(d);
*/
