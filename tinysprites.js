/*!
 * TinySprites v2.2.0 — tiny runtime (no editor)
 * MIT License
 *
 * Packed format:
 *   Format: "{dims}|{cnt}{hex...}{order?}{data128}" where pixel data is
 *            palette indices packed 2-per-byte, XOR diffed, RLE0, then base128
 *
 * API:
 *   create, makePalette, decodePacked,
 *   toImageData, toCanvas, draw,
 *   fromImage, loadImage
 */

(function () {
  const p36 = (s) => parseInt(s, 36);

  const hexToRgba = (hex) => {
      const v = parseInt(hex.replace("#", ""), 16);
      return [((v >> 8) & 15) * 17, ((v >> 4) & 15) * 17, (v & 15) * 17, 255];
  };

  function makePalette(hexTokens) {
      const pal = [[0, 0, 0, 0]];
      if (!hexTokens) hexTokens = [];
      for (let i = 0; i < hexTokens.length && pal.length < 27; i++) pal.push(hexToRgba(hexTokens[i]));
      return pal;
  }

  function create(w, h, fillIndex, paletteHex) {
      w |= 0;
      h |= 0;
      if (fillIndex == null) fillIndex = 0;
      if (!paletteHex) paletteHex = [];
      const data = new Uint8Array(w * h);
      if (fillIndex) data.fill(fillIndex);
      return { w, h, data, palette: makePalette(paletteHex) };
  }

  function fromImageData(img) {
      const { width: w, height: h, data } = img;
      const pal = [[0, 0, 0, 0]];
      const map = { "0,0,0,0": 0 };
      const out = new Uint8Array(w * h);
      let p = 0;
      for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a === 0) {
              out[p++] = 0;
              continue;
          }
          const key = data[i] + "," + data[i + 1] + "," + data[i + 2] + "," + a;
          let idx = map[key];
          if (idx == null) {
              idx = pal.length;
              if (idx > 26) idx = 0;
              map[key] = idx;
              pal.push([data[i], data[i + 1], data[i + 2], a]);
          }
          out[p++] = idx;
      }
      return { w, h, data: out, palette: pal };
  }

  function fromImage(src) {
      if (src.data) return fromImageData(src);
      const w = src.naturalWidth || src.width,
          h = src.naturalHeight || src.height;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(src, 0, 0);
      return fromImageData(ctx.getImageData(0, 0, w, h));
  }

  function loadImage(url) {
      return new Promise((res, rej) => {
          const i = new Image();
          i.crossOrigin = "anonymous";
          i.onload = () => res(fromImage(i));
          i.onerror = rej;
          i.src = url;
      });
  }

  function b128decode(str) {
      const out = [];
      let acc = 0,
          bits = 0;
      for (let i = 0; i < str.length; i++) {
          acc = (acc << 7) | str.charCodeAt(i);
          bits += 7;
          while (bits >= 8) {
              bits -= 8;
              out.push((acc >> bits) & 255);
          }
      }
      return Uint8Array.from(out);
  }

  function decodePacked(str) {
      const parts = String(str).split("|");
      const dimStr = parts[0] || "";
      let w = TinySprites.defaultW | 0,
          h = TinySprites.defaultH | 0;
      if (dimStr) {
          if (dimStr.includes("x")) {
              const [ws, hs] = dimStr.split("x");
              if (ws) w = p36(ws) | 0;
              if (hs) h = p36(hs) | 0;
          } else {
              w = h = p36(dimStr) | 0;
          }
      }
      const payload = parts[1] || "";
      if (!payload) return { w, h, data: new Uint8Array(w * h), palette: [[0, 0, 0, 0]] };
      let pos = 0;
      const count = parseInt(payload[pos++], 36) | 0;
      const palette = [[0, 0, 0, 0]];
      for (let i = 0; i < count; i++) {
          const hex = payload.slice(pos, pos + 3);
          pos += 3;
          palette.push(hexToRgba(hex));
      }
      let order = "";
      if (payload[pos] === "Z") {
          order = "Z";
          pos++;
      }
      const data128 = payload.slice(pos);
      const totalBytes = (w * h + 1) >> 1;
      const comp = b128decode(data128);
      const xor = [];
      for (let i = 0; i < comp.length; i++) {
          const b = comp[i];
          if (b === 0 && i + 1 < comp.length) {
              const c = comp[++i];
              for (let k = 0; k < c; k++) xor.push(0);
          } else xor.push(b);
      }
      const packed = new Uint8Array(totalBytes);
      let prev = 0;
      for (let i = 0; i < totalBytes; i++) {
          const val = (xor[i] ^ prev) & 255;
          packed[i] = val;
          prev = val;
      }
      const data = new Uint8Array(w * h);
      let di = 0;
      for (let i = 0; i < packed.length; i++) {
          const byte = packed[i];
          data[di++] = byte >> 4;
          if (di < w * h) data[di++] = byte & 15;
      }
      if (order === "Z") {
          const m = zigzagMap(w, h);
          const out = new Uint8Array(data.length);
          for (let j = 0; j < m.length; j++) out[m[j]] = data[j];
          return { w, h, data: out, palette };
      }
      return { w, h, data, palette };
  }

  function toImageData(sprite) {
      const { w, h, data, palette } = sprite,
          img = new ImageData(w, h);
      let p = 0;
      for (const idx of data) {
          const c = palette[idx] || [0, 0, 0, 0];
          img.data[p++] = c[0];
          img.data[p++] = c[1];
          img.data[p++] = c[2];
          img.data[p++] = c[3];
      }
      return img;
  }

  function toCanvas(sprite, scale = 1) {
      const { w, h } = sprite,
          cw = Math.max(1, Math.round(w * scale)),
          ch = Math.max(1, Math.round(h * scale));
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext("2d", { alpha: true });
      ctx.imageSmoothingEnabled = false;
      const raw = document.createElement("canvas");
      raw.width = w;
      raw.height = h;
      raw.getContext("2d").putImageData(toImageData(sprite), 0, 0);
      ctx.drawImage(raw, 0, 0, cw, ch);
      return c;
  }

  function draw(ctx, sprite, x = 0, y = 0, opts = {}) {
      const { w, h } = sprite;
      let z = 1;
      if (opts.fit?.w && opts.fit?.h) z = Math.min(opts.fit.w / w, opts.fit.h / h);
      else if (opts.scale) z = opts.scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(toCanvas(sprite, z), x | 0, y | 0);
  }

  const zigzagMap = (w, h) => {
      const m = new Uint32Array(w * h);
      let i = 0;
      for (let y = 0; y < h; y++) {
          if (y % 2 === 0) {
              for (let x = 0; x < w; x++) m[i++] = y * w + x;
          } else {
              for (let x = w - 1; x >= 0; x--) m[i++] = y * w + x;
          }
      }
      return m;
  };

  const TinySprites = { defaultW: 16, defaultH: 16, create, makePalette, decodePacked, toImageData, toCanvas, draw, fromImage, loadImage };
  if (typeof window !== "undefined") window.TinySprites = TinySprites;
  if (typeof module !== "undefined" && module.exports) module.exports = TinySprites;
})();
