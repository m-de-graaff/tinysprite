export interface TinySpriteFrame {
	width: number;
	height: number;
	indices: Uint8Array; // palette indices, 0 is transparent
}

// Module-local state to support renderSprite(ctx,x,y,scale) without passing sprite/palette each time
let currentSprite: TinySpriteFrame | null = null;
let currentPaletteCss: string[] = [];

// --- Utilities (no regex) ---
function isWhitespace(code: number): boolean {
	return code === 32 || code === 9; // space or tab
}

function skipWs(s: string, i: number): number {
	while (i < s.length && isWhitespace(s.charCodeAt(i))) i++;
	return i;
}

function readToken(s: string, i: number, seps: number[]): { value: string; next: number; sep: number | null } {
	// Reads until any separator; returns the separator encountered (or null)
	const start = i;
	let sep: number | null = null;
	while (i < s.length) {
		const c = s.charCodeAt(i);
		let isSep = false;
		for (let k = 0; k < seps.length; k++) {
			if (c === seps[k]) {
				isSep = true;
				sep = c;
				break;
			}
		}
		if (isSep) break;
		i++;
	}
	return { value: s.slice(start, i), next: i, sep };
}

function parseBase36(token: string): number {
	// Later we can hand-roll; for now use parseInt as allowed.
	return parseInt(token, 36);
}

function hexNibble(c: number): number {
	// 0-9 a-f
	if (c >= 48 && c <= 57) return c - 48;
	if (c >= 97 && c <= 102) return c - 87;
	if (c >= 65 && c <= 70) return c - 55;
	return 0;
}

function parseHexColor(token: string): { r: number; g: number; b: number; a: number } {
	const t = token.trim();
	const n = t.length;
	if (n === 3 || n === 4) {
		// RGB or RGBA 4-bit each
		let r = hexNibble(t.charCodeAt(0));
		let g = hexNibble(t.charCodeAt(1));
		let b = hexNibble(t.charCodeAt(2));
		let a = n === 4 ? hexNibble(t.charCodeAt(3)) : 0xf;
		// expand 4-bit to 8-bit by duplication
		r = (r << 4) | r;
		g = (g << 4) | g;
		b = (b << 4) | b;
		a = (a << 4) | a;
		return { r, g, b, a };
	}
	if (n === 6 || n === 8) {
		const r = (hexNibble(t.charCodeAt(0)) << 4) | hexNibble(t.charCodeAt(1));
		const g = (hexNibble(t.charCodeAt(2)) << 4) | hexNibble(t.charCodeAt(3));
		const b = (hexNibble(t.charCodeAt(4)) << 4) | hexNibble(t.charCodeAt(5));
		const a = n === 8 ? (hexNibble(t.charCodeAt(6)) << 4) | hexNibble(t.charCodeAt(7)) : 255;
		return { r, g, b, a };
	}
	// Fallback: black
	return { r: 0, g: 0, b: 0, a: 255 };
}

function toCss({ r, g, b, a }: { r: number; g: number; b: number; a: number }): string {
	if (a === 255) {
		// hex 6
		const h = (v: number) => v.toString(16).padStart(2, '0');
		return `#${h(r)}${h(g)}${h(b)}`;
	}
	const alpha = Math.round((a / 255) * 1000) / 1000;
	return `rgba(${r},${g},${b},${alpha})`;
}

// --- Public API ---
export function decodePalette(line: string): string[] {
	// Expects: P: color[, color]*
	let i = 0;
	const s = line;
	i = skipWs(s, i);
	// skip leading 'P:' if present
	if (i < s.length && (s[i] === 'P' || s[i] === 'p')) {
		i++;
		i = skipWs(s, i);
		if (i < s.length && s[i] === ':') i++;
	}
	i = skipWs(s, i);
	const css: string[] = [];
	while (i < s.length) {
		// read token until comma or EOL
		const { value, next, sep } = readToken(s, i, [44 /* , */]);
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			const col = parseHexColor(trimmed);
			css.push(toCss(col));
		}
		i = next;
		if (sep === 44) i++; // skip comma
		i = skipWs(s, i);
	}
	currentPaletteCss = css;
	return css;
}

export function decodeSprite(line: string): TinySpriteFrame {
	// Grammar: s:w,h|rows ; rows separated by '/'; row can be '=' or '=*n' or runs separated by ','; run is '_' or count.index
	const s = line;
	let i = 0;
	i = skipWs(s, i);
	if (i < s.length && (s[i] === 's' || s[i] === 'S')) {
		i++;
		i = skipWs(s, i);
		if (i < s.length && s[i] === ':') i++;
	}
	i = skipWs(s, i);
	// width
	let token = readToken(s, i, [44 /* , */, 124 /* | */]);
	const w = parseBase36(token.value.trim());
	if (token.sep !== 44) throw new Error('sprite header missing comma after width');
	i = token.next + 1; // skip comma
	// height
	token = readToken(s, i, [124 /* | */]);
	const h = parseBase36(token.value.trim());
	if (token.sep !== 124) throw new Error('sprite header missing | after height');
	i = token.next + 1; // skip '|'
	const indices = new Uint8Array(w * h);
	let row = 0;
	let prevRowStart = -1;
	let x = 0;
	const copyPrev = (destRow: number) => {
		if (prevRowStart < 0) throw new Error('no previous row to repeat');
		const dst = destRow * w;
		for (let c = 0; c < w; c++) indices[dst + c] = indices[prevRowStart + c];
	};
	while (i <= s.length && row < h) {
		i = skipWs(s, i);
		// read row token until '/' or EOL
		const r = readToken(s, i, [47 /* / */]);
		const rt = r.value.trim();
		i = r.next;
		// process row token
		if (rt.length === 0) {
			// empty row interpreted as transparent
			for (let c = 0; c < w; c++) indices[row * w + c] = 0;
			prevRowStart = row * w;
			row++;
		} else if (rt === '=') {
			copyPrev(row);
			row++;
		} else if (rt[0] === '=' && rt.length > 1 && rt[1] === '*') {
			const n = parseBase36(rt.slice(2));
			for (let k = 0; k < n && row < h; k++) {
				copyPrev(row);
				row++;
			}
		} else {
			// regular row: runs separated by ','
			x = 0;
			let j = 0;
			while (j < rt.length) {
				// read run token until ','
				let k = j;
				while (k < rt.length && rt.charCodeAt(k) !== 44 /* , */) k++;
				const runTok = rt.slice(j, k).trim();
				if (runTok.length > 0) {
					if (runTok === '_') {
						// one transparent pixel
						if (x >= w) throw new Error('run exceeds row width');
						indices[row * w + x] = 0;
						x++;
					} else {
						// count.index
						const dotPos = (() => {
							for (let q = 0; q < runTok.length; q++) if (runTok.charCodeAt(q) === 46 /* . */) return q;
							return -1;
						})();
						if (dotPos < 0) throw new Error('invalid run token');
						const count = parseBase36(runTok.slice(0, dotPos));
						const index = parseBase36(runTok.slice(dotPos + 1));
						if (count <= 0) continue;
						const base = row * w;
						for (let c = 0; c < count; c++) {
							if (x >= w) throw new Error('run exceeds row width');
							indices[base + x] = index & 0xff;
							x++;
						}
					}
				}
				j = k + 1; // skip comma
			}
			if (x !== w) throw new Error('row width mismatch');
			prevRowStart = row * w;
			row++;
		}
		// skip row separator '/'
		if (i < s.length && s.charCodeAt(i) === 47) i++;
	}
	if (row !== h) throw new Error('sprite height mismatch');
	const frame: TinySpriteFrame = { width: w, height: h, indices };
	currentSprite = frame;
	return frame;
}

export function renderSprite(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void;
export function renderSprite(
	ctx: CanvasRenderingContext2D,
	spriteOrX: TinySpriteFrame | number,
	paletteOrY?: string[] | number,
	xOrScale?: number,
	y?: number,
	scale?: number
): void;
export function renderSprite(
	ctx: CanvasRenderingContext2D,
	spriteOrX: TinySpriteFrame | number,
	paletteOrY?: string[] | number,
	xOrScale?: number,
	y?: number,
	scale: number = 1
): void {
	let sprite: TinySpriteFrame | null = null;
	let paletteCss: string[] | null = null;
	let x: number;
	let yCoord: number;
	let scl: number;
	if (typeof spriteOrX === 'number') {
		// renderSprite(ctx, x, y, scale?) using module state
		if (!currentSprite || currentPaletteCss.length === 0) throw new Error('no decoded sprite/palette');
		sprite = currentSprite;
		paletteCss = currentPaletteCss;
		x = spriteOrX;
		yCoord = (paletteOrY as number) ?? 0;
		scl = (xOrScale as number) ?? 1;
	} else {
		// renderSprite(ctx, sprite, paletteCss, x, y, scale?)
		sprite = spriteOrX as TinySpriteFrame;
		paletteCss = (paletteOrY as string[]) ?? currentPaletteCss;
		x = (xOrScale as number) ?? 0;
		yCoord = y ?? 0;
		scl = scale;
	}
	if (!sprite || !paletteCss) throw new Error('missing sprite or palette');
	if (scl < 1 || (scl | 0) !== scl) throw new Error('scale must be an integer >= 1');
	const { width: w, height: h, indices } = sprite;
	let lastIndex = -1;
	let lastStyle = '';
	for (let r = 0; r < h; r++) {
		const base = r * w;
		let c = 0;
		while (c < w) {
			const idx = indices[base + c];
			if (idx === 0) {
				// transparent fast-skip: coalesce transparent run
				c++;
				continue;
			}
			// coalesce same-color run
			let run = 1;
			while (c + run < w && indices[base + c + run] === idx) run++;
			if (idx !== lastIndex) {
				lastIndex = idx;
				const style = paletteCss[idx] || '#000000';
				if (style !== lastStyle) {
					ctx.fillStyle = style;
					lastStyle = style;
				}
			}
			if (scl === 1) {
				ctx.fillRect(x + c, yCoord + r, run, 1);
			} else {
				ctx.fillRect(x + c * scl, yCoord + r * scl, run * scl, scl);
			}
			c += run;
		}
	}
}

// Back-compat for earlier placeholder name
export function decodeTinySprite(_bytes: Uint8Array): TinySpriteFrame[] {
	return [];
}
