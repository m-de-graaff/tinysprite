import { decodePalette, decodeSprite, renderSprite, type TinySpriteFrame } from '../src/index.js';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

type MockCtx = {
	fillStyle: string;
	rects: { x: number; y: number; w: number; h: number; style: string }[];
	fillRect: (x: number, y: number, w: number, h: number) => void;
};

function makeMockCtx(): MockCtx {
	const ctx: MockCtx = {
		fillStyle: '',
		rects: [],
		fillRect(x, y, w, h) {
			this.rects.push({ x, y, w, h, style: this.fillStyle });
		},
	};
	return ctx;
}

const here = fileURLToPath(import.meta.url);
const testDir = dirname(here);
const repoRoot = resolve(testDir, '../../..');

function readFixture(name: string): string {
	return readFileSync(join(repoRoot, 'fixtures', name), 'utf8').trim();
}

describe('decodePalette', () => {
	it('parses hex colors to CSS strings', () => {
		const css = decodePalette('P: 000000, ffffff, ffcc00, 0f08');
		expect(css[0]).toBe('#000000');
		expect(css[1]).toBe('#ffffff');
		expect(css[2]).toBe('#ffcc00');
		// 0f08 -> 0f0 with alpha 8 -> rgba expanded
		expect(css[3]).toMatch(/^rgba\(/);
	});
});

describe('decodeSprite', () => {
	it('decodes simple 8x2 sprite', () => {
		const text = readFixture('sprite-basic.txt').split('\n');
		const pal = decodePalette(text[0]);
		const sprite = decodeSprite(text[1]);
		expect(sprite.width).toBe(8);
		expect(sprite.height).toBe(2);
		// row 0 transparent, row 1 all index 1
		for (let c = 0; c < 8; c++) expect(sprite.indices[c]).toBe(0);
		for (let c = 0; c < 8; c++) expect(sprite.indices[8 + c]).toBe(1);
		// render and verify one rect drawn for second row only
		const ctx = makeMockCtx();
		renderSprite(ctx as unknown as CanvasRenderingContext2D, sprite as TinySpriteFrame, pal, 0, 0, 1);
		expect(ctx.rects.length).toBe(1);
		expect(ctx.rects[0]).toEqual({ x: 0, y: 1, w: 8, h: 1, style: pal[1] });
	});

	it('supports row repetition = and =*n', () => {
		const text = readFixture('sprite-repeat.txt').split('\n');
		const pal = decodePalette(text[0]);
		const sprite = decodeSprite(text[1]);
		expect(sprite.width).toBe(4);
		expect(sprite.height).toBe(4);
		// all zero because 4.0 repeated 4 rows
		for (let i = 0; i < 16; i++) expect(sprite.indices[i]).toBe(0);
		const ctx = makeMockCtx();
		renderSprite(ctx as unknown as CanvasRenderingContext2D, sprite as TinySpriteFrame, pal, 2, 3, 2);
		// transparent only -> no rects
		expect(ctx.rects.length).toBe(0);
	});
});
