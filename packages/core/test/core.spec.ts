import { describe, expect, it } from 'vitest'
import { decodePalette, decodeSprite } from '../src/core'

describe('Core decoder', () => {
  it('decodes rrggbb and rgb444 palettes', () => {
    const pal = decodePalette('K:000000,ff0040,fff,abcd')
    expect(pal.length).toBe(4)
    // 0xFF000000 little-endian ABGR packs as a<<24|b<<16|g<<8|r
    expect(pal[0] >>> 0).toBe(((255 << 24) | (0 << 16) | (0 << 8) | 0) >>> 0)
    // ff0040 -> r=255 g=0 b=64
    expect(pal[1] >>> 0).toBe(((255 << 24) | (64 << 16) | (0 << 8) | 255) >>> 0)
    // rgb444 'fff' -> 0xFFffffff
    expect(pal[2] >>> 0).toBe(((255 << 24) | (255 << 16) | (255 << 8) | 255) >>> 0)
    // rgba444 'abcd' -> r=0xaa g=0xbb b=0xcc a=0xdd
    expect(pal[3] >>> 0).toBe(((0xdd << 24) | (0xcc << 16) | (0xbb << 8) | 0xaa) >>> 0)
  })

  it('decodes a simple sprite with repeats and dict', () => {
    const pal = decodePalette('K:000000,ffffff')
    // support both = and standalone * repeats
    const s = 'd:A=3.1,_ s:4,3|A/=/*1/4.0'
    const spr = decodeSprite(s, pal)
    // debug rows
    // eslint-disable-next-line no-console
    console.log(
      'rows:',
      spr.rows.map((r) => r.map((x) => `${x.c}.${x.i}`).join(','))
    )
    expect(spr.w).toBe(4)
    expect(spr.h).toBe(3)
    expect(spr.rows.length).toBe(3)
    // First row expands to 3 white + 1 transparent
    expect(spr.rows[0].reduce((n, r) => n + r.c, 0)).toBe(4)
    // Second row is '=' copy of first
    expect(spr.rows[1]).toBe(spr.rows[0])
    // Third row is 4 zeros
    expect(spr.rows[2][0].i).toBe(0)
    expect(spr.rows[2][0].c).toBe(4)
  })
})
