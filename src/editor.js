
import { TinySprites } from "./encoder.js";
import { TS } from "./decoder.js";

/* -------------------------------------------------------
    * State
    * -----------------------------------------------------*/
const W = document.getElementById("w");
const H = document.getElementById("h");
const CV = document.getElementById("view");
const CTX = CV.getContext("2d", { alpha: true, willReadFrequently: true });
const Z = document.getElementById("zoom");
const ZV = document.getElementById("zoomVal");
const GRID = document.getElementById("chkGrid");
const PALETTE = document.getElementById("palette");
const STATS = document.getElementById("stats");
const TRANS = document.getElementById("transIdx");
const SELBOX = document.getElementById("selBox");
const GRIDWRAP = document.getElementById("gridWrap");
const FILEBADGE = document.getElementById("fileBadge");
const SIZEBADGE = document.getElementById("sizeBadge");
const PREVIEW = document.getElementById("preview");
const PCTX = PREVIEW.getContext("2d", { alpha: true, willReadFrequently: true });
const MAIN = document.getElementById("main");
const TILESET = document.getElementById("tileset");
const TCTX = TILESET.getContext("2d", { alpha: true, willReadFrequently: true });
const TILECOLS = document.getElementById("tileCols");

TRANS.onchange = () => project && (project.transparencyIndex = Number(TRANS.value) | 0);

// Optimizer UI
const OPT = {
    autoMode: document.getElementById("optAutoMode"),
    rle: document.getElementById("optRLE"),
    cpy: document.getElementById("optCOPY"),
    row: document.getElementById("optROW"),
    pat: document.getElementById("optPAT"),
    fast: document.getElementById("optFAST"),
    patMin: document.getElementById("optPatMin"),
    patMax: document.getElementById("optPatMax"),
    patCount: document.getElementById("optPatCount"),
    merge: document.getElementById("optMerge"),
    mergeVal: document.getElementById("optMergeVal"),
    maxPal: document.getElementById("optMaxPal"),
};

const DOC_TABS = document.getElementById("docTabs");
const projects = [];
let project = null;
let untitledCounter = 1;
function nextUntitled() {
    let name;
    do {
        name = `untitled${untitledCounter++}.tspr`;
    } while (projects.some((p) => p.name === name));
    return name;
}

// Project helpers
function createProject(name = nextUntitled()) {
    const w = 12,
        h = 12,
        transparencyIndex = 0;
    const p = {
        name,
        w,
        h,
        frames: [
            {
                name: "Frame 1",
                duration: 100,
                layers: [
                    {
                        name: "Layer 1",
                        visible: true,
                        indices: new Uint8Array(w * h).fill(transparencyIndex),
                    },
                ],
            },
        ],
        frame: 0,
        layer: 0,
        palette: [
            [0, 0, 0],
            [255, 255, 255],
            [255, 0, 0],
            [0, 255, 0],
            [0, 0, 255],
        ],
        active: 2,
        tool: "pen",
        zoom: 20,
        brushSize: 1,
        brushShape: "square",
        selection: null, // {x,y,w,h}
        preferredColorMode: "auto",
        lastExport: null, // {type, bytes|string, params}
        history: { undo: [], redo: [] },
        transparencyIndex,
        dirty: true,
        fileHandle: null,
        tilesetCols: 4,
    };
    Object.defineProperty(p, "layers", {
        get() {
            return p.frames[p.frame].layers;
        },
        set(v) {
            p.frames[p.frame].layers = v;
        },
    });
    return p;
}

function selectProject(p) {
    // save transparency index of current project
    if (project) project.transparencyIndex = Number(TRANS.value) | 0;
    stopAnimation();
    project = p;
    if (!project) {
        MAIN.style.display = "none";
        FILEBADGE.textContent = "";
        SIZEBADGE.textContent = "–";
        framesList.innerHTML = "";
        drawTileset();
        refreshTabs();
        return;
    }
    MAIN.style.display = "";
    W.value = project.w;
    H.value = project.h;
    resizeCanvas();
    Z.value = project.zoom;
    ZV.textContent = project.zoom;
    brushSizeEl.value = project.brushSize;
    brushShapeEl.value = project.brushShape;
    toolsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.tool === project.tool));
    TRANS.value = String(project.transparencyIndex);
    TILECOLS.value = project.tilesetCols;
    renderPalette();
    renderFrames();
    renderLayers();
    draw();
    setBadge();
    refreshHistoryBadge();
}

function closeProject(p) {
    const idx = projects.indexOf(p);
    if (idx === -1) return;
    projects.splice(idx, 1);
    if (project === p) {
        const next = projects[idx] || projects[idx - 1] || null;
        selectProject(next);
    }
    refreshTabs();
}

DOC_TABS.addEventListener("click", (e) => {
    const tab = e.target.closest(".doc-tab");
    if (!tab) return;
    const idx = Number(tab.dataset.idx);
    const p = projects[idx];
    if (e.target.classList.contains("close")) {
        closeProject(p);
    } else {
        selectProject(p);
    }
});

/* -------------------------------------------------------
    * Utilities
    * -----------------------------------------------------*/
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function iyx(x, y) {
    return y * project.w + x;
}
function within(x, y) {
    return x >= 0 && y >= 0 && x < project.w && y < project.h;
}
function cloneIndices(arr) {
    const u = new Uint8Array(arr.length);
    u.set(arr);
    return u;
}
function rgbToHex([r, g, b]) {
    return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function refreshTabs() {
    DOC_TABS.innerHTML = "";
    projects.forEach((p, i) => {
        const tab = document.createElement("div");
        tab.className = "doc-tab" + (p === project ? " active" : "");
        tab.textContent = p.name + (p.dirty ? " *" : "");
        tab.dataset.idx = String(i);
        const close = document.createElement("span");
        close.className = "close";
        close.textContent = "\u2715";
        tab.appendChild(close);
        DOC_TABS.appendChild(tab);
    });
}
function setBadge() {
    FILEBADGE.textContent = project ? project.name + (project.dirty ? "*" : "") : "";
    refreshTabs();
}

function pushHistory(label) {
    const frame = project.frame,
        layer = project.layer;
    const entry = {
        label,
        frame,
        layer,
        indices: cloneIndices(project.layers[layer].indices),
    };
    project.history.undo.push(entry);
    project.history.redo.length = 0;
    project.dirty = true;
    setBadge();
    refreshHistoryBadge();
}
function refreshHistoryBadge() {
    if (!project) return;
    SIZEBADGE.textContent = `frames:${project.frames.length} • layers:${project.layers.length} • ${project.w}×${project.h}`;
}

/* -------------------------------------------------------
    * Rendering
    * -----------------------------------------------------*/
function resizeCanvas() {
    const px = project.zoom;
    CV.width = project.w * px;
    CV.height = project.h * px;
    
    // Auto-scale preview to fit available space while maintaining aspect ratio
    const maxWidth = 400;
    const maxHeight = 300;
    const scale = Math.min(maxWidth / project.w, maxHeight / project.h);
    PREVIEW.width = project.w * scale;
    PREVIEW.height = project.h * scale;
    
    draw();
}
function draw() {
    const px = project.zoom;
    CTX.imageSmoothingEnabled = false;
    // checkerboard
    CTX.save();
    for (let y = 0; y < CV.height; y += 12) {
        for (let x = 0; x < CV.width; x += 12) {
            CTX.fillStyle = ((x + y) / 12) % 2 ? "#101216" : "#0c0d10";
            CTX.fillRect(x, y, 12, 12);
        }
    }
    // pixels from all visible layers
    for (let l = 0; l < project.layers.length; l++) {
        const layer = project.layers[l];
        if (!layer.visible) continue;
        const data = layer.indices;
        for (let y = 0; y < project.h; y++) {
            for (let x = 0; x < project.w; x++) {
                const idx = data[iyx(x, y)];
                if ((Number(TRANS.value) | 0) === idx) continue;
                const c = project.palette[idx] || [0, 0, 0];
                CTX.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
                CTX.fillRect(x * px, y * px, px, px);
            }
        }
    }
    if (GRID.checked) {
        CTX.strokeStyle = "rgba(255,255,255,0.08)";
        CTX.lineWidth = 1;
        for (let x = 0; x <= project.w; x++) {
            CTX.beginPath();
            CTX.moveTo(x * px + 0.5, 0);
            CTX.lineTo(x * px + 0.5, project.h * px);
            CTX.stroke();
        }
        for (let y = 0; y <= project.h; y++) {
            CTX.beginPath();
            CTX.moveTo(0, y * px + 0.5);
            CTX.lineTo(project.w * px, y * px + 0.5);
            CTX.stroke();
        }
    }
    CTX.restore();
    drawSelectionBox();
    drawPreview();
    drawTileset();
}
function drawSelectionBox() {
    const sel = project.selection;
    const px = project.zoom;
    if (!sel) {
        SELBOX.style.display = "none";
        return;
    }
    SELBOX.style.display = "block";
    SELBOX.style.left = sel.x * px + CV.offsetLeft + "px";
    SELBOX.style.top = sel.y * px + CV.offsetTop + "px";
    SELBOX.style.width = sel.w * px + "px";
    SELBOX.style.height = sel.h * px + "px";
}

function drawPreview() {
    const scale = Math.floor(Math.min(PREVIEW.width / project.w, PREVIEW.height / project.h));
    PCTX.clearRect(0, 0, PREVIEW.width, PREVIEW.height);
    PCTX.imageSmoothingEnabled = false;
    for (let l = 0; l < project.layers.length; l++) {
        const layer = project.layers[l];
        if (!layer.visible) continue;
        const data = layer.indices;
        for (let y = 0; y < project.h; y++) {
            for (let x = 0; x < project.w; x++) {
                const idx = data[iyx(x, y)];
                if ((Number(TRANS.value) | 0) === idx) continue;
                const c = project.palette[idx] || [0, 0, 0];
                PCTX.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
                PCTX.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    }
}

function drawTileset() {
    if (!project) {
        TCTX.clearRect(0, 0, TILESET.width, TILESET.height);
        return;
    }
    const cols = Math.max(1, Number(TILECOLS.value) | 0);
    TILECOLS.value = String(cols);
    project.tilesetCols = cols;
    const frames = project.frames;
    const rows = Math.ceil(frames.length / cols);
    const tmp = document.createElement("canvas");
    tmp.width = project.w * cols;
    tmp.height = project.h * rows;
    const cx = tmp.getContext("2d");
    for (let i = 0; i < frames.length; i++) {
        const x = (i % cols) * project.w;
        const y = Math.floor(i / cols) * project.h;
        const merged = mergeVisibleLayers(frames[i].layers);
        drawLayerTo(cx, merged, x, y);
    }
    const scale = Math.min(TILESET.width / tmp.width, TILESET.height / tmp.height);
    TCTX.clearRect(0, 0, TILESET.width, TILESET.height);
    TCTX.imageSmoothingEnabled = false;
    TCTX.drawImage(tmp, 0, 0, tmp.width, tmp.height, 0, 0, tmp.width * scale, tmp.height * scale);
}



function renderPalette() {
    PALETTE.innerHTML = "";
    project.palette.forEach((rgb, i) => {
        const sw = document.createElement("div");
        sw.className = "sw";
        sw.style.background = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        sw.dataset.active = i === project.active ? "1" : "0";
        sw.dataset.trans = (Number(TRANS.value) | 0) === i ? "1" : "0";
        const input = document.createElement("input");
        input.type = "color";
        input.value = rgbToHex(rgb);
        input.addEventListener("input", () => {
            project.palette[i] = hexToRgb(input.value);
            draw();
        });
        sw.addEventListener("click", () => {
            project.active = i;
            renderPalette();
        });
        sw.appendChild(input);
        PALETTE.appendChild(sw);
    });
}

/* -------------------------------------------------------
    * Tools & Interaction
    * -----------------------------------------------------*/
const toolsEl = document.getElementById("tools");
toolsEl.addEventListener("click", (e) => {
    if (!project) return;
    const b = e.target.closest("[data-tool]");
    if (!b) return;
    project.tool = b.dataset.tool;
    toolsEl.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
});

const brushSizeEl = document.getElementById("brushSize");
const brushShapeEl = document.getElementById("brushShape");
brushSizeEl.oninput = () => {
    if (!project) return;
    project.brushSize = clamp(Number(brushSizeEl.value) | 0, 1, 16);
};
brushShapeEl.onchange = () => {
    if (!project) return;
    project.brushShape = brushShapeEl.value;
};

function canvasPos(e) {
    const r = CV.getBoundingClientRect();
    return { x: Math.floor((e.clientX - r.left) / project.zoom), y: Math.floor((e.clientY - r.top) / project.zoom) };
}

let drawing = false,
    lineStart = null,
    selectStart = null;
CV.addEventListener("mousedown", (e) => {
    if (!project) return;
    const pos = canvasPos(e);
    if (!within(pos.x, pos.y)) return;
    if (project.tool === "select") {
        selectStart = pos;
        project.selection = { x: pos.x, y: pos.y, w: 1, h: 1 };
        drawSelectionBox();
        return;
    }
    drawing = true;
    if (project.tool === "line") {
        lineStart = pos;
    } else {
        pushHistory("draw");
        doPaint(pos.x, pos.y);
        draw();
    }
});
window.addEventListener("mouseup", () => {
    if (!project) return;
    drawing = false;
    if (project.tool === "select" && selectStart) {
        selectFinalize();
    }
});
CV.addEventListener("mousemove", (e) => {
    if (!project) return;
    const pos = canvasPos(e);
    if (!within(pos.x, pos.y)) return;
    if (project.tool === "select" && selectStart) {
        project.selection = rectFrom(selectStart, pos);
        drawSelectionBox();
        return;
    }
    if (!drawing) return;
    if (project.tool === "line") {
        draw();
        previewLine(lineStart, pos);
        return;
    }
    doPaint(pos.x, pos.y);
    draw();
});

CV.addEventListener(
    "wheel",
    (e) => {
        if (!project) return;
        e.preventDefault();
        if (e.deltaY < 0) handleMenu("zoomIn");
        else handleMenu("zoomOut");
    },
    { passive: false }
);

function rectFrom(a, b) {
    const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x) + 1,
        h = Math.abs(a.y - b.y) + 1;
    return { x, y, w, h };
}
function selectFinalize() {
    selectStart = null;
    drawSelectionBox();
}

function previewLine(a, b) {
    if (!a) return;
    const d = project.layers[project.layer].indices;
    const temp = cloneIndices(d);
    plotLine(temp, a.x, a.y, b.x, b.y, project.active);
    blit(temp);
}

function blit(src) {
    const dst = project.layers[project.layer].indices;
    dst.set(src);
}

function plotLine(buf, x0, y0, x1, y1, val) {
    const dx = Math.abs(x1 - x0),
        dy = -Math.abs(y1 - y0);
    let sx = x0 < x1 ? 1 : -1,
        sy = y0 < y1 ? 1 : -1,
        err = dx + dy;
    while (true) {
        if (within(x0, y0)) putBrush(buf, x0, y0, val);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
}

function putBrush(buf, x, y, v) {
    const s = project.brushSize,
        shape = project.brushShape;
    const r = Math.floor((s - 1) / 2);
    for (let yy = -r; yy <= r; yy++)
        for (let xx = -r; xx <= r; xx++) {
            const X = x + xx,
                Y = y + yy;
            if (!within(X, Y)) continue;
            if (shape === "circle" && xx * xx + yy * yy > r * r) continue;
            buf[iyx(X, Y)] = v;
        }
}

function doPaint(x, y) {
    const data = project.layers[project.layer].indices;
    const t = project.tool;
    const v = project.active;
    if (t === "pen") {
        putBrush(data, x, y, v);
    } else if (t === "eraser") {
        const tidx = Number(TRANS.value) | 0;
        putBrush(data, x, y, tidx >= 0 ? tidx : 0);
    } else if (t === "picker") {
        project.active = data[iyx(x, y)];
        renderPalette();
    } else if (t === "fill") {
        floodFill(x, y, data[iyx(x, y)], v);
    }
}

function floodFill(x, y, target, repl) {
    if (target === repl) return;
    const st = [[x, y]],
        Wd = project.w,
        Hd = project.h,
        d = project.layers[project.layer].indices;
    while (st.length) {
        const [cx, cy] = st.pop();
        const idx = iyx(cx, cy);
        if (d[idx] !== target) continue;
        d[idx] = repl;
        if (cx > 0) st.push([cx - 1, cy]);
        if (cx < Wd - 1) st.push([cx + 1, cy]);
        if (cy > 0) st.push([cx, cy - 1]);
        if (cy < Hd - 1) st.push([cx, cy + 1]);
    }
}

/* -------------------------------------------------------
    * Layers panel
    * -----------------------------------------------------*/
const layersList = document.getElementById("layersList");
document.getElementById("addLayer").onclick = () => {
    pushHistory("add layer");
    const name = `Layer ${project.layers.length + 1}`;
    project.layers.push({
        name,
        visible: true,
        indices: new Uint8Array(project.w * project.h).fill(
            project.transparencyIndex >= 0 ? project.transparencyIndex : 0
        ),
    });
    project.layer = project.layers.length - 1;
    project.dirty = true;
    setBadge();
    renderLayers();
    draw();
};
document.getElementById("dupLayer").onclick = () => {
    pushHistory("dup layer");
    const base = project.layers[project.layer];
    project.layers.splice(project.layer + 1, 0, {
        name: base.name + " copy",
        visible: base.visible,
        indices: cloneIndices(base.indices),
    });
    project.layer++;
    project.dirty = true;
    setBadge();
    renderLayers();
    draw();
};
document.getElementById("delLayer").onclick = () => {
    if (project.layers.length <= 1) return;
    pushHistory("del layer");
    project.layers.splice(project.layer, 1);
    project.layer = Math.max(0, project.layer - 1);
    project.dirty = true;
    setBadge();
    renderLayers();
    draw();
};
document.getElementById("renLayer").onclick = () => {
    if (!project) return;
    const layer = project.layers[project.layer];
    const nn = prompt("Layer name", layer.name);
    if (nn) {
        pushHistory("rename layer");
        layer.name = nn;
        project.dirty = true;
        setBadge();
        renderLayers();
    }
};
document.getElementById("mergeLayer").onclick = () => {
    if (!project || project.layer >= project.layers.length - 1) return;
    pushHistory("merge layer");
    const top = project.layers[project.layer];
    const below = project.layers[project.layer + 1];
    const t = Number(TRANS.value) | 0;
    for (let i = 0; i < top.indices.length; i++) {
        const v = top.indices[i];
        if (v !== t) below.indices[i] = v;
    }
    project.layers.splice(project.layer, 1);
    project.dirty = true;
    setBadge();
    renderLayers();
    draw();
};

function renderLayers() {
    layersList.innerHTML = "";
    project.layers.forEach((layer, i) => {
        const item = document.createElement("div");
        item.className = "item";
        if (i === project.layer) item.style.outline = "1px solid #fff";

        const eye = document.createElement("span");
        eye.textContent = layer.visible ? "👁" : "🚫";
        eye.onclick = (e) => {
            e.stopPropagation();
            layer.visible = !layer.visible;
            project.dirty = true;
            setBadge();
            renderLayers();
            draw();
        };

        const name = document.createElement("span");
        name.textContent = layer.name;
        name.style.margin = "0 4px";
        name.ondblclick = (e) => {
            e.stopPropagation();
            const nn = prompt("Layer name", layer.name);
            if (nn) {
                layer.name = nn;
                project.dirty = true;
                setBadge();
                renderLayers();
            }
        };

        const up = document.createElement("span");
        up.textContent = "↑";
        up.onclick = (e) => {
            e.stopPropagation();
            if (i > 0) {
                [project.layers[i - 1], project.layers[i]] = [project.layers[i], project.layers[i - 1]];
                project.layer = i - 1;
                project.dirty = true;
                setBadge();
                renderLayers();
                draw();
            }
        };

        const down = document.createElement("span");
        down.textContent = "↓";
        down.onclick = (e) => {
            e.stopPropagation();
            if (i < project.layers.length - 1) {
                [project.layers[i], project.layers[i + 1]] = [project.layers[i + 1], project.layers[i]];
                project.layer = i + 1;
                project.dirty = true;
                setBadge();
                renderLayers();
                draw();
            }
        };

        item.appendChild(eye);
        item.appendChild(name);
        item.appendChild(up);
        item.appendChild(down);

        item.onclick = () => {
            project.layer = i;
            renderLayers();
            draw();
        };
        layersList.appendChild(item);
    });
    refreshHistoryBadge();
    drawTileset();
}

TILECOLS.oninput = () => {
    if (!project) return;
    project.tilesetCols = Math.max(1, Number(TILECOLS.value) | 0);
    drawTileset();
};
document.getElementById("btnExportTileset").onclick = () => {
    if (!project) return;
    exportTileset(project.tilesetCols);
};

/* -------------------------------------------------------
    * Frames panel
    * -----------------------------------------------------*/
const framesList = document.getElementById("framesList");
const playBtn = document.getElementById("playAnim");
const fpsInput = document.getElementById("fps");
let animTimer = null;
document.getElementById("addFrame").onclick = () => {
    if (!project) return;
    const base = project.frames[project.frame];
    const newLayers = base.layers.map((l) => ({
        name: l.name,
        visible: l.visible,
        indices: cloneIndices(l.indices),
    }));
    project.frames.splice(project.frame + 1, 0, {
        name: `Frame ${project.frames.length + 1}`,
        duration: base.duration,
        layers: newLayers,
    });
    project.frame++;
    project.layer = 0;
    project.dirty = true;
    setBadge();
    renderFrames();
    renderLayers();
    draw();
};
document.getElementById("delFrame").onclick = () => {
    if (!project || project.frames.length <= 1) return;
    project.frames.splice(project.frame, 1);
    project.frame = Math.max(0, project.frame - 1);
    project.layer = Math.min(project.layer, project.layers.length - 1);
    project.dirty = true;
    setBadge();
    renderFrames();
    renderLayers();
    draw();
};
function startAnimation() {
    if (!project) return;
    let f = 0;
    const fps = Number(fpsInput.value) || 12;
    playBtn.textContent = "Stop";
    animTimer = setInterval(() => {
        const cur = project.frame;
        project.frame = f;
        drawPreview();
        project.frame = cur;
        f = (f + 1) % project.frames.length;
    }, 1000 / fps);
}
function stopAnimation() {
    if (animTimer) {
        clearInterval(animTimer);
        animTimer = null;
        playBtn.textContent = "Play";
        drawPreview();
    }
}
playBtn.onclick = () => {
    if (animTimer) stopAnimation();
    else startAnimation();
};
function renderFrames() {
    framesList.innerHTML = "";
    project.frames.forEach((frame, i) => {
        const item = document.createElement("div");
        item.className = "item";
        if (i === project.frame) item.style.outline = "1px solid #fff";

        const name = document.createElement("span");
        name.textContent = frame.name;
        name.style.margin = "0 4px";
        name.ondblclick = (e) => {
            e.stopPropagation();
            const nn = prompt("Frame name", frame.name);
            if (nn) {
                frame.name = nn;
                project.dirty = true;
                setBadge();
                renderFrames();
            }
        };

        const up = document.createElement("span");
        up.textContent = "↑";
        up.onclick = (e) => {
            e.stopPropagation();
            if (i > 0) {
                [project.frames[i - 1], project.frames[i]] = [project.frames[i], project.frames[i - 1]];
                project.frame = i - 1;
                project.dirty = true;
                setBadge();
                renderFrames();
            }
        };

        const down = document.createElement("span");
        down.textContent = "↓";
        down.onclick = (e) => {
            e.stopPropagation();
            if (i < project.frames.length - 1) {
                [project.frames[i], project.frames[i + 1]] = [project.frames[i + 1], project.frames[i]];
                project.frame = i + 1;
                project.dirty = true;
                setBadge();
                renderFrames();
            }
        };

        item.appendChild(name);
        item.appendChild(up);
        item.appendChild(down);
        item.onclick = () => {
            stopAnimation();
            project.frame = i;
            project.layer = 0;
            renderFrames();
            renderLayers();
            draw();
        };
        framesList.appendChild(item);
    });
    refreshHistoryBadge();
    drawTileset();
}

/* -------------------------------------------------------
    * Controls
    * -----------------------------------------------------*/
function clampInt(v, min) {
    v = Number(v);
    return !Number.isFinite(v) || v < min ? min : v | 0;
}
function syncDims() {
    if (!project) return;
    const nw = clampInt(W.value, 1),
        nh = clampInt(H.value, 1);
    W.value = String(nw);
    H.value = String(nh);
    if (nw !== project.w || nh !== project.h) {
        pushHistory("resize");
        project.w = nw;
        project.h = nh;
        for (const fr of project.frames) {
            fr.layers = fr.layers.map((l) => ({
                ...l,
                indices: new Uint8Array(nw * nh).fill(
                    project.transparencyIndex >= 0 ? project.transparencyIndex : 0
                ),
            }));
        }
    }
    resizeCanvas();
    draw();
}
W.addEventListener("input", syncDims);
H.addEventListener("input", syncDims);
document.getElementById("btnResize").onclick = syncDims;
document.getElementById("btnClear").onclick = () => {
    pushHistory("clear");
    const tVal = Number.isFinite(Number(TRANS.value)) ? Number(TRANS.value) | 0 : -1;
    project.layers[project.layer].indices.fill(tVal >= 0 ? tVal : 0);
    draw();
};
document.getElementById("btnFlipH").onclick = () => {
    pushHistory("flipH");
    const { w, h } = project;
    const d = project.layers[project.layer].indices;
    for (let y = 0; y < h; y++) {
        for (let x = 0; (x < w / 2) | 0; x++) {
            const a = iyx(x, y),
                b = iyx(w - 1 - x, y);
            const t = d[a];
            d[a] = d[b];
            d[b] = t;
        }
    }
    draw();
};
document.getElementById("btnFlipV").onclick = () => {
    pushHistory("flipV");
    const { w, h } = project;
    const d = project.layers[project.layer].indices;
    for (let y = 0; (y < h / 2) | 0; y++) {
        for (let x = 0; x < w; x++) {
            const a = iyx(x, y),
                b = iyx(x, h - 1 - y);
            const t = d[a];
            d[a] = d[b];
            d[b] = t;
        }
    }
    draw();
};

Z.oninput = () => {
    if (!project) return;
    project.zoom = Number(Z.value);
    ZV.textContent = String(project.zoom);
    resizeCanvas();
};
GRID.onchange = () => project && draw();

document.getElementById("btnAddColor").onclick = () => {
    project.palette.push([255, 255, 255]);
    renderPalette();
};
document.getElementById("btnDelColor").onclick = () => {
    if (project.palette.length > 1) {
        project.palette.splice(project.active, 1);
        project.active = 0;
        renderPalette();
        draw();
    }
};
document.getElementById("btnTrans").onclick = () => {
    TRANS.value = String(project.active);
    renderPalette();
    draw();
};

/* -------------------------------------------------------
    * Encoding / Optimizer
    * -----------------------------------------------------*/
function mergeVisibleLayers(layers) {
    const t = Number(TRANS.value) | 0;
    const out = new Uint8Array(project.w * project.h).fill(t);
    for (const layer of layers) {
        if (!layer.visible) continue;
        const src = layer.indices;
        for (let i = 0; i < src.length; i++) if (src[i] !== t) out[i] = src[i];
    }
    return out;
}
function gatherIndices() {
    return project ? mergeVisibleLayers(project.layers) : new Uint8Array();
}
function gatherPalette() {
    return project ? project.palette.map(([r, g, b]) => ({ r, g, b })) : [];
}

function encodeOnce(opts) {
    return TinySprites.encode({
        width: project.w,
        height: project.h,
        indices: opts.indices ?? gatherIndices(),
        palette: opts.palette ?? gatherPalette(),
        transparencyIndex: Number(TRANS.value) | 0,
        colorMode: opts.colorMode,
        enablePatterns: opts.enablePatterns,
        enableRowRepeat: opts.enableRowRepeat,
        enableCopy: opts.enableCopy,
        enableRLE: opts.enableRLE,
        returnString: opts.returnString ?? false,
        fast: opts.fast ?? false,
    });
}

function exportString() {
    const s = "ts1|" + encodeOnce({ colorMode: modeFromPref(), enablePatterns: true, enableRowRepeat: true, enableCopy: true, enableRLE: true, returnString: true });
    navigator.clipboard.writeText(s).catch(() => {});
    alert("Export copied to clipboard.");
    updateStats(s);
    rememberRecent(s);
    project.lastExport = { type: "string", payload: s };
}

// Palette merge (lossy) — merges colors within Δ (Manhattan distance) and remaps indices
function paletteMerge(delta) {
    if (!delta || delta <= 0) return { palette: project.palette.slice(), indices: gatherIndices() };
    const pal = project.palette.map((c) => c.slice());
    const map = new Map();
    for (let i = 0; i < pal.length; i++)
        if (!map.has(i))
            for (let j = i + 1; j < pal.length; j++) {
                const d = Math.abs(pal[i][0] - pal[j][0]) + Math.abs(pal[i][1] - pal[j][1]) + Math.abs(pal[i][2] - pal[j][2]);
                if (d <= delta) {
                    map.set(j, i);
                    pal[j] = pal[i];
                }
            }
    // build index map compressing gaps
    const canon = [],
        remap = new Map();
    let k = 0;
    for (let i = 0; i < pal.length; i++) {
        const root = map.get(i) ?? i;
        if (!remap.has(root)) {
            remap.set(root, k++);
            canon.push(pal[root]);
        }
        remap.set(i, remap.get(root));
    }
    const outIdx = new Uint8Array(gatherIndices().length);
    const src = gatherIndices();
    for (let p = 0; p < src.length; p++) {
        outIdx[p] = remap.get(src[p]) | 0;
    }
    return { palette: canon, indices: outIdx };
}

function paletteReorderByFrequency(palette, indices) {
    const freq = new Array(palette.length).fill(0);
    for (let i = 0; i < indices.length; i++) freq[indices[i]]++;
    const order = [...palette.keys()].sort((a, b) => freq[b] - freq[a]);
    const newPal = order.map((i) => palette[i]);
    const map = new Uint8Array(palette.length);
    order.forEach((old, i) => {
        map[old] = i;
    });
    const newIdx = new Uint8Array(indices.length);
    for (let i = 0; i < indices.length; i++) newIdx[i] = map[indices[i]];
    return { palette: newPal, indices: newIdx };
}

function tryAllVariants() {
    const mergeDelta = Number(OPT.merge.value) | 0;
    OPT.mergeVal.textContent = String(mergeDelta);
    // Start from (optionally) lossy-merged palette
    const merged = paletteMerge(mergeDelta);
    const basePal = merged.palette.map(([r, g, b]) => ({ r, g, b }));
    const baseIdx = merged.indices;
    const freqOpt = paletteReorderByFrequency(merged.palette, baseIdx);
    const candidates = [
        { name: "base", pal: basePal, idx: baseIdx },
        { name: "freq", pal: freqOpt.palette.map(([r, g, b]) => ({ r, g, b })), idx: freqOpt.indices },
    ];

    const modes = OPT.autoMode.checked ? [0, 1, 2, 3] : [modeFromPref()];
    let best = null;
    for (const cand of candidates) {
        for (const mode of modes) {
            for (const pat of [OPT.pat.checked, false]) {
                for (const row of [OPT.row.checked, false]) {
                    for (const cpy of [OPT.cpy.checked, false]) {
                        for (const rle of [OPT.rle.checked, false]) {
                            for (const fast of [OPT.fast.checked, false]) {
                                const res = TinySprites.encode({
                                    width: project.w,
                                    height: project.h,
                                    indices: cand.idx,
                                    palette: cand.pal,
                                    transparencyIndex: Number(TRANS.value) | 0,
                                    colorMode: mode,
                                    enablePatterns: pat,
                                    enableRowRepeat: row,
                                    enableCopy: cpy,
                                    enableRLE: rle,
                                    returnString: false,
                                    fast,
                                });
                                const size = res.length;
                                const score = size; // purely size-driven
                                if (!best || score < best.score) {
                                    best = { score, bytes: res, cfg: { mode, pat, row, cpy, rle, fast, cand: cand.name } };
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return best;
}

function exportOptimized() {
    const best = tryAllVariants();
    if (!best) {
        alert("No variant produced");
        return;
    }
    const s = "ts1|" + toB64Url(best.bytes);
    navigator.clipboard.writeText(s).catch(() => {});
    alert("Optimized export copied to clipboard.");
    updateStats(s, best);
    rememberRecent(s);
    project.lastExport = { type: "string", payload: s, params: best.cfg };
}

function toB64Url(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    let b64 = typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function modeFromPref() {
    const v = document.getElementById("propColorMode").value;
    return v === "auto" ? 0 : Number(v) | 0;
}

function updateStats(bytesOrStr, best) {
    if (!project) {
        STATS.textContent = "";
        SIZEBADGE.textContent = "–";
        return;
    }
    const b = typeof bytesOrStr === "string" ? Math.ceil((bytesOrStr.length * 3) / 4) : bytesOrStr.length;
    const unique = new Set(gatherIndices()).size;
    const bpi = Math.max(1, Math.ceil(Math.log2(Math.max(1, unique))));
    const modeName = ["TSV8", "RGB332", "PAL12", "RGB888"];
    const extra = best
        ? ` • best:${b}B via ${modeName[best.cfg.mode]} [pat:${best.cfg.pat ? "on" : "off"} row:${best.cfg.row ? "on" : "off"} cpy:${best.cfg.cpy ? "on" : "off"} rle:${best.cfg.rle ? "on" : "off"} fast:${
                best.cfg.fast ? "on" : "off"
            } pal:${best.cfg.cand}]`
        : "";
    STATS.textContent = `size: ${b} bytes · colors:${unique} · bpi≈${bpi} · ${project.w}×${project.h}${extra}`;
    SIZEBADGE.textContent = `~${b}B`;
}

// Download helpers for sheet/tileset (PNG)
function savePNG(canvas, name) {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = name;
    a.click();
}

function exportSpriteSheet() {
    const frames = project.frames;
    const c = document.createElement("canvas");
    c.width = project.w * frames.length;
    c.height = project.h;
    const cx = c.getContext("2d");
    for (let f = 0; f < frames.length; f++) {
        const merged = mergeVisibleLayers(frames[f].layers);
        drawLayerTo(cx, merged, f * project.w, 0);
    }
    savePNG(c, `${project.name.replace(/\.[^.]+$/, "")}_sheet.png`);
}
function exportTileset(cols = 4) {
    const frames = project.frames;
    const rows = Math.ceil(frames.length / cols);
    const c = document.createElement("canvas");
    c.width = project.w * cols;
    c.height = project.h * rows;
    const cx = c.getContext("2d");
    for (let i = 0; i < frames.length; i++) {
        const x = (i % cols) * project.w,
            y = Math.floor(i / cols) * project.h;
        const merged = mergeVisibleLayers(frames[i].layers);
        drawLayerTo(cx, merged, x, y);
    }
    savePNG(c, `${project.name.replace(/\.[^.]+$/, "")}_tileset.png`);
}
function drawLayerTo(cx, indices, dx, dy) {
    const img = new ImageData(project.w, project.h);
    // build rgba via decoder helper style
    const pal = project.palette;
    const t = Number(TRANS.value) | 0;
    let k = 0;
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        const o = i * 4;
        if (idx === t) {
            img.data[o] = 0;
            img.data[o + 1] = 0;
            img.data[o + 2] = 0;
            img.data[o + 3] = 0;
        } else {
            const c = pal[idx] || [0, 0, 0];
            img.data[o] = c[0];
            img.data[o + 1] = c[1];
            img.data[o + 2] = c[2];
            img.data[o + 3] = 255;
        }
    }
    cx.putImageData(img, dx, dy);
}

/* -------------------------------------------------------
    * File/Recent (localStorage)
    * -----------------------------------------------------*/
function rememberRecent(s, name = project.name) {
    try {
        const rec = JSON.parse(localStorage.getItem("ts_recent") || "[]");
        rec.unshift({ name, ts: s, t: Date.now() });
        while (rec.length > 12) rec.pop();
        localStorage.setItem("ts_recent", JSON.stringify(rec));
    } catch (e) {}
}

const dlgRecent = document.getElementById("dlgRecent");
function openRecent() {
    const list = document.getElementById("recentList");
    list.innerHTML = "";
    const rec = JSON.parse(localStorage.getItem("ts_recent") || "[]");
    if (!rec.length) {
        list.innerHTML = '<div class="hint">No recent items.</div>';
    }
    rec.forEach((r) => {
        const it = document.createElement("div");
        it.className = "item";
        it.textContent = `${r.name} — ${new Date(r.t).toLocaleString()}`;
        it.onclick = () => {
            importString(r.ts, r.name);
            dlgRecent.close();
        };
        list.appendChild(it);
    });
    dlgRecent.showModal();
}

/* -------------------------------------------------------
    * Menubar events
    * -----------------------------------------------------*/
const menubar = document.getElementById("menubar");
menubar.addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-btn");
    if (btn) {
        closeAllMenus();
        btn.setAttribute("aria-expanded", "true");
        btn.nextElementSibling.setAttribute("open", "");
        return;
    }
    const mi = e.target.closest(".mi");
    if (!mi) return;
    const act = mi.dataset.action;
    closeAllMenus();
    handleMenu(act);
});
function closeAllMenus() {
    menubar.querySelectorAll(".menu-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
    menubar.querySelectorAll(".dropdown").forEach((d) => d.removeAttribute("open"));
}
document.addEventListener("click", (e) => {
    if (!e.target.closest("#menubar")) closeAllMenus();
});
function handleMenu(action) {
    const projectless = new Set(["newDoc", "openDoc", "openRecent"]);
    if (!project && !projectless.has(action)) return;
    const map = {
        newDoc: () => {
            const p = createProject();
            projects.push(p);
            selectProject(p);
        },
        openDoc: async () => {
            try {
                if (window.showOpenFilePicker) {
                    const handles = await window.showOpenFilePicker({
                        types: [
                            {
                                description: "TinySprite or PNG",
                                accept: { "text/plain": [".tspr"], "image/png": [".png"] },
                            },
                        ],
                        multiple: true,
                    });
                    for (const h of handles) {
                        const file = await h.getFile();
                        if (h.name.endsWith(".tspr")) {
                            const text = await file.text();
                            importString(text, h.name, h);
                        } else if (h.name.endsWith(".png")) {
                            const img = new Image();
                            img.src = URL.createObjectURL(file);
                            await img.decode();
                            const c = document.createElement("canvas");
                            c.width = img.naturalWidth;
                            c.height = img.naturalHeight;
                            const cx = c.getContext("2d");
                            cx.drawImage(img, 0, 0);
                            const rgba = cx.getImageData(0, 0, c.width, c.height).data;
                            const bytes = TinySprites.encode({
                                width: c.width,
                                height: c.height,
                                rgba,
                                maxPalette: Number(OPT.maxPal.value) | 0,
                            });
                            const dec = TS.decode(bytes);
                            const p = createProject(h.name.replace(/\.png$/i, ".tspr"));
                            p.w = c.width;
                            p.h = c.height;
                            p.frames = [
                                {
                                    name: "Frame 1",
                                    duration: 100,
                                    layers: [{ name: "Layer 1", visible: true, indices: dec.indices }],
                                },
                            ];
                            p.frame = 0;
                            p.layer = 0;
                            p.palette = dec.palette.map((x) => [x[0], x[1], x[2]]);
                            p.dirty = false;
                            projects.push(p);
                            selectProject(p);
                            updateStats(bytes);
                            URL.revokeObjectURL(img.src);
                        }
                    }
                } else {
                    document.getElementById("fileImg").click();
                }
            } catch (e) {}
        },
        openRecent: () => openRecent(),
        save: async () => {
            try {
                if (!project.fileHandle) return handleMenu("saveAs");
                const payload =
                    "ts1|" +
                    encodeOnce({
                        colorMode: modeFromPref(),
                        enablePatterns: true,
                        enableRowRepeat: true,
                        enableCopy: true,
                        enableRLE: true,
                        returnString: true,
                    });
                const writable = await project.fileHandle.createWritable();
                await writable.write(new Blob([payload], { type: "text/plain" }));
                await writable.close();
                project.lastExport = { type: "string", payload };
                project.dirty = false;
                setBadge();
            } catch (e) {
                alert("Save failed");
            }
        },
        saveAs: async () => {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: project.name,
                    types: [
                        {
                            description: "TinySprite Project",
                            accept: { "text/plain": [".tspr"] },
                        },
                    ],
                });
                const payload =
                    "ts1|" +
                    encodeOnce({
                        colorMode: modeFromPref(),
                        enablePatterns: true,
                        enableRowRepeat: true,
                        enableCopy: true,
                        enableRLE: true,
                        returnString: true,
                    });
                const writable = await handle.createWritable();
                await writable.write(new Blob([payload], { type: "text/plain" }));
                await writable.close();
                project.fileHandle = handle;
                project.name = handle.name;
                project.lastExport = { type: "string", payload };
                project.dirty = false;
                setBadge();
            } catch (e) {
                alert("Save failed");
            }
        },
        exportAs: () => exportString(),
        exportOptimized: () => exportOptimized(),
        repeatExport: () => {
            if (project.lastExport) {
                navigator.clipboard.writeText(project.lastExport.payload).catch(() => {});
                updateStats(project.lastExport.payload);
                alert("Last export copied to clipboard.");
            }
        },
        exportSheet: () => exportSpriteSheet(),
        exportTileset: () => exportTileset(project.tilesetCols),
        importString: () => {
            const s = prompt("Paste ts1|string:");
            if (!s) return;
            importString(s.trim());
        },
        importPNG: () => {
            document.getElementById("fileImg").click();
        },
        close: () => {
            if (confirm("Close current project?")) closeProject(project);
        },
        closeAll: () => {
            if (confirm("Close ALL (reset)?")) {
                projects.splice(0, projects.length);
                selectProject(null);
                refreshTabs();
            }
        },
        undo: () => undo(),
        redo: () => redo(),
        history: () => showHistory(),
        cut: () => cutSel(),
        copy: () => copySel(),
        copyMerged: () => copyMergedPNG(),
        paste: () => pasteSel(),
        delete: () => deleteSel(),
        fill: () => {
            project.tool = "fill";
        },
        stroke: () => strokeSel(),
        rotate: () => {},
        rotCW: () => rotateCW(),
        rotCCW: () => rotateCCW(),
        rot180: () => rotate180(),
        flipH: () => document.getElementById("btnFlipH").click(),
        flipV: () => document.getElementById("btnFlipV").click(),
        transform: () => {},
        shift: () => shiftPrompt(),
        resize: () => syncDims(),
        brushes: () => alert("Use the brush controls in the Tools panel."),
        props: () => showProps(),
        layersNew: () => document.getElementById("addLayer").click(),
        layersDel: () => document.getElementById("delLayer").click(),
        layersDup: () => document.getElementById("dupLayer").click(),
        layersRen: () => document.getElementById("renLayer").click(),
        layersMerge: () => document.getElementById("mergeLayer").click(),
        optimizer: () => document.getElementById("dlgOptimizer").showModal(),
        zoomIn: () => {
            Z.value = String(Math.min(100, Number(Z.value) + 2));
            Z.oninput();
        },
        zoomOut: () => {
            Z.value = String(Math.max(4, Number(Z.value) - 2));
            Z.oninput();
        },
        toggleGrid: () => {
            GRID.checked = !GRID.checked;
            draw();
        },
        toggleMonochrome: () => document.documentElement.classList.toggle("invert"),
    };
    (map[action] || (() => {}))();
}

/* -------------------------------------------------------
    * Selection operations
    * -----------------------------------------------------*/
function ensureSel() {
    if (!project.selection) project.selection = { x: 0, y: 0, w: project.w, h: project.h };
    return project.selection;
}
function regionIter(sel, fn) {
    for (let y = sel.y; y < sel.y + sel.h; y++) for (let x = sel.x; x < sel.x + sel.w; x++) fn(x, y);
}
function getSelData() {
    const sel = ensureSel();
    const data = new Uint8Array(sel.w * sel.h);
    const src = project.layers[project.layer].indices;
    let k = 0;
    regionIter(sel, (x, y) => {
        data[k++] = src[iyx(x, y)];
    });
    return { sel, data };
}
function putSelData(sel, data, dx, dy) {
    const src = data;
    const dst = project.layers[project.layer].indices;
    let k = 0;
    for (let y = 0; y < sel.h; y++)
        for (let x = 0; x < sel.w; x++) {
            const X = dx + x,
                Y = dy + y;
            if (within(X, Y)) dst[iyx(X, Y)] = src[k];
            k++;
        }
    draw();
}

let clipboard = null;
function cutSel() {
    if (!project.selection) return;
    pushHistory("cut");
    const { sel, data } = getSelData();
    clipboard = { w: sel.w, h: sel.h, data };
    regionIter(sel, (x, y) => {
        project.layers[project.layer].indices[iyx(x, y)] = Number(TRANS.value) | 0;
    });
    draw();
}
function copySel() {
    const { sel, data } = getSelData();
    clipboard = { w: sel.w, h: sel.h, data };
}
async function copyMergedPNG() {
    const c = document.createElement("canvas");
    c.width = project.w;
    c.height = project.h;
    const cx = c.getContext("2d");
    const merged = mergeVisibleLayers(project.layers);
    drawLayerTo(cx, merged, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res));
    try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        alert("Copied merged PNG");
    } catch (e) {
        alert("Clipboard PNG failed");
    }
}
function pasteSel() {
    if (!clipboard) {
        alert("Clipboard empty");
        return;
    }
    pushHistory("paste");
    const pos = { x: 0, y: 0 };
    if (project.selection) (pos.x = project.selection.x), (pos.y = project.selection.y);
    const sel = { x: 0, y: 0, w: clipboard.w, h: clipboard.h };
    putSelData(sel, clipboard.data, pos.x, pos.y);
}
function deleteSel() {
    if (!project.selection) return;
    pushHistory("delete");
    const tidx = Number(TRANS.value) | 0;
    regionIter(project.selection, (x, y) => {
        project.layers[project.layer].indices[iyx(x, y)] = tidx >= 0 ? tidx : 0;
    });
    draw();
}
function strokeSel() {
    if (!project.selection) return;
    pushHistory("stroke");
    const s = project.selection;
    const d = project.layers[project.layer].indices;
    const v = project.active;
    for (let x = s.x; x < s.x + s.w; x++) {
        d[iyx(x, s.y)] = v;
        d[iyx(x, s.y + s.h - 1)] = v;
    }
    for (let y = s.y; y < s.y + s.h; y++) {
        d[iyx(s.x, y)] = v;
        d[iyx(s.x + s.w - 1, y)] = v;
    }
    draw();
}

function rotateCW() {
    pushHistory("rotCW");
    rotateGeneric(1);
}
function rotateCCW() {
    pushHistory("rotCCW");
    rotateGeneric(3);
}
function rotate180() {
    pushHistory("rot180");
    rotateGeneric(2);
}
function rotateGeneric(times) {
    const d = project.layers[project.layer].indices;
    let w = project.w,
        h = project.h;
    for (let t = 0; t < times; t++) {
        const out = new Uint8Array(w * h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const nx = h - 1 - y,
                    ny = x;
                out[ny * h + nx] = d[iyx(x, y)];
            }
        project.layers[project.layer].indices = out;
        const tmp = w;
        w = h;
        h = tmp;
        project.w = w;
        project.h = h;
        W.value = w;
        H.value = h;
    }
    resizeCanvas();
    draw();
}

function shiftPrompt() {
    const dx = Number(prompt("Shift X (±):", "1")) || 0;
    const dy = Number(prompt("Shift Y (±):", "0")) || 0;
    shift(dx, dy);
}
function shift(dx, dy) {
    pushHistory("shift");
    const { w, h } = project;
    const src = project.layers[project.layer].indices;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const nx = (x + (dx % w) + w) % w,
                ny = (y + (dy % h) + h) % h;
            out[iyx(nx, ny)] = src[iyx(x, y)];
        }
    project.layers[project.layer].indices = out;
    draw();
}

function undo() {
    const h = project.history;
    const e = h.undo.pop();
    if (!e) return;
    const cur = {
        label: "undo-back",
        frame: project.frame,
        layer: project.layer,
        indices: cloneIndices(project.layers[project.layer].indices),
    };
    h.redo.push(cur);
    project.frame = e.frame;
    project.layer = e.layer;
    project.layers[project.layer].indices = cloneIndices(e.indices);
    renderFrames();
    renderLayers();
    draw();
}
function redo() {
    const h = project.history;
    const e = h.redo.pop();
    if (!e) return;
    const cur = {
        label: "redo-back",
        frame: project.frame,
        layer: project.layer,
        indices: cloneIndices(project.layers[project.layer].indices),
    };
    h.undo.push(cur);
    project.frame = e.frame;
    project.layer = e.layer;
    project.layers[project.layer].indices = cloneIndices(e.indices);
    renderFrames();
    renderLayers();
    draw();
}

function showHistory() {
    const dlg = document.getElementById("dlgHistory");
    const list = document.getElementById("historyList");
    list.innerHTML = "";
    const h = project.history;
    h.undo
        .slice()
        .reverse()
        .forEach((e, i) => {
            const it = document.createElement("div");
            it.className = "item";
            it.textContent = `${e.label} (f${e.frame + 1}, l${e.layer + 1})`;
            it.onclick = () => {
                project.frame = e.frame;
                project.layer = e.layer;
                project.layers[project.layer].indices = cloneIndices(e.indices);
                renderFrames();
                renderLayers();
                draw();
            };
            list.appendChild(it);
        });
    dlg.showModal();
}

/* -------------------------------------------------------
    * Import / Export helpers
    * -----------------------------------------------------*/
function importString(s, name, fileHandle = null) {
    const str = (s || "").trim();
    if (!str) return;
    const dec = TS.decode(str);
    const p = createProject(name);
    p.w = dec.width;
    p.h = dec.height;
    p.frames = [
        {
            name: "Frame 1",
            duration: 100,
            layers: [{ name: "Layer 1", visible: true, indices: dec.indices }],
        },
    ];
    p.frame = 0;
    p.layer = 0;
    p.palette = dec.palette.map((x) => [x[0] | 0, x[1] | 0, x[2] | 0]);
    p.transparencyIndex = dec.transparencyIndex ?? -1;
    p.dirty = false;
    p.fileHandle = fileHandle;
    projects.push(p);
    selectProject(p);
    updateStats(str);
    rememberRecent(str, p.name);
    return p;
}

// File input for opening .tspr or PNG files
document.getElementById("fileImg").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    for (const f of files) {
        if (f.name.endsWith(".tspr")) {
            const ab = await f.arrayBuffer();
            const bytes = new Uint8Array(ab);
            const s = "ts1|" + toB64Url(bytes);
            importString(s, f.name);
        } else {
            const img = new Image();
            img.src = URL.createObjectURL(f);
            await img.decode();
            const c = document.createElement("canvas");
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            const cx = c.getContext("2d");
            cx.drawImage(img, 0, 0);
            const w = c.width,
                h = c.height;
            const rgba = cx.getImageData(0, 0, w, h).data;
            const bytes = TinySprites.encode({ width: w, height: h, rgba, maxPalette: Number(OPT.maxPal.value) | 0 });
            const dec = TS.decode(bytes);
            const p = createProject(f.name);
            p.w = w;
            p.h = h;
            p.frames = [
                {
                    name: "Frame 1",
                    duration: 100,
                    layers: [{ name: "Layer 1", visible: true, indices: dec.indices }],
                },
            ];
            p.frame = 0;
            p.layer = 0;
            p.palette = dec.palette.map((x) => [x[0], x[1], x[2]]);
            p.dirty = false;
            projects.push(p);
            selectProject(p);
            updateStats(bytes);
            URL.revokeObjectURL(img.src);
        }
    }
    e.target.value = "";
});

// Export sheet/tileset via menu only; still accessible

/* -------------------------------------------------------
    * Project Properties modal
    * -----------------------------------------------------*/
const dlgProps = document.getElementById("dlgProps");
function showProps() {
    document.getElementById("propColorMode").value = project.preferredColorMode;
    document.getElementById("propTrans").value = TRANS.value;
    document.getElementById("propGrid").checked = GRID.checked;
    dlgProps.showModal();
}
document.getElementById("btnPropsCancel").onclick = () => dlgProps.close();
document.getElementById("btnPropsOK").onclick = () => {
    project.preferredColorMode = document.getElementById("propColorMode").value;
    TRANS.value = document.getElementById("propTrans").value;
    GRID.checked = document.getElementById("propGrid").checked;
    dlgProps.close();
    draw();
};

document.getElementById("btnRecentClose").onclick = () => dlgRecent.close();
document.getElementById("btnHistoryClose").onclick = () => document.getElementById("dlgHistory").close();
document.getElementById("btnOptClose").onclick = () => document.getElementById("dlgOptimizer").close();

/* -------------------------------------------------------
    * Keyboard shortcuts
    * -----------------------------------------------------*/
document.addEventListener("keydown", (e) => {
    if (!project && !(e.ctrlKey && (e.key === "o" || e.key === "n"))) return;
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleMenu("saveAs");
    } else if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleMenu("save");
    } else if (e.ctrlKey && e.key === "o") {
        e.preventDefault();
        handleMenu("openDoc");
    } else if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        handleMenu("newDoc");
    } else if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        handleMenu("close");
    } else if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        let idx = projects.indexOf(project);
        idx = (idx + dir + projects.length) % projects.length;
        selectProject(projects[idx]);
    } else if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
    } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
    } else if (e.key === "+" || (e.ctrlKey && e.key === "=")) {
        e.preventDefault();
        handleMenu("zoomIn");
    } else if (e.key === "-") {
        e.preventDefault();
        handleMenu("zoomOut");
    } else if (e.key.toLowerCase() === "g" && !e.ctrlKey) {
        GRID.checked = !GRID.checked;
        draw();
    }
});

/* -------------------------------------------------------
    * Init
    * -----------------------------------------------------*/
function init() {
    selectProject(project);
    updateStats(new Uint8Array());
}
init();
