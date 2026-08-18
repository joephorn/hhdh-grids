const blobTool = {
  blobs: [],
  activeBlob: null,
  scale: 1,
  cellWidth: 60,
  cellHeight: 40,
  margin: 20,
  showMeterGrid: true,
  showBlobGuides: true,
  zoom: 1,
  viewportX: 0,
  viewportY: 0,
  terrainX: 0,
  terrainY: 0,
  rotation: 0,
  rotationCenter: null,
};

let sceneLayer;
let terrainLayer;
let scaleLayer;
let draggedPointInfo = null;
let draggedBlobInfo = null;
let viewportDragInfo = null;
let pendingCanvasInteraction = null;

const terrainGridReference = {
  x: 720.535,
  y: 106.448,
  width: 3.403,
  height: 2.269,
  sourceWidth: 1031.391,
  sourceHeight: 757.365,
};

const CANVAS_DEFAULTS = {
  width: 1200,
  height: 750,
};

// -----------------------------------------------------------------------------
// Coordinate systems and transforms
// -----------------------------------------------------------------------------

function getScenePoint(x, y) {
  const zoom = blobTool.zoom;
  return {
    x: (x - width / 2 - blobTool.viewportX) / zoom + width / 2,
    y: (y - height / 2 - blobTool.viewportY) / zoom + height / 2,
  };
}

function applySceneZoom() {
  translate(width / 2 + blobTool.viewportX, height / 2 + blobTool.viewportY);
  scale(blobTool.zoom);
  translate(-width / 2, -height / 2);
}

function setZoomAroundPoint(nextZoom, screenX, screenY) {
  const scenePoint = getScenePoint(screenX, screenY);
  blobTool.zoom = Math.min(8, Math.max(0.2, nextZoom));
  blobTool.viewportX = screenX - width / 2 - (scenePoint.x - width / 2) * blobTool.zoom;
  blobTool.viewportY = screenY - height / 2 - (scenePoint.y - height / 2) * blobTool.zoom;
  syncSceneLayer();

  const zoomInput = document.getElementById('zoom');
  if (zoomInput) zoomInput.value = String(blobTool.zoom);
}

function calculateBlobTransformCenter() {
  const points = blobTool.blobs.filter(Boolean).flatMap((blob) => blob.points || []);
  if (!points.length) return { x: width / 2, y: height / 2 };

  return {
    x: (Math.min(...points.map((point) => point.x)) + Math.max(...points.map((point) => point.x))) / 2,
    y: (Math.min(...points.map((point) => point.y)) + Math.max(...points.map((point) => point.y))) / 2,
  };
}

function getBlobTransformCenter() {
  if (blobTool.rotationCenter) return blobTool.rotationCenter;

  const center = calculateBlobTransformCenter();
  if (blobTool.rotation !== 0) blobTool.rotationCenter = center;
  return center;
}

function setBlobRotation(nextRotation) {
  if (blobTool.rotation === 0 && nextRotation !== 0) {
    blobTool.rotationCenter = calculateBlobTransformCenter();
  }
  if (nextRotation === 0) {
    blobTool.rotationCenter = null;
  }
  blobTool.rotation = nextRotation;
}

function getTransformedBlobPoint(sceneX, sceneY, includeRotation = true) {
  const canvasCenter = { x: width / 2, y: height / 2 };
  const rotationCenter = getBlobTransformCenter();
  const blobScale = getBlobScale();
  const x = (sceneX - canvasCenter.x) / blobScale + canvasCenter.x;
  const y = (sceneY - canvasCenter.y) / blobScale + canvasCenter.y;
  const angle = radians(includeRotation ? -blobTool.rotation : 0);
  const offsetX = x - rotationCenter.x;
  const offsetY = y - rotationCenter.y;

  return {
    x: offsetX * cos(angle) - offsetY * sin(angle) + rotationCenter.x,
    y: offsetX * sin(angle) + offsetY * cos(angle) + rotationCenter.y,
  };
}

function getBlobPoint(sceneX, sceneY) {
  return getTransformedBlobPoint(sceneX, sceneY, true);
}

function getBlobOutlinePoint(sceneX, sceneY) {
  return getTransformedBlobPoint(sceneX, sceneY, false);
}

function applyBlobTransform(includeRotation = true) {
  const canvasCenter = { x: width / 2, y: height / 2 };
  const rotationCenter = getBlobTransformCenter();

  translate(canvasCenter.x, canvasCenter.y);
  scale(getBlobScale());
  translate(-canvasCenter.x, -canvasCenter.y);

  if (includeRotation) {
    translate(rotationCenter.x, rotationCenter.y);
    rotate(radians(blobTool.rotation));
    translate(-rotationCenter.x, -rotationCenter.y);
  }
}

function syncSceneLayer() {
  if (!sceneLayer || !terrainLayer) return;

  sceneLayer.style.width = `${width}px`;
  sceneLayer.style.height = `${height}px`;

  const terrainWidth = terrainLayer.naturalWidth || 1031.391;
  const terrainHeight = terrainLayer.naturalHeight || 757.365;
  const scaleFactor = Math.min(width / terrainWidth, height / terrainHeight);
  const displayWidth = terrainWidth * scaleFactor;
  const displayHeight = terrainHeight * scaleFactor;

  terrainLayer.style.width = `${displayWidth}px`;
  terrainLayer.style.height = `${displayHeight}px`;
  terrainLayer.style.left = `${(width - displayWidth) / 2 + blobTool.viewportX + blobTool.terrainX * blobTool.zoom}px`;
  terrainLayer.style.top = `${(height - displayHeight) / 2 + blobTool.viewportY + blobTool.terrainY * blobTool.zoom}px`;
  terrainLayer.style.transform = `scale(${blobTool.zoom})`;
  terrainLayer.hidden = false;
}

function getTerrainReferenceMetrics() {
  const scaleFactor = Math.min(width / terrainGridReference.sourceWidth, height / terrainGridReference.sourceHeight);
  const terrainWidth = terrainGridReference.sourceWidth * scaleFactor;
  const terrainHeight = terrainGridReference.sourceHeight * scaleFactor;

  return {
    cellW: terrainGridReference.width * scaleFactor,
    cellH: terrainGridReference.height * scaleFactor,
    originX: (width - terrainWidth) / 2 + terrainGridReference.x * scaleFactor + blobTool.terrainX,
    originY: (height - terrainHeight) / 2 + terrainGridReference.y * scaleFactor + blobTool.terrainY,
  };
}

function getBlobScale() {
  return blobTool.scale;
}

function getRenderedBlobScale() {
  return blobTool.zoom * getBlobScale();
}

function getGridMetrics() {
  const reference = getTerrainReferenceMetrics();
  const blobScale = getBlobScale();
  const origin = getBlobPoint(reference.originX, reference.originY);
  const cellW = reference.cellW / blobScale;
  const cellH = reference.cellH / blobScale;
  // De marge is een visuele afstand en mag niet meegroeien met de blob-schaal.
  const gap = Math.max(0, blobTool.margin) / blobScale;

  return { cellW, cellH, gap, originX: origin.x, originY: origin.y, stepX: cellW + gap, stepY: cellH + gap };
}

function getGridBounds(bounds) {
  const { stepX, stepY, originX, originY } = getGridMetrics();

  return {
    startX: originX + Math.floor((bounds.minX - originX) / stepX) * stepX,
    startY: originY + Math.floor((bounds.minY - originY) / stepY) * stepY,
    endX: originX + Math.ceil((bounds.maxX - originX) / stepX) * stepX,
    endY: originY + Math.ceil((bounds.maxY - originY) / stepY) * stepY,
  };
}

// -----------------------------------------------------------------------------
// Blob and cell data
// -----------------------------------------------------------------------------

function getDefaultBlobSize(height = 120) {
  return {
    height,
    width: height * 1.5,
  };
}

function getBlobGroups() {
  const groups = [];
  const remaining = blobTool.blobs.filter(Boolean);

  while (remaining.length) {
    const root = remaining.shift();
    const group = [root];

    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      const candidate = remaining[i];
      if (blobsOverlap(root, candidate)) {
        group.push(candidate);
        remaining.splice(i, 1);
      }
    }

    groups.push(group);
  }

  return groups;
}

function getGroupCellCount(group) {
  const mergedCells = {};

  group.forEach((blob) => {
    if (!blob || !Array.isArray(blob.points)) return;
    ensureBlobCells(blob);

    Object.keys(blob.cells || {}).forEach((key) => {
      if (blob.cells[key] === true) {
        mergedCells[key] = true;
      }
    });
  });

  return Object.keys(mergedCells).length;
}

function getTotalRectCount() {
  return getBlobGroups().reduce((count, group) => count + getGroupCellCount(group), 0);
}

function refreshBlobCounts() {
  blobTool.blobs.forEach((blob) => {
    updateBlobCellsAndCount(blob);
  });
}

function updateTotalRectCount() {
  const totalEl = document.getElementById('totalRectCount');
  if (!totalEl) return;
  totalEl.textContent = `${getTotalRectCount()} Kratjes`;
}

function getCellKey(x, y) {
  return `${x.toFixed(4)}|${y.toFixed(4)}`;
}

function ensureBlobCells(blob) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return;

  const previousCells = blob.cells && typeof blob.cells === 'object' ? blob.cells : {};
  const nextCells = {};

  const { cellW, cellH, stepX, stepY } = getGridMetrics();
  const { startX, startY, endX, endY } = getGridBounds(getBlobBounds(blob));

  for (let x = startX; x <= endX; x += stepX) {
    for (let y = startY; y <= endY; y += stepY) {
      const px = x + cellW / 2;
      const py = y + cellH / 2;

      if (!pointInPolygon(px, py, blob.points)) continue;

      const key = getCellKey(x, y);
      nextCells[key] = previousCells[key] !== undefined ? previousCells[key] : true;
    }
  }

  blob.cells = nextCells;
}

function updateBlobScaleFromControls() {
  const blobScaleInput = document.getElementById('blobScale');
  const marginInput = document.getElementById('margin');

  blobTool.scale = Number(blobScaleInput?.value ?? 1) || 1;
  blobTool.cellWidth = 60;
  blobTool.cellHeight = 40;
  blobTool.margin = Number(marginInput?.value ?? 20) || 0;

  refreshBlobCounts();
  updateTotalRectCount();
}

function pointInPolygon(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function getBlobBounds(blob) {
  const xs = blob.points.map((point) => point.x);
  const ys = blob.points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function countCellsInBlob(blob) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return 0;
  ensureBlobCells(blob);
  return Object.keys(blob.cells || {}).filter((key) => blob.cells[key] === true).length;
}

function getBlobCellRects(blob, usedCellKeys = null) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return [];

  const rects = [];
  const keys = usedCellKeys || new Set();
  const { cellW, cellH, stepX, stepY } = getGridMetrics();
  const { startX, startY, endX, endY } = getGridBounds(getBlobBounds(blob));

  for (let x = startX; x <= endX; x += stepX) {
    for (let y = startY; y <= endY; y += stepY) {
      const key = getCellKey(x, y);
      if (keys.has(key)) continue;

      const px = x + cellW / 2;
      const py = y + cellH / 2;
      if (!pointInPolygon(px, py, blob.points)) continue;
      if (blob.cells && blob.cells[key] === false) continue;

      rects.push({ key, x, y, width: cellW, height: cellH });
      keys.add(key);
    }
  }

  return rects;
}

function updateBlobCellsAndCount(blob) {
  if (!blob) return;
  ensureBlobCells(blob);
  blob.count = countCellsInBlob(blob);
}

// -----------------------------------------------------------------------------
// Canvas rendering
// -----------------------------------------------------------------------------

function drawMeterGrid() {
  if (!blobTool.showMeterGrid) return;

  const reference = getTerrainReferenceMetrics();
  const meterWidth = reference.cellW / 0.6;
  const meterHeight = reference.cellH / 0.4;
  const topLeft = getScenePoint(0, 0);
  const bottomRight = getScenePoint(width, height);
  const startX = reference.originX + Math.floor((topLeft.x - reference.originX) / meterWidth) * meterWidth;
  const startY = reference.originY + Math.floor((topLeft.y - reference.originY) / meterHeight) * meterHeight;
  const endX = reference.originX + Math.ceil((bottomRight.x - reference.originX) / meterWidth) * meterWidth;
  const endY = reference.originY + Math.ceil((bottomRight.y - reference.originY) / meterHeight) * meterHeight;

  push();
  stroke(0, 13);
  strokeWeight(1 / blobTool.zoom);
  for (let x = startX; x <= endX; x += meterWidth) {
    line(x, topLeft.y, x, bottomRight.y);
  }
  for (let y = startY; y <= endY; y += meterHeight) {
    line(topLeft.x, y, bottomRight.x, y);
  }
  pop();
}

function drawBlob(blob, forceOutline = false, usedCellKeys = null, options = {}) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 2) return;
  const { drawCells = true, drawOutline = true } = options;
  if (!blob.cells || typeof blob.cells !== 'object') {
    blob.cells = {};
  }
  ensureBlobCells(blob);

  const fillColor = color(typeof fg !== 'undefined' ? fg : '#2ca06a');
  fillColor.setAlpha(255);

  push();

  const bounds = getBlobBounds(blob);
  if (drawCells) {
    const cellsToDraw = getBlobCellRects(blob, usedCellKeys);
    fillColor.setAlpha(255);
    noStroke();
    fill(fillColor);
    cellsToDraw.forEach((cell) => {
      rect(cell.x, cell.y, cell.width, cell.height);
    });
  }

  const isActiveDraft = blob === blobTool.activeBlob;
  const shouldDrawOutline = drawOutline && (forceOutline || isActiveDraft || blobTool.showBlobGuides);
  if (shouldDrawOutline) {
    const interactionScale = getRenderedBlobScale();
    noFill();
    stroke(18);
    strokeWeight(1.5 / interactionScale);
    drawingContext.setLineDash(forceOutline || isActiveDraft ? [] : [6 / interactionScale, 6 / interactionScale]);
    beginShape();
    blob.points.forEach((point) => vertex(point.x, point.y));
    endShape(isActiveDraft ? OPEN : CLOSE);
    drawingContext.setLineDash([]);

    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(16 / interactionScale);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    text(blob.count, centerX, centerY);
  }

  pop();
}

function createBlobFromSketch(points) {
  const cleaned = [];

  points.forEach((point) => {
    if (!cleaned.length || dist(point.x, point.y, cleaned[cleaned.length - 1].x, cleaned[cleaned.length - 1].y) > 3) {
      cleaned.push({ x: point.x, y: point.y });
    }
  });

  if (cleaned.length < 3) {
    const base = points[0] || { x: width * 0.5, y: height * 0.5 };
    cleaned.push({ x: base.x + 5, y: base.y + 5 });
    cleaned.push({ x: base.x - 5, y: base.y + 5 });
    cleaned.push({ x: base.x, y: base.y - 5 });
  }

  const blob = {
    points: cleaned,
    count: 0,
    cells: {},
  };

  updateBlobCellsAndCount(blob);
  return blob;
}

function blobsOverlap(blobA, blobB) {
  if (!blobA || !blobB || !Array.isArray(blobA.points) || !Array.isArray(blobB.points)) return false;

  const boundsA = getBlobBounds(blobA);
  const boundsB = getBlobBounds(blobB);
  if (boundsA.maxX < boundsB.minX || boundsA.minX > boundsB.maxX || boundsA.maxY < boundsB.minY || boundsA.minY > boundsB.maxY) {
    return false;
  }

  for (const point of blobA.points) {
    if (pointInPolygon(point.x, point.y, blobB.points)) {
      return true;
    }
  }

  for (const point of blobB.points) {
    if (pointInPolygon(point.x, point.y, blobA.points)) {
      return true;
    }
  }

  return false;
}

function mergeOverlappingBlobs(candidateBlob) {
  if (!candidateBlob) return null;

  blobTool.blobs.push(candidateBlob);
  return candidateBlob;
}

function addBlobAt(x, y) {
  const size = getDefaultBlobSize(120);
  const halfW = size.width / 2;
  const halfH = size.height / 2;

  const blob = createBlobFromSketch([
    { x: x - halfW, y: y },
    { x: x - halfW * 0.4, y: y - halfH },
    { x: x + halfW * 0.75, y: y - halfH * 0.7 },
    { x: x + halfW, y: y + 10 },
    { x: x + halfW * 0.35, y: y + halfH },
    { x: x - halfW * 0.6, y: y + halfH * 0.8 },
  ]);

  blobTool.blobs.push(blob);
}

function clearBlobs() {
  blobTool.blobs = [];
  blobTool.activeBlob = null;
  blobTool.rotationCenter = null;
  updateTotalRectCount();
}

function undoLastBlob() {
  if (!blobTool.blobs.length) return;
  blobTool.blobs.pop();
  updateTotalRectCount();
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------

function downloadExportBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function loadSvgAsset(url) {
  const response = await fetch(url);
  const source = await response.text();
  const documentNode = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = documentNode.documentElement;
  const serializer = new XMLSerializer();
  return {
    viewBox: root.getAttribute('viewBox') || `0 0 ${root.getAttribute('width')} ${root.getAttribute('height')}`,
    content: Array.from(root.childNodes).map((node) => serializer.serializeToString(node)).join(''),
  };
}

async function buildFullCanvasSvg() {
  if (!sceneLayer || !terrainLayer || !scaleLayer) return null;

  const sceneRect = sceneLayer.getBoundingClientRect();
  const terrainRect = terrainLayer.getBoundingClientRect();
  const scaleRect = scaleLayer.getBoundingClientRect();
  const [terrainAsset, scaleAsset] = await Promise.all([
    loadSvgAsset(terrainLayer.src),
    loadSvgAsset(scaleLayer.src),
  ]);

  const sceneTransform = `translate(${width / 2 + blobTool.viewportX} ${height / 2 + blobTool.viewportY}) scale(${blobTool.zoom}) translate(${-width / 2} ${-height / 2})`;
  const rotationCenter = getBlobTransformCenter();
  const blobTransform = `translate(${width / 2} ${height / 2}) scale(${getBlobScale()}) translate(${-width / 2} ${-height / 2}) translate(${rotationCenter.x} ${rotationCenter.y}) rotate(${blobTool.rotation}) translate(${-rotationCenter.x} ${-rotationCenter.y})`;

  let backgroundGridSvg = '';
  if (blobTool.showMeterGrid) {
    const reference = getTerrainReferenceMetrics();
    const meterWidth = reference.cellW / 0.6;
    const meterHeight = reference.cellH / 0.4;
    const topLeft = getScenePoint(0, 0);
    const bottomRight = getScenePoint(width, height);
    const startX = reference.originX + Math.floor((topLeft.x - reference.originX) / meterWidth) * meterWidth;
    const startY = reference.originY + Math.floor((topLeft.y - reference.originY) / meterHeight) * meterHeight;
    const endX = reference.originX + Math.ceil((bottomRight.x - reference.originX) / meterWidth) * meterWidth;
    const endY = reference.originY + Math.ceil((bottomRight.y - reference.originY) / meterHeight) * meterHeight;
    for (let x = startX; x <= endX; x += meterWidth) {
      backgroundGridSvg += `<line x1="${x}" y1="${topLeft.y}" x2="${x}" y2="${bottomRight.y}" />`;
    }
    for (let y = startY; y <= endY; y += meterHeight) {
      backgroundGridSvg += `<line x1="${topLeft.x}" y1="${y}" x2="${bottomRight.x}" y2="${y}" />`;
    }
  }

  const foregroundColor = document.getElementById('fg')?.value || '#2ca06a';
  const usedCellKeys = new Set();
  let cellsSvg = '';
  let guidesSvg = '';
  blobTool.blobs.forEach((blob) => {
    if (!blob?.points || blob.points.length < 3) return;
    getBlobCellRects(blob, usedCellKeys).forEach((cell) => {
      cellsSvg += `<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="${foregroundColor}" />`;
    });
    if (!blobTool.showBlobGuides) return;
    const points = blob.points.map((point) => `${point.x},${point.y}`).join(' ');
    const bounds = getBlobBounds(blob);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const interactionScale = getRenderedBlobScale();
    guidesSvg += `<polygon points="${points}" fill="none" stroke="#121212" stroke-width="${1.5 / interactionScale}" stroke-dasharray="${6 / interactionScale},${6 / interactionScale}" />`;
    guidesSvg += `<text x="${centerX}" y="${centerY}" font-size="${16 / interactionScale}" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" fill="#000000">${blob.count}</text>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff" />
    <g id="terrain">
      <svg x="${terrainRect.left - sceneRect.left}" y="${terrainRect.top - sceneRect.top}" width="${terrainRect.width}" height="${terrainRect.height}" viewBox="${terrainAsset.viewBox}">${terrainAsset.content}</svg>
    </g>
    <g id="scene" transform="${sceneTransform}">
      <g id="background-grid" fill="none" stroke="#000000" stroke-opacity="0.05" stroke-width="${1 / blobTool.zoom}">${backgroundGridSvg}</g>
      <g id="blobs" transform="${blobTransform}">
        <g id="blob-grid">${cellsSvg}</g>
        <g id="blob-guides">${guidesSvg}</g>
      </g>
    </g>
    <g id="scale">
      <svg x="${scaleRect.left - sceneRect.left}" y="${scaleRect.top - sceneRect.top}" width="${scaleRect.width}" height="${scaleRect.height}" viewBox="${scaleAsset.viewBox}">${scaleAsset.content}</svg>
    </g>
  </svg>`;
}

async function exportFullCanvasSvg() {
  const svg = await buildFullCanvasSvg();
  if (!svg) return;
  downloadExportBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'canvas-export.svg');
}

async function exportFullCanvasPng() {
  const svg = await buildFullCanvasSvg();
  if (!svg) return;

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.onload = () => {
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    output.getContext('2d').drawImage(image, 0, 0);
    URL.revokeObjectURL(svgUrl);
    output.toBlob((blob) => {
      if (blob) downloadExportBlob(blob, 'canvas-export.png');
    }, 'image/png');
  };
  image.onerror = () => URL.revokeObjectURL(svgUrl);
  image.src = svgUrl;
}

function resizeCanvasFromInputs() {
  const widthInput = document.getElementById('canvasWidth');
  const heightInput = document.getElementById('canvasHeight');

  const nextWidth = Number(widthInput?.value ?? width) || width;
  const nextHeight = Number(heightInput?.value ?? height) || height;

  if (nextWidth > 0 && nextHeight > 0) {
    resizeCanvas(nextWidth, nextHeight);
    syncSceneLayer();
  }
}

// -----------------------------------------------------------------------------
// UI setup and controls
// -----------------------------------------------------------------------------

function createSceneLayers() {
  const canvasWrap = document.getElementById('canvasWrap');

  sceneLayer = document.createElement('div');
  sceneLayer.id = 'sceneLayer';
  canvasWrap.appendChild(sceneLayer);

  terrainLayer = document.createElement('img');
  terrainLayer.id = 'terrainLayer';
  terrainLayer.src = 'assets/terrein.svg';
  terrainLayer.alt = '';
  terrainLayer.addEventListener('load', syncSceneLayer);
  sceneLayer.appendChild(terrainLayer);

  scaleLayer = document.createElement('img');
  scaleLayer.id = 'scaleLayer';
  scaleLayer.src = 'assets/schaal.svg';
  scaleLayer.alt = 'Kratje: 60 × 40 cm';
  sceneLayer.appendChild(scaleLayer);
}

function bindControls() {
  const controls = {
    canvasWidth: document.getElementById('canvasWidth'),
    canvasHeight: document.getElementById('canvasHeight'),
    newBlob: document.getElementById('newBlob'),
    clearBlobs: document.getElementById('clearBlobs'),
    undoBlob: document.getElementById('undoBlob'),
    blobScale: document.getElementById('blobScale'),
    margin: document.getElementById('margin'),
    zoom: document.getElementById('zoom'),
    showMeterGrid: document.getElementById('showMeterGrid'),
    showBlobGuides: document.getElementById('showBlobGuides'),
    blobRotation: document.getElementById('blobRotation'),
    exportPng: document.getElementById('exportPng'),
    exportSvg: document.getElementById('exportSvg'),
  };

  if (controls.canvasWidth) controls.canvasWidth.value = String(width);
  if (controls.canvasHeight) controls.canvasHeight.value = String(height);

  controls.newBlob?.addEventListener('click', () => addBlobAt(width * 0.5, height * 0.5));
  controls.clearBlobs?.addEventListener('click', clearBlobs);
  controls.undoBlob?.addEventListener('click', undoLastBlob);
  controls.blobScale?.addEventListener('input', updateBlobScaleFromControls);
  controls.margin?.addEventListener('input', updateBlobScaleFromControls);
  controls.canvasWidth?.addEventListener('change', resizeCanvasFromInputs);
  controls.canvasHeight?.addEventListener('change', resizeCanvasFromInputs);
  controls.exportPng?.addEventListener('click', exportFullCanvasPng);
  controls.exportSvg?.addEventListener('click', exportFullCanvasSvg);

  controls.zoom?.addEventListener('input', (event) => {
    setZoomAroundPoint(Number(event.target.value) || 1, width / 2, height / 2);
  });
  controls.showMeterGrid?.addEventListener('change', (event) => {
    blobTool.showMeterGrid = event.target.checked;
  });
  controls.showBlobGuides?.addEventListener('change', (event) => {
    blobTool.showBlobGuides = event.target.checked;
  });
  controls.blobRotation?.addEventListener('input', (event) => {
    setBlobRotation(Number(event.target.value) || 0);
  });
}

function setup() {
  createSceneLayers();
  const canvas = createCanvas(CANVAS_DEFAULTS.width, CANVAS_DEFAULTS.height);
  canvas.parent(sceneLayer);
  canvas.elt.addEventListener('mousedown', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  canvas.elt.addEventListener('auxclick', (event) => event.preventDefault());
  syncSceneLayer();
  ellipseMode(CENTER);
  frameRate(30);

  window.blobTool = blobTool;
  updateBlobScaleFromControls();
  config();
  bindControls();
}

// -----------------------------------------------------------------------------
// Pointer hit testing and editing
// -----------------------------------------------------------------------------

function getPointUnderMouse(x, y, radius = 10) {
  // Check altijd de actieve blob waar je nu aan werkt
  if (blobTool.activeBlob) {
    for (let i = 0; i < blobTool.activeBlob.points.length; i++) {
      const p = blobTool.activeBlob.points[i];
      if (dist(x, y, p.x, p.y) <= radius) {
        return { blob: blobTool.activeBlob, point: p, index: i, isActive: true };
      }
    }
  }

  if (blobTool.showBlobGuides) {
    for (const blob of blobTool.blobs) {
      if (!blob || !blob.points) continue;
      for (let i = 0; i < blob.points.length; i++) {
        const p = blob.points[i];
        if (dist(x, y, p.x, p.y) <= radius) {
          return { blob, point: p, index: i, isActive: false };
        }
      }
    }
  }
  return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return { d: dist(px, py, x1, y1), projX: x1, projY: y1 };
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return { d: dist(px, py, projX, projY), projX, projY };
}

function getEdgeUnderMouse(x, y, maxDist = 8) {
  let closestEdge = null;
  let minD = maxDist;

  // Check alle reeds gemaakte (gesloten) blobs
  if (blobTool.showBlobGuides) {
    blobTool.blobs.forEach((blob) => {
      if (!blob || !blob.points || blob.points.length < 3) return;
      const len = blob.points.length;
      for (let i = 0; i < len; i++) {
        const p1 = blob.points[i];
        const p2 = blob.points[(i + 1) % len];
        const res = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
        if (res.d < minD) {
          minD = res.d;
          closestEdge = { blob, insertIndex: i + 1, point: { x: res.projX, y: res.projY } };
        }
      }
    });
  }

  // Check de actieve open blob
  if (blobTool.activeBlob && blobTool.activeBlob.points.length >= 2) {
    const pts = blobTool.activeBlob.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const res = distToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      if (res.d < minD) {
        minD = res.d;
        closestEdge = { blob: blobTool.activeBlob, insertIndex: i + 1, point: { x: res.projX, y: res.projY } };
      }
    }
  }

  return closestEdge;
}

function getBlobUnderMouse(x, y) {
  for (let index = blobTool.blobs.length - 1; index >= 0; index -= 1) {
    const blob = blobTool.blobs[index];
    if (blob?.points?.length >= 3 && pointInPolygon(x, y, blob.points)) return blob;
  }
  return null;
}

function isMiddlePointer(event) {
  return event?.button === 1 || mouseButton === CENTER;
}

function drawBlobHandles(blob) {
  if (!blob || !blob.points) return;

  const interactionScale = getRenderedBlobScale();
  push();
  stroke(30);
  strokeWeight(1.5 / interactionScale);

  blob.points.forEach((p, idx) => {
    // Punten vergroot (startpunt 14px, overige punten 11px)
    if (blob === blobTool.activeBlob && idx === 0) {
      fill('#ff3333');
      ellipse(p.x, p.y, 14 / interactionScale, 14 / interactionScale);
    } else {
      fill(255);
      ellipse(p.x, p.y, 11 / interactionScale, 11 / interactionScale);
    }
  });
  pop();
}

function draw() {
  clear();

  push();
  applySceneZoom();
  drawMeterGrid();
  const sceneMouse = getScenePoint(mouseX, mouseY);
  const blobMouse = getBlobPoint(sceneMouse.x, sceneMouse.y);

  push();
  applyBlobTransform();

  const usedCellKeys = new Set();

  // Teken definitieve blobs
  blobTool.blobs.forEach((blob) => {
    drawBlob(blob, false, usedCellKeys);
    if (blobTool.showBlobGuides) drawBlobHandles(blob);
  });

  // Teken actieve blob + preview lijn naar muis
  if (blobTool.activeBlob) {
    drawBlob(blobTool.activeBlob, true, usedCellKeys);

    if (blobTool.activeBlob.points.length > 0) {
      const pts = blobTool.activeBlob.points;
      const lastPt = pts[pts.length - 1];
      const firstPt = pts[0];

      push();
      stroke(120);
      const interactionScale = getRenderedBlobScale();
      strokeWeight(1 / interactionScale);
      drawingContext.setLineDash([4 / interactionScale, 4 / interactionScale]);

      if (pts.length >= 3 && dist(blobMouse.x, blobMouse.y, firstPt.x, firstPt.y) < 15 / interactionScale) {
        stroke('#ff3333');
        strokeWeight(2 / interactionScale);
        line(lastPt.x, lastPt.y, firstPt.x, firstPt.y);
      } else {
        line(lastPt.x, lastPt.y, blobMouse.x, blobMouse.y);
      }

      drawingContext.setLineDash([]);
      pop();
    }

    // Handles van actieve blob altijd tonen tijdens het tekenen
    drawBlobHandles(blobTool.activeBlob);
  }

  pop();
  pop();
  updateTotalRectCount();
}

function toggleCellAtPoint(x, y) {
  for (const blob of blobTool.blobs) {
    if (!blob || !blob.cells) continue;

    ensureBlobCells(blob);

    const { cellW, cellH, stepX, stepY, originX, originY } = getGridMetrics();
    const cellX = originX + Math.floor((x - originX) / stepX) * stepX;
    const cellY = originY + Math.floor((y - originY) / stepY) * stepY;
    const key = getCellKey(cellX, cellY);
    const cellCenterX = cellX + cellW / 2;
    const cellCenterY = cellY + cellH / 2;

    if (!pointInPolygon(cellCenterX, cellCenterY, blob.points)) continue;

    if (!(key in blob.cells)) {
      blob.cells[key] = false;
    }

    blob.cells[key] = !blob.cells[key];
    blob.count = countCellsInBlob(blob);
    updateTotalRectCount();
    return true;
  }

  return false;
}

function mousePressed(event) {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;

  if (isMiddlePointer(event)) {
    viewportDragInfo = { x: mouseX, y: mouseY };
    return false;
  }

  const sceneMouse = getScenePoint(mouseX, mouseY);
  const blobMouse = getBlobPoint(sceneMouse.x, sceneMouse.y);

  // 1. Check direct punt aangeklikt
  const pointHit = getPointUnderMouse(blobMouse.x, blobMouse.y, 10 / getRenderedBlobScale());
  if (pointHit) {
    // Klik op startpunt van actieve blob -> Vorm sluiten & opslaan!
    if (pointHit.isActive && pointHit.index === 0 && blobTool.activeBlob.points.length >= 3) {
      const finalizedBlob = createBlobFromSketch(blobTool.activeBlob.points);
      mergeOverlappingBlobs(finalizedBlob);
      blobTool.activeBlob = null;
      updateTotalRectCount();
      return;
    }

    // Anders: Bestaand punt vastpakken om te slepen
    draggedPointInfo = pointHit;
    return;
  }

  // 2. Check op een lijn geklikt -> Nieuw punt op die lijn toevoegen!
  const edgeHit = getEdgeUnderMouse(blobMouse.x, blobMouse.y, 8 / getRenderedBlobScale());
  if (edgeHit) {
    edgeHit.blob.points.splice(edgeHit.insertIndex, 0, edgeHit.point);
    updateBlobCellsAndCount(edgeHit.blob);

    // Pak het nieuw gemaakte punt meteen vast om te kunnen slepen
    draggedPointInfo = {
      blob: edgeHit.blob,
      point: edgeHit.blob.points[edgeHit.insertIndex],
      index: edgeHit.insertIndex,
      isActive: edgeHit.blob === blobTool.activeBlob,
    };
    updateTotalRectCount();
    return;
  }

  const blobHit = getBlobUnderMouse(blobMouse.x, blobMouse.y);
  if (blobHit && !blobTool.activeBlob) {
    draggedBlobInfo = {
      blob: blobHit,
      x: blobMouse.x,
      y: blobMouse.y,
    };
    return;
  }

  // Stel het plaatsen van een punt uit totdat duidelijk is of dit een klik of sleep is.
  pendingCanvasInteraction = {
    startX: mouseX,
    startY: mouseY,
    lastX: mouseX,
    lastY: mouseY,
    dragged: false,
    blobX: blobMouse.x,
    blobY: blobMouse.y,
  };
}

function commitCanvasClick(interaction) {
  if (!interaction) return;
  if (blobTool.activeBlob) {
    // Voeg nieuw hoekpunt toe aan de huidige vorm
    blobTool.activeBlob.points.push({ x: interaction.blobX, y: interaction.blobY });
    updateBlobCellsAndCount(blobTool.activeBlob);
  } else {
    // Start een splinternieuwe vector blob
    blobTool.activeBlob = {
      points: [{ x: interaction.blobX, y: interaction.blobY }],
      count: 0,
      cells: {},
    };
  }
}

function mouseDragged(event) {
  if (viewportDragInfo && isMiddlePointer(event)) {
    blobTool.viewportX += mouseX - viewportDragInfo.x;
    blobTool.viewportY += mouseY - viewportDragInfo.y;
    viewportDragInfo = { x: mouseX, y: mouseY };
    syncSceneLayer();
    return false;
  }

  if (pendingCanvasInteraction) {
    const moved = dist(mouseX, mouseY, pendingCanvasInteraction.startX, pendingCanvasInteraction.startY);
    if (moved >= 4) pendingCanvasInteraction.dragged = true;
    if (pendingCanvasInteraction.dragged) {
      blobTool.viewportX += mouseX - pendingCanvasInteraction.lastX;
      blobTool.viewportY += mouseY - pendingCanvasInteraction.lastY;
      pendingCanvasInteraction.lastX = mouseX;
      pendingCanvasInteraction.lastY = mouseY;
      syncSceneLayer();
      return false;
    }
  }

  if (draggedPointInfo) {
    const sceneMouse = getScenePoint(mouseX, mouseY);
    const blobMouse = getBlobPoint(sceneMouse.x, sceneMouse.y);
    draggedPointInfo.point.x = blobMouse.x;
    draggedPointInfo.point.y = blobMouse.y;

    updateBlobCellsAndCount(draggedPointInfo.blob);
    updateTotalRectCount();
    return;
  }

  if (draggedBlobInfo) {
    const sceneMouse = getScenePoint(mouseX, mouseY);
    const blobMouse = getBlobPoint(sceneMouse.x, sceneMouse.y);
    const deltaX = blobMouse.x - draggedBlobInfo.x;
    const deltaY = blobMouse.y - draggedBlobInfo.y;

    draggedBlobInfo.blob.points.forEach((point) => {
      point.x += deltaX;
      point.y += deltaY;
    });
    draggedBlobInfo.x = blobMouse.x;
    draggedBlobInfo.y = blobMouse.y;
    updateBlobCellsAndCount(draggedBlobInfo.blob);
    updateTotalRectCount();
  }
}

function mouseReleased() {
  if (pendingCanvasInteraction && !pendingCanvasInteraction.dragged) {
    commitCanvasClick(pendingCanvasInteraction);
  }
  pendingCanvasInteraction = null;
  draggedPointInfo = null;
  draggedBlobInfo = null;
  viewportDragInfo = null;
}

function mouseWheel(event) {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  const zoomFactor = event.delta > 0 ? 0.9 : 1.1;
  setZoomAroundPoint(blobTool.zoom * zoomFactor, mouseX, mouseY);
  return false;
}

// Extra: Dubbelklik op een punt om het te verwijderen
function doubleClicked() {
  const sceneMouse = getScenePoint(mouseX, mouseY);
  const blobMouse = getBlobPoint(sceneMouse.x, sceneMouse.y);
  const hit = getPointUnderMouse(blobMouse.x, blobMouse.y, 10 / getRenderedBlobScale());
  if (hit && hit.blob.points.length > 3) {
    hit.blob.points.splice(hit.index, 1);
    updateBlobCellsAndCount(hit.blob);
    updateTotalRectCount();
  }
}

function keyPressed(e) {
  const target = e?.target;
  const isEditing = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

  if (!isEditing && (e.key === '+' || e.key === '=')) {
    setZoomAroundPoint(blobTool.zoom * 1.1, width / 2, height / 2);
    return false;
  }

  if (!isEditing && (e.key === '-' || e.key === '_')) {
    setZoomAroundPoint(blobTool.zoom / 1.1, width / 2, height / 2);
    return false;
  }

  // Controleer op Ctrl+Z of Cmd+Z
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    if (blobTool.activeBlob && blobTool.activeBlob.points.length > 0) {
      // 1. Verwijder laatst geplaatste punt van actieve blob
      blobTool.activeBlob.points.pop();

      if (blobTool.activeBlob.points.length === 0) {
        blobTool.activeBlob = null;
      } else {
        updateBlobCellsAndCount(blobTool.activeBlob);
      }
    } else {
      // 2. Geen actieve blob -> Maak de laatst voltooide blob ongedaan
      undoLastBlob();
    }

    updateTotalRectCount();
    return false; // Voorkom standaard undo van de browser
  }

  // Enter = Vorm sluiten
  if (keyCode === ENTER && blobTool.activeBlob && blobTool.activeBlob.points.length >= 3) {
    const finalizedBlob = createBlobFromSketch(blobTool.activeBlob.points);
    mergeOverlappingBlobs(finalizedBlob);
    blobTool.activeBlob = null;
    updateTotalRectCount();
  } 
  // Escape = Tekenen van huidige vorm annuleren
  else if (keyCode === ESCAPE) {
    blobTool.activeBlob = null;
    updateTotalRectCount();
  }
}

function config() {
  window.PARAMS.register();

  const resetButton = document.getElementById('reset');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      window.PARAMS.resetDefaults();
    });
  }

  const randomButton = document.getElementById('randomize');
  if (randomButton) {
    randomButton.addEventListener('click', () => {
      window.PARAMS.randomize();
    });
  }

  window.EXPORTS.register();
  if (window.SCENES) {
    window.SCENES.register();
  }
}
