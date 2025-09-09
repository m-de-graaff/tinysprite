import type { Palette, Run, Sprite } from './types'

// Base36 char->value LUT (0-9,a-z); everything else -1
const LUT36 = /*#__PURE__*/ (() => {
  const t = new Int16Array(128)
  for (let i = 0; i < 128; i++) t[i] = -1
  for (let i = 48; i <= 57; i++) t[i] = i - 48
  for (let i = 97; i <= 122; i++) t[i] = i - 87 // 'a'(97)->10
  return t
})()

const HEX = '0123456789abcdef'

// Read base36 unsigned int starting at i until non [0-9a-z]
const read36 = (s: string, i: number) => {
  let v = 0
  let j = i
  while (j < s.length) {
    const n = LUT36[s.charCodeAt(j)]
    if (n < 0) break
    v = v * 36 + n
    j++
  }
  return [v, j] as const
}

// Read hex nibble (lowercase 0-9a-f)
const hx = (c: number) => (c <= 57 ? c - 48 : c - 87)

// Append a run to row, merging with previous if same color
const pushRun = (row: Run[], count: number, idx: number) => {
  if (count <= 0) return
  const L = row.length
  if (L && row[L - 1].i === idx) {
    row[L - 1].c += count
  } else {
    row.push({ c: count, i: idx })
  }
}

// Parse rowruns from [i..end] and append to row; supports runs, '_' and pattern refs
const parseRowRuns = (
  s: string,
  i: number,
  end: number,
  row: Run[],
  dict: (string | undefined)[],
  depth = 0
) => {
  // Simple recursion guard
  if (depth > 16) return end
  let j = i
  while (j < end) {
    const ch = s.charCodeAt(j)
    if (ch === 44 /* , */) {
      j++
      continue
    }
    if (ch === 95 /* _ */) {
      pushRun(row, 1, -1)
      j++
      continue
    }
    // A-Z pattern ref
    if (ch >= 65 && ch <= 90) {
      const def = dict[ch - 65]
      if (def) parseRowRuns(def, 0, def.length, row, dict, depth + 1)
      j++
      continue
    }
    // run: count.color
    const [v, k] = read36(s, j)
    if (k >= end || s.charCodeAt(k) !== 46 /* . */) {
      // malformed; skip token
      j = k + 1
      continue
    }
    let idx: number
    ;[idx, j] = read36(s, k + 1)
    pushRun(row, v, idx)
  }
  return j
}

// Parse dictionary between [i..j) into array mapping A-Z -> RHS string
const parseDict = (s: string, i: number, j: number) => {
  const dict: (string | undefined)[] = new Array(26)
  let p = i
  while (p < j) {
    // skip separators
    const c = s.charCodeAt(p)
    if (c === 44 /* , */ || c <= 32) {
      p++
      continue
    }
    const keyc = c
    if (keyc < 65 || keyc > 90) break
    p++
    if (s.charCodeAt(p) !== 61 /* = */) {
      p++
      continue
    }
    p++
    // find next ',<A-Z>=' as boundary
    let q = p
    while (q < j) {
      if (s.charCodeAt(q) === 44 /* , */) {
        const n1 = q + 1
        const cc = n1 < j ? s.charCodeAt(n1) : 0
        if (cc >= 65 && cc <= 90 && n1 + 1 < j && s.charCodeAt(n1 + 1) === 61 /* = */) {
          break
        }
      }
      q++
    }
    dict[keyc - 65] = s.slice(p, q)
    p = q + 1
  }
  return dict
}

/**
 * Decode palette from hex string format
 * @param src Palette string like "p:ffcc00,000000,ffffff"
 */
export const /*#__PURE__*/ decodePalette = (src: string): Palette => {
    // Find start of colors list
    let i = 0
    const k = src.indexOf(':')
    if (k >= 0 && k < 4) i = k + 1
    const out: number[] = []
    const N = src.length
    while (i < N) {
      // read token until comma or end
      const start = i
      while (i < N && src.charCodeAt(i) !== 44 /* , */) i++
      const end = i
      // skip comma
      if (i < N && src.charCodeAt(i) === 44) i++

      const len = end - start
      if (len <= 0) continue

      let r = 0
      let g = 0
      let b = 0
      let a = 255

      if (len === 6 || len === 8) {
        const s = src
        const p = start
        r = (hx(s.charCodeAt(p)) << 4) | hx(s.charCodeAt(p + 1))
        g = (hx(s.charCodeAt(p + 2)) << 4) | hx(s.charCodeAt(p + 3))
        b = (hx(s.charCodeAt(p + 4)) << 4) | hx(s.charCodeAt(p + 5))
        if (len === 8) a = (hx(s.charCodeAt(p + 6)) << 4) | hx(s.charCodeAt(p + 7))
      } else if (len === 3 || len === 4) {
        // rgb444 or rgba444: replicate nibble
        const s = src
        const p = start
        const rn = hx(s.charCodeAt(p))
        const gn = hx(s.charCodeAt(p + 1))
        const bn = hx(s.charCodeAt(p + 2))
        r = (rn << 4) | rn
        g = (gn << 4) | gn
        b = (bn << 4) | bn
        if (len === 4) {
          const an = hx(s.charCodeAt(p + 3))
          a = (an << 4) | an
        }
      } else {
        // ignore invalid token
        continue
      }
      out.push((a << 24) | (b << 16) | (g << 8) | r)
    }
    return new Uint32Array(out)
  }

/**
 * Decode sprite from string format
 * @param src Sprite string like "s:8,8|8.0/2.0,4.1,2.0/=*3/8.2"
 * @param pal Decoded palette
 */
export const /*#__PURE__*/ decodeSprite = (src: string, pal: Palette): Sprite => {
    const sIdx = src.indexOf('s')
    if (sIdx < 0) throw new Error('sprite not found')
    // optional dictionary before sprite
    let dict: (string | undefined)[] = []
    const dIdx = src.indexOf('d:')
    if (dIdx >= 0 && dIdx < sIdx) {
      dict = parseDict(src, dIdx + 2, sIdx)
    }

    // parse modes (ignored in MVP) and header numbers
    let i = sIdx + 1
    while (src.charCodeAt(i) === 94 /* ^ */) {
      i++ // mode letter(s)
      while (i < src.length) {
        const c = src.charCodeAt(i)
        if (c === 58 /* : */) break
        i++
      }
    }
    if (src.charCodeAt(i) !== 58 /* : */) throw new Error('sprite colon missing')
    i++

    let w = 0
    let h = 0
    // optional w,h
    let j = i
    while (j < src.length && src.charCodeAt(j) !== 124 /* | */) j++
    if (j > i) {
      // parse w,h inside [i..j)
      let p = i
      ;[w, p] = read36(src, p)
      if (src.charCodeAt(p) === 44 /* , */) {
        p++
      }
      ;[h, p] = read36(src, p)
    }
    i = j + 1 // skip '|'

    const rows: Run[][] = []
    let rowIdx = 0
    // Pending repeat count from a preceding '=' row (default 1). If >0, will be flushed before next concrete row.
    let pendingEqRepeats = 0
    const N = src.length
    while (i <= N) {
      // end condition
      if (i === N) break
      if (rowIdx >= h) break
      let c = src.charCodeAt(i)
      if (c === 47 /* / */) {
        i++
        continue
      }
      // Support standalone star repeat rows: "*n" means repeat previous row n additional times
      if (c === 42 /* * */) {
        i++
        let n: number
        ;[n, i] = read36(src, i)
        if (rowIdx > 0) {
          const prev = rows[rowIdx - 1]
          while (n > 0 && rowIdx < h) {
            rows[rowIdx++] = prev
            n--
          }
        }
        // skip to next separator if current char isn't '/'
        while (i < N && src.charCodeAt(i) !== 47 /* / */ && src.charCodeAt(i) !== 0x0a) i++
        continue
      }
      if (c === 61 /* = */) {
        // '=' starts a repeat of previous row. Default 1, optional '=*n', or a following standalone '*n' row may override.
        i++
        let n = 1
        if (src.charCodeAt(i) === 42 /* * */) {
          // inline '=*n'
          i++
          ;[n, i] = read36(src, i)
        }
        // Defer emitting repeats until we either see a following '*n' row (which overrides) or before the next concrete row.
        pendingEqRepeats = n
        // skip to next separator if current char isn't '/'
        while (i < N && src.charCodeAt(i) !== 47 /* / */ && src.charCodeAt(i) !== 0x0a) i++
        continue
      }
      if (c === 42 /* * */) {
        // Standalone star row: either overrides a pending '=' repeat count, or repeats previous row additional times.
        i++
        let n: number
        ;[n, i] = read36(src, i)
        if (pendingEqRepeats > 0) {
          // Apply the '=' repeats immediately using this override count, then clear pending state.
          const prev = rows[rowIdx - 1]
          let k = n
          while (k > 0 && rowIdx < h) {
            rows[rowIdx++] = prev
            k--
          }
          pendingEqRepeats = 0
        } else {
          // apply as additional repeats now
          const prev = rows[rowIdx - 1]
          while (n > 0 && rowIdx < h) {
            rows[rowIdx++] = prev
            n--
          }
        }
        // skip to next separator if current char isn't '/'
        while (i < N && src.charCodeAt(i) !== 47 /* / */ && src.charCodeAt(i) !== 0x0a) i++
        continue
      }
      // parse rowruns until '/' or end
      const runRow: Run[] = []
      const start = i
      while (i < N) {
        c = src.charCodeAt(i)
        if (c === 47 /* / */ || c === 10 /* \n */) break
        i++
      }
      // Before placing a new concrete row, flush any pending '=' repeats
      if (pendingEqRepeats > 0 && rowIdx > 0) {
        let n = pendingEqRepeats
        const prev = rows[rowIdx - 1]
        while (n > 0 && rowIdx < h) {
          rows[rowIdx++] = prev
          n--
        }
        pendingEqRepeats = 0
      }
      parseRowRuns(src, start, i, runRow, dict)
      if (rowIdx < h) rows[rowIdx++] = runRow
      if (src.charCodeAt(i) === 47 /* / */) i++
    }

    const spr: Sprite = { w, h, rows, pal }
    return spr
  }

/**
 * Render sprite to canvas context
 * @param ctx Canvas 2D context
 * @param spr Decoded sprite
 * @param x X position
 * @param y Y position
 * @param scale Scale factor (default 1)
 */
export const /*#__PURE__*/ renderSprite = (
    ctx: CanvasRenderingContext2D,
    spr: Sprite,
    x: number,
    y: number,
    scale = 1
  ): void => {
    ctx.imageSmoothingEnabled = false
    const pal = spr.pal
    // Precompute CSS from palette (cache on sprite instance)
    let css = spr._css
    if (!css && pal) {
      css = new Array(pal.length)
      for (let i = 0; i < pal.length; i++) {
        const v = pal[i] >>> 0
        const r = v & 255
        const g = (v >>> 8) & 255
        const b = (v >>> 16) & 255
        const a = (v >>> 24) & 255
        if (a === 255) {
          css[i] =
            `#${HEX[(r >> 4) & 15]}${HEX[r & 15]}${HEX[(g >> 4) & 15]}${HEX[g & 15]}${HEX[(b >> 4) & 15]}${HEX[b & 15]}`
        } else {
          css[i] =
            `rgba(${r},${g},${b},${(a / 255).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`
        }
      }
      spr._css = css
    }

    let last = ''
    const rows = spr.rows
    for (let ry = 0; ry < rows.length; ry++) {
      const runs = rows[ry]
      let col = 0
      for (let k = 0; k < runs.length; k++) {
        const run = runs[k]
        if (run.i >= 0) {
          const color = css ? css[run.i] : '#000'
          if (color !== last) {
            ctx.fillStyle = color
            last = color
          }
          ctx.fillRect(x + col * scale, y + ry * scale, run.c * scale, scale)
        }
        col += run.c
      }
    }
  }
