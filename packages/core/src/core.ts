import type { Palette, Sprite, Run } from './types'

/**
 * Decode palette from hex string format
 * @param src Palette string like "p:ffcc00,000000,ffffff"
 */
export const /*#__PURE__*/ decodePalette = (src: string): Palette => {
  const colors = src.slice(2).split(',')
  const pal = new Uint32Array(colors.length)
  
  for (let i = 0; i < colors.length; i++) {
    const hex = colors[i]
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) : 255
    pal[i] = (a << 24) | (b << 16) | (g << 8) | r
  }
  
  return pal
}

/**
 * Decode sprite from string format
 * @param src Sprite string like "s:8,8|8.0/2.0,4.1,2.0/=*3/8.2"
 * @param pal Decoded palette
 */
export const /*#__PURE__*/ decodeSprite = (src: string, pal: Palette): Sprite => {
  const [header, data] = src.split('|')
  const [w, h] = header.slice(2).split(',').map(x => parseInt(x, 10))
  const rowStrs = data.split('/')
  const rows: Run[][] = []
  
  for (let i = 0; i < rowStrs.length; i++) {
    const rowStr = rowStrs[i]
    
    if (rowStr === '=') {
      // Copy previous row
      rows[i] = rows[i - 1]
    } else if (rowStr.startsWith('=*')) {
      // Repeat previous row group
      const count = parseInt(rowStr.slice(2), 36)
      for (let j = 0; j < count; j++) {
        rows[i + j] = rows[i - 1]
      }
      i += count - 1
    } else {
      // Parse run-length encoded row
      const runs: Run[] = []
      const runStrs = rowStr.split(',')
      
      for (const runStr of runStrs) {
        if (runStr === '_') {
          // Transparent row - skip
          continue
        }
        const [countStr, indexStr] = runStr.split('.')
        runs.push({
          c: parseInt(countStr, 36),
          i: parseInt(indexStr, 36)
        })
      }
      
      rows[i] = runs
    }
  }
  
  return { w, h, rows }
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
  let lastColor = ''
  
  for (let row = 0; row < spr.rows.length; row++) {
    const runs = spr.rows[row]
    let col = 0
    
    for (const run of runs) {
      const rgba = run.i
      const color = `#${rgba.toString(16).padStart(8, '0').slice(2, 8)}`
      
      if (color !== lastColor) {
        ctx.fillStyle = color
        lastColor = color
      }
      
      ctx.fillRect(
        x + col * scale,
        y + row * scale,
        run.c * scale,
        scale
      )
      
      col += run.c
    }
  }
}