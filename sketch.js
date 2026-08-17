const blobTool = {
  blobs: [],
  activeBlob: null,
  scale: 1,
  cellWidth: 60,
  cellHeight: 40,
  margin: 20,
  showOutlines: true,
};

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
    if (!blob) return;
    ensureBlobCells(blob);
    blob.count = countCellsInBlob(blob);
  });
}

function updateTotalRectCount() {
  const totalEl = document.getElementById('totalRectCount');
  if (!totalEl) return;
  totalEl.textContent = `${getTotalRectCount()} Vierkantjes`;
}

function getCellKey(x, y) {
  return `${Math.round(x)}|${Math.round(y)}`;
}

function ensureBlobCells(blob) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return;

  const previousCells = blob.cells && typeof blob.cells === 'object' ? blob.cells : {};
  const nextCells = {};

  const bounds = getBlobBounds(blob);
  const cellW = blobTool.cellWidth;
  const cellH = blobTool.cellHeight;
  const gap = Math.max(0, blobTool.margin);
  const stepX = cellW + gap;
  const stepY = cellH + gap;
  const startX = Math.floor(bounds.minX / stepX) * stepX;
  const startY = Math.floor(bounds.minY / stepY) * stepY;
  const endX = Math.ceil(bounds.maxX / stepX) * stepX;
  const endY = Math.ceil(bounds.maxY / stepY) * stepY;

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

function updateCellSizeFromControls() {
  const cellWidthInput = document.getElementById('cellWidth');
  const marginInput = document.getElementById('margin');
  const heightReadout = document.getElementById('cellHeightReadout');

  const sliderValue = Number(cellWidthInput?.value ?? 60) || 60;
  blobTool.scale = sliderValue / 60;
  blobTool.cellWidth = 60 * blobTool.scale;
  blobTool.cellHeight = 40 * blobTool.scale;
  blobTool.margin = Number(marginInput?.value ?? 20) || 0;

  if (heightReadout) {
    heightReadout.textContent = String(blobTool.cellHeight.toFixed(2));
  }

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
  const bounds = getBlobBounds(blob);
  const cellW = blobTool.cellWidth;
  const cellH = blobTool.cellHeight;
  const gap = Math.max(0, blobTool.margin);
  const stepX = cellW + gap;
  const stepY = cellH + gap;
  const startX = Math.floor(bounds.minX / stepX) * stepX;
  const startY = Math.floor(bounds.minY / stepY) * stepY;
  const endX = Math.ceil(bounds.maxX / stepX) * stepX;
  const endY = Math.ceil(bounds.maxY / stepY) * stepY;

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

function drawScaleBar() {
  const x = 40;
  const y = height - 40;
  const meterPx = Math.min(200, Math.max(20, blobTool.cellWidth * 1.5));
  const label = '1 m';
  const endX = x + meterPx;

  stroke(30);
  strokeWeight(1.25);
  line(x, y, endX, y);
  line(x, y - 6, x, y + 6);
  line(endX, y - 6, endX, y + 6);

  noStroke();
  textAlign(CENTER, CENTER);
  textSize(11);
  fill(0);
  text(label, x + meterPx / 2, y - 12);
  textAlign(LEFT, CENTER);
  text('1 cell = 60 × 40 cm', endX + 12, y + 2);
  fill(255);
}

function drawBlob(blob, forceOutline = false, usedCellKeys = null) {
  if (!blob || !Array.isArray(blob.points) || blob.points.length < 2) return;
  if (!blob.cells || typeof blob.cells !== 'object') {
    blob.cells = {};
  }
  ensureBlobCells(blob);

  const fillColor = color(typeof fg !== 'undefined' ? fg : '#2ca06a');
  fillColor.setAlpha(255);

  push();

  const isActiveDraft = blob === blobTool.activeBlob;
  const shouldDrawOutline = forceOutline || isActiveDraft || blobTool.showOutlines;
  if (shouldDrawOutline) {
    noFill();
    stroke(18);
    strokeWeight(1.2);
    drawingContext.setLineDash(forceOutline || isActiveDraft ? [0, 0] : [6, 6]);
    beginShape();
    blob.points.forEach((point) => vertex(point.x, point.y));
    endShape(CLOSE);
    drawingContext.setLineDash([]);
  }

  const bounds = getBlobBounds(blob);
  const cellsToDraw = getBlobCellRects(blob, usedCellKeys);

  noStroke();
  fill(fillColor);

  cellsToDraw.forEach((cell) => {
    rect(cell.x, cell.y, cell.width, cell.height);
  });

  noStroke();
  fill(0);
  textAlign(CENTER, CENTER);
  textSize(12);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  text(blob.count, centerX, centerY);

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

  ensureBlobCells(blob);
  blob.count = countCellsInBlob(blob);
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
  updateTotalRectCount();
}

function undoLastBlob() {
  if (!blobTool.blobs.length) return;
  blobTool.blobs.pop();
  updateTotalRectCount();
}

function exportBlobRectsSvg() {
  const canvasWidth = width;
  const canvasHeight = height;
  const backgroundColor = document.getElementById('bg')?.value || '#ffffff';

  const rects = [];
  const usedCellKeys = new Set();
  blobTool.blobs.forEach((blob) => {
    if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return;

    getBlobCellRects(blob, usedCellKeys).forEach((cell) => {
      rects.push({
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
        fill: '#2ca06a',
      });
    });
  });

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
      <rect width="100%" height="100%" fill="${backgroundColor}" />
      ${rects
        .map(
          (rect) =>
            `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${rect.fill}" />`
        )
        .join('')}
    </svg>
  `;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'blob-grid-export.svg';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resizeCanvasFromInputs() {
  const widthInput = document.getElementById('canvasWidth');
  const heightInput = document.getElementById('canvasHeight');

  const nextWidth = Number(widthInput?.value ?? width) || width;
  const nextHeight = Number(heightInput?.value ?? height) || height;

  if (nextWidth > 0 && nextHeight > 0) {
    resizeCanvas(nextWidth, nextHeight);
  }
}

function setup() {
  createCanvas(1200, 750).parent('canvasWrap');
  ellipseMode(CENTER);
  frameRate(30);

  const canvasWidthInput = document.getElementById('canvasWidth');
  const canvasHeightInput = document.getElementById('canvasHeight');
  if (canvasWidthInput) canvasWidthInput.value = String(width);
  if (canvasHeightInput) canvasHeightInput.value = String(height);

  window.blobTool = blobTool;
  updateCellSizeFromControls();
  config();

  const newBlobButton = document.getElementById('newBlob');
  if (newBlobButton) {
    newBlobButton.addEventListener('click', () => {
      addBlobAt(width * 0.5, height * 0.5);
    });
  }

  const clearBlobsButton = document.getElementById('clearBlobs');
  if (clearBlobsButton) {
    clearBlobsButton.addEventListener('click', clearBlobs);
  }

  const undoBlobButton = document.getElementById('undoBlob');
  if (undoBlobButton) {
    undoBlobButton.addEventListener('click', undoLastBlob);
  }

  const cellWidthInput = document.getElementById('cellWidth');
  const marginInput = document.getElementById('margin');
  const showOutlinesInput = document.getElementById('showOutlines');
  const exportSvgButton = document.getElementById('exportSvg');

  if (cellWidthInput) {
    cellWidthInput.addEventListener('input', updateCellSizeFromControls);
  }
  if (marginInput) {
    marginInput.addEventListener('input', updateCellSizeFromControls);
  }
  if (showOutlinesInput) {
    showOutlinesInput.addEventListener('change', (event) => {
      blobTool.showOutlines = !!event.target.checked;
    });
  }
  if (canvasWidthInput) {
    canvasWidthInput.addEventListener('change', resizeCanvasFromInputs);
  }
  if (canvasHeightInput) {
    canvasHeightInput.addEventListener('change', resizeCanvasFromInputs);
  }
  if (exportSvgButton) {
    exportSvgButton.addEventListener('click', exportBlobRectsSvg);
  }
}

function draw() {
  clear();
  background(typeof bg !== 'undefined' ? bg : '#ffffff');

  const usedCellKeys = new Set();
  blobTool.blobs.forEach((blob) => drawBlob(blob, false, usedCellKeys));

  if (blobTool.activeBlob) {
    drawBlob(blobTool.activeBlob, true, usedCellKeys);
  }

  drawScaleBar();
  updateTotalRectCount();
}

function toggleCellAtPoint(x, y) {
  for (const blob of blobTool.blobs) {
    if (!blob || !blob.cells) continue;

    ensureBlobCells(blob);

    const gap = Math.max(0, blobTool.margin);
    const cellX = Math.floor(x / (blobTool.cellWidth + gap)) * (blobTool.cellWidth + gap);
    const cellY = Math.floor(y / (blobTool.cellHeight + gap)) * (blobTool.cellHeight + gap);
    const key = getCellKey(cellX, cellY);
    const cellCenterX = cellX + blobTool.cellWidth / 2;
    const cellCenterY = cellY + blobTool.cellHeight / 2;

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

function mousePressed() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;

  if (toggleCellAtPoint(mouseX, mouseY)) {
    updateTotalRectCount();
    return;
  }

  blobTool.activeBlob = {
    points: [{ x: mouseX, y: mouseY }],
    count: 0,
    cells: {},
  };
}

function mouseDragged() {
  if (!blobTool.activeBlob) return;

  const last = blobTool.activeBlob.points[blobTool.activeBlob.points.length - 1];
  if (!last) return;

  const distance = dist(mouseX, mouseY, last.x, last.y);
  if (distance > 4) {
    blobTool.activeBlob.points.push({ x: mouseX, y: mouseY });
  }

  blobTool.activeBlob.count = countCellsInBlob(blobTool.activeBlob);
}

function mouseReleased() {
  if (!blobTool.activeBlob) return;

  if (blobTool.activeBlob.points.length >= 3) {
    const finalizedBlob = createBlobFromSketch(blobTool.activeBlob.points);
    mergeOverlappingBlobs(finalizedBlob);
  }

  blobTool.activeBlob = null;
  updateTotalRectCount();
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
