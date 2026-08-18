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
  totalEl.textContent = `${getTotalRectCount()} VIERKANTJES`;
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
  text('1 Vierkant = 60 × 40 cm', endX + 12, y + 2);
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

  // 1. Teken eerst de gekleurde vakjes (onderlaag)
  const bounds = getBlobBounds(blob);
  const cellsToDraw = getBlobCellRects(blob, usedCellKeys);

  noStroke();
  fill(fillColor);
  cellsToDraw.forEach((cell) => {
    rect(cell.x, cell.y, cell.width, cell.height);
  });

  // 2. Teken de omtrek BBOVENOP de vakjes
  const isActiveDraft = blob === blobTool.activeBlob;
  const shouldDrawOutline = forceOutline || isActiveDraft || blobTool.showOutlines;
  if (shouldDrawOutline) {
    noFill();
    stroke(18);
    strokeWeight(1.5);
    drawingContext.setLineDash(forceOutline || isActiveDraft ? [0, 0] : [6, 6]);
    beginShape();
    blob.points.forEach((point) => vertex(point.x, point.y));
    endShape(isActiveDraft ? OPEN : CLOSE);
    drawingContext.setLineDash([]);

    // 3. Teken de cijfertekst BOVENOP de omtrek (groter gemaakt naar 16px)
    noStroke();
    fill(0);
    textAlign(CENTER, CENTER);
    textSize(16); // Grotere tekst`
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

  // 1. Cellen (Vierkantjes)[cite: 1]
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

  // 2. Omtrekken en getallen (indien showOutlines aan staat)[cite: 1]
  let outlinesSvg = '';
  let textSvg = '';

  if (blobTool.showOutlines) {
    blobTool.blobs.forEach((blob) => {
      if (!blob || !Array.isArray(blob.points) || blob.points.length < 3) return;

      const pointsStr = blob.points.map((p) => `${p.x},${p.y}`).join(' ');
      outlinesSvg += `<polygon points="${pointsStr}" fill="none" stroke="#121212" stroke-width="1.2" stroke-dasharray="6,6" />\n`;

      const bounds = getBlobBounds(blob);
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      textSvg += `<text x="${centerX}" y="${centerY}" font-size="14" font-family="sans-serif" text-anchor="middle" dominant-baseline="central" fill="#000000">${blob.count}</text>\n`;
    });
  }

  // 3. Schaalbalk[cite: 1]
  const scaleX = 40;
  const scaleY = height - 40;
  const meterPx = Math.min(200, Math.max(20, blobTool.cellWidth * 1.5));
  const scaleSvg = `
    <line x1="${scaleX}" y1="${scaleY}" x2="${scaleX + meterPx}" y2="${scaleY}" stroke="#1e1e1e" stroke-width="1.25" />
    <line x1="${scaleX}" y1="${scaleY - 6}" x2="${scaleX}" y2="${scaleY + 6}" stroke="#1e1e1e" stroke-width="1.25" />
    <line x1="${scaleX + meterPx}" y1="${scaleY - 6}" x2="${scaleX + meterPx}" y2="${scaleY + 6}" stroke="#1e1e1e" stroke-width="1.25" />
    <text x="${scaleX + meterPx / 2}" y="${scaleY - 12}" font-size="11" font-family="sans-serif" text-anchor="middle" fill="#000000">1 m</text>
    <text x="${scaleX + meterPx + 12}" y="${scaleY + 4}" font-size="11" font-family="sans-serif" text-anchor="start" fill="#000000">1 cell = 60 × 40 cm</text>
  `;

  // Samenvoegen in SVG string[cite: 1]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
      <rect width="100%" height="100%" fill="${backgroundColor}" />
      ${rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${r.fill}" />`).join('\n')}
      ${outlinesSvg}
      ${textSvg}
      ${scaleSvg}
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

let draggedPointInfo = null;

function getPointUnderMouse(x, y, radius = 10) {
  // Check altijd de actieve blob waar je nu aan werkt
  if (blobTool.activeBlob) {
    for (let i = 0; i < blobTool.activeBlob.points.length; i++) {
      let p = blobTool.activeBlob.points[i];
      if (dist(x, y, p.x, p.y) <= radius) {
        return { blob: blobTool.activeBlob, point: p, index: i, isActive: true };
      }
    }
  }

  // Check getekende blobs ALLEEN als showOutlines aan staat
  if (blobTool.showOutlines) {
    for (let blob of blobTool.blobs) {
      if (!blob || !blob.points) continue;
      for (let i = 0; i < blob.points.length; i++) {
        let p = blob.points[i];
        if (dist(x, y, p.x, p.y) <= radius) {
          return { blob, point: p, index: i, isActive: false };
        }
      }
    }
  }
  return null;
}

// 2. Aangepast: Zoek lijnstuk onder muis (rekening houdend met showOutlines)
function getEdgeUnderMouse(x, y, maxDist = 8) {
  let closestEdge = null;
  let minD = maxDist;

  // Check getekende blobs ALLEEN als showOutlines aan staat
  if (blobTool.showOutlines) {
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

// Helper: Bereken afstand van punt (px, py) tot lijnstuk (x1,y1)-(x2,y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return { d: dist(px, py, x1, y1), projX: x1, projY: y1 };
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return { d: dist(px, py, projX, projY), projX, projY };
}

// 2. Zoek of de muis boven een lijnstuk/rand van een blob hangt
function getEdgeUnderMouse(x, y, maxDist = 8) {
  let closestEdge = null;
  let minD = maxDist;

  // Check alle reeds gemaakte (gesloten) blobs
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

// Teken handles op de hoekpunten
function drawBlobHandles(blob) {
  if (!blob || !blob.points) return;

  push();
  stroke(30);
  strokeWeight(1.5);

  blob.points.forEach((p, idx) => {
    // Punten vergroot (startpunt 14px, overige punten 11px)
    if (blob === blobTool.activeBlob && idx === 0) {
      fill('#ff3333');
      ellipse(p.x, p.y, 14, 14);
    } else {
      fill(255);
      ellipse(p.x, p.y, 11, 11);
    }
  });
  pop();
}

function draw() {
  clear();
  background(typeof bg !== 'undefined' ? bg : '#ffffff');

  const usedCellKeys = new Set();

  // Teken definitieve blobs
  blobTool.blobs.forEach((blob) => {
    drawBlob(blob, false, usedCellKeys);
    // Teken alleen handles als de checkbox aan staat
    if (blobTool.showOutlines) {
      drawBlobHandles(blob);
    }
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
      strokeWeight(1);
      drawingContext.setLineDash([4, 4]);

      if (pts.length >= 3 && dist(mouseX, mouseY, firstPt.x, firstPt.y) < 15) {
        stroke('#ff3333');
        strokeWeight(2);
        line(lastPt.x, lastPt.y, firstPt.x, firstPt.y);
      } else {
        line(lastPt.x, lastPt.y, mouseX, mouseY);
      }

      drawingContext.setLineDash([]);
      pop();
    }

    // Handles van actieve blob altijd tonen tijdens het tekenen
    drawBlobHandles(blobTool.activeBlob);
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

  // 1. Check direct punt aangeklikt
  const pointHit = getPointUnderMouse(mouseX, mouseY, 10);
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
  const edgeHit = getEdgeUnderMouse(mouseX, mouseY, 8);
  if (edgeHit) {
    edgeHit.blob.points.splice(edgeHit.insertIndex, 0, edgeHit.point);
    ensureBlobCells(edgeHit.blob);
    edgeHit.blob.count = countCellsInBlob(edgeHit.blob);

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

  // 3. Klik in lege ruimte
  if (blobTool.activeBlob) {
    // Voeg nieuw hoekpunt toe aan de huidige vorm
    blobTool.activeBlob.points.push({ x: mouseX, y: mouseY });
    ensureBlobCells(blobTool.activeBlob);
    blobTool.activeBlob.count = countCellsInBlob(blobTool.activeBlob);
  } else {
    // Start een splinternieuwe vector blob
    blobTool.activeBlob = {
      points: [{ x: mouseX, y: mouseY }],
      count: 0,
      cells: {},
    };
  }
}

function mouseDragged() {
  if (draggedPointInfo) {
    draggedPointInfo.point.x = mouseX;
    draggedPointInfo.point.y = mouseY;

    ensureBlobCells(draggedPointInfo.blob);
    draggedPointInfo.blob.count = countCellsInBlob(draggedPointInfo.blob);
    updateTotalRectCount();
  }
}

function mouseReleased() {
  draggedPointInfo = null;
}

// Extra: Dubbelklik op een punt om het te verwijderen
function doubleClicked() {
  const hit = getPointUnderMouse(mouseX, mouseY, 10);
  if (hit && hit.blob.points.length > 3) {
    hit.blob.points.splice(hit.index, 1);
    ensureBlobCells(hit.blob);
    hit.blob.count = countCellsInBlob(hit.blob);
    updateTotalRectCount();
  }
}

function keyPressed(e) {
  // Controleer op Ctrl+Z of Cmd+Z
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    if (blobTool.activeBlob && blobTool.activeBlob.points.length > 0) {
      // 1. Verwijder laatst geplaatste punt van actieve blob
      blobTool.activeBlob.points.pop();

      if (blobTool.activeBlob.points.length === 0) {
        blobTool.activeBlob = null;
      } else {
        ensureBlobCells(blobTool.activeBlob);
        blobTool.activeBlob.count = countCellsInBlob(blobTool.activeBlob);
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
