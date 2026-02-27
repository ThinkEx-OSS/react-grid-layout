'use strict';

var chunkYFKCNU46_js = require('./chunk-YFKCNU46.js');
var react = require('react');
var jsxRuntime = require('react/jsx-runtime');

function GridBackground({
  width,
  cols,
  rowHeight,
  margin = [10, 10],
  containerPadding,
  rows = 10,
  height,
  color = "#e0e0e0",
  borderRadius = 4,
  className,
  style
}) {
  const dims = react.useMemo(
    () => chunkYFKCNU46_js.calcGridCellDimensions({
      width,
      cols,
      rowHeight,
      margin,
      containerPadding
    }),
    [width, cols, rowHeight, margin, containerPadding]
  );
  const rowCount = react.useMemo(() => {
    if (rows !== "auto") return rows;
    if (height) {
      const padding = containerPadding ?? margin;
      return Math.ceil(
        (height - padding[1] * 2 + margin[1]) / (rowHeight + margin[1])
      );
    }
    return 10;
  }, [rows, height, rowHeight, margin, containerPadding]);
  const totalHeight = react.useMemo(() => {
    const padding = containerPadding ?? margin;
    return padding[1] * 2 + rowCount * rowHeight + (rowCount - 1) * margin[1];
  }, [rowCount, rowHeight, margin, containerPadding]);
  const cells = react.useMemo(() => {
    const rects = [];
    const { cellWidth, cellHeight, offsetX, offsetY, gapX, gapY } = dims;
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * (cellWidth + gapX);
        const y = offsetY + row * (cellHeight + gapY);
        rects.push(
          /* @__PURE__ */ jsxRuntime.jsx(
            "rect",
            {
              x,
              y,
              width: cellWidth,
              height: cellHeight,
              rx: borderRadius,
              ry: borderRadius,
              fill: color
            },
            `${row}-${col}`
          )
        );
      }
    }
    return rects;
  }, [dims, rowCount, cols, borderRadius, color]);
  return /* @__PURE__ */ jsxRuntime.jsx(
    "svg",
    {
      className,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height: totalHeight,
        pointerEvents: "none",
        ...style
      },
      "aria-hidden": "true",
      children: cells
    }
  );
}

// src/extras/fastVerticalCompactor.ts
function collides(l1, l2) {
  if (l1.i === l2.i) return false;
  return l1.x < l2.x + l2.w && l1.x + l1.w > l2.x && l1.y < l2.y + l2.h && l1.y + l1.h > l2.y;
}
function compactVerticalFast(layout, cols, allowOverlap, fixedItems) {
  const numItems = layout.length;
  const fixedIds = new Set(fixedItems.map((f) => f.i));
  layout.sort((a, b) => {
    if (a.y < b.y) return -1;
    if (a.y > b.y) return 1;
    if (a.x < b.x) return -1;
    if (a.x > b.x) return 1;
    const aFixed = fixedIds.has(a.i);
    const bFixed = fixedIds.has(b.i);
    if (aFixed && !bFixed) return -1;
    if (!aFixed && bFixed) return 1;
    return 0;
  });
  const tide = new Array(cols).fill(0);
  const numFixed = fixedItems.length;
  let fixedOffset = 0;
  for (let i = 0; i < numItems; i++) {
    const item = layout[i];
    let x2 = item.x + item.w;
    if (x2 > cols) {
      x2 = cols;
    }
    if (fixedIds.has(item.i)) {
      ++fixedOffset;
    } else {
      let minGap = Infinity;
      for (let x = item.x; x < x2; ++x) {
        const tideValue = tide[x] ?? 0;
        const gap = item.y - tideValue;
        if (gap < minGap) {
          minGap = gap;
        }
      }
      if (!allowOverlap || minGap > 0) {
        item.y -= minGap;
      }
      for (let j = fixedOffset; !allowOverlap && j < numFixed; ++j) {
        const fixedItem = fixedItems[j];
        if (fixedItem === void 0) continue;
        if (fixedItem.y >= item.y + item.h) {
          break;
        }
        if (collides(item, fixedItem)) {
          item.y = fixedItem.y + fixedItem.h;
          if (j > fixedOffset) {
            j = fixedOffset;
          }
        }
      }
      item.moved = false;
    }
    const t = item.y + item.h;
    for (let x = item.x; x < x2; ++x) {
      const currentTide = tide[x] ?? 0;
      if (currentTide < t) {
        tide[x] = t;
      }
    }
  }
}
var fastVerticalCompactor = {
  type: "vertical",
  allowOverlap: false,
  compact(layout, cols, context) {
    const fixedItems = chunkYFKCNU46_js.getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map((f) => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter((l) => fixedIds.has(l.i));
    const out = chunkYFKCNU46_js.cloneLayout(layout);
    compactVerticalFast(out, cols, false, fixedItemsInOrder);
    return out;
  }
};
var fastVerticalOverlapCompactor = {
  ...fastVerticalCompactor,
  allowOverlap: true,
  compact(layout, cols, context) {
    const fixedItems = chunkYFKCNU46_js.getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map((f) => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter((l) => fixedIds.has(l.i));
    const out = chunkYFKCNU46_js.cloneLayout(layout);
    compactVerticalFast(out, cols, true, fixedItemsInOrder);
    return out;
  }
};

// src/extras/fastHorizontalCompactor.ts
function ensureTideRows(tide, neededRows) {
  while (tide.length < neededRows) {
    tide.push(0);
  }
}
function getMaxTideForItem(tide, y, h) {
  let maxTide = 0;
  for (let row = y; row < y + h; row++) {
    const tideValue = tide[row] ?? 0;
    if (tideValue > maxTide) {
      maxTide = tideValue;
    }
  }
  return maxTide;
}
function canPlaceAt(item, x, y, fixedItems, cols) {
  if (x + item.w > cols) return false;
  for (const fixedItem of fixedItems) {
    if (x < fixedItem.x + fixedItem.w && x + item.w > fixedItem.x && y < fixedItem.y + fixedItem.h && y + item.h > fixedItem.y) {
      return false;
    }
  }
  return true;
}
function compactHorizontalFast(layout, cols, allowOverlap, fixedItems) {
  const numItems = layout.length;
  if (numItems === 0) return;
  const fixedIds = new Set(fixedItems.map((f) => f.i));
  layout.sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    const aFixed = fixedIds.has(a.i);
    const bFixed = fixedIds.has(b.i);
    if (aFixed && !bFixed) return -1;
    if (!aFixed && bFixed) return 1;
    return 0;
  });
  let maxRow = 0;
  for (let i = 0; i < numItems; i++) {
    const item = layout[i];
    if (item !== void 0) {
      const bottom = item.y + item.h;
      if (bottom > maxRow) maxRow = bottom;
    }
  }
  const tide = new Array(maxRow).fill(0);
  const maxRowLimit = Math.max(1e4, numItems * 100);
  for (let i = 0; i < numItems; i++) {
    const item = layout[i];
    if (fixedIds.has(item.i)) {
      ensureTideRows(tide, item.y + item.h);
      const t2 = item.x + item.w;
      for (let y = item.y; y < item.y + item.h; y++) {
        if ((tide[y] ?? 0) < t2) {
          tide[y] = t2;
        }
      }
      continue;
    }
    let targetY = item.y;
    let targetX = 0;
    let placed = false;
    while (!placed) {
      ensureTideRows(tide, targetY + item.h);
      const maxTide = getMaxTideForItem(tide, targetY, item.h);
      targetX = maxTide;
      if (targetX + item.w <= cols) {
        if (allowOverlap || canPlaceAt(item, targetX, targetY, fixedItems, cols)) {
          placed = true;
        } else {
          let maxFixedRight = targetX;
          let foundCollision = false;
          for (const fixedItem of fixedItems) {
            if (targetX < fixedItem.x + fixedItem.w && targetX + item.w > fixedItem.x && targetY < fixedItem.y + fixedItem.h && targetY + item.h > fixedItem.y) {
              maxFixedRight = Math.max(
                maxFixedRight,
                fixedItem.x + fixedItem.w
              );
              foundCollision = true;
            }
          }
          if (foundCollision) {
            targetX = maxFixedRight;
          }
          if (foundCollision && targetX + item.w <= cols) {
            if (canPlaceAt(item, targetX, targetY, fixedItems, cols)) {
              placed = true;
            } else {
              targetY++;
            }
          } else if (foundCollision) {
            targetY++;
          } else {
            placed = true;
          }
        }
      } else {
        targetY++;
      }
      if (targetY > maxRowLimit) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `Fast horizontal compactor: Item "${item.i}" exceeded max row limit (${targetY}). This may indicate a layout that cannot be compacted within grid bounds.`
          );
        }
        targetX = 0;
        placed = true;
      }
    }
    item.x = targetX;
    item.y = targetY;
    item.moved = false;
    ensureTideRows(tide, targetY + item.h);
    const t = targetX + item.w;
    for (let y = targetY; y < targetY + item.h; y++) {
      if ((tide[y] ?? 0) < t) {
        tide[y] = t;
      }
    }
  }
}
var fastHorizontalCompactor = {
  type: "horizontal",
  allowOverlap: false,
  compact(layout, cols, context) {
    const fixedItems = chunkYFKCNU46_js.getFixedItems(layout, context);
    const out = chunkYFKCNU46_js.cloneLayout(layout);
    compactHorizontalFast(out, cols, false, fixedItems);
    return out;
  }
};
var fastHorizontalOverlapCompactor = {
  ...fastHorizontalCompactor,
  allowOverlap: true,
  compact(layout, cols, context) {
    const fixedItems = chunkYFKCNU46_js.getFixedItems(layout, context);
    const out = chunkYFKCNU46_js.cloneLayout(layout);
    compactHorizontalFast(out, cols, true, fixedItems);
    return out;
  }
};

// src/extras/wrapCompactor.ts
function compareSortOrder(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}
function sortByWrapOrder(layout) {
  return [...layout].sort(compareSortOrder);
}
var OccupancyGrid = class {
  constructor(cols) {
    this.cols = cols;
    this.rows = [];
  }
  ensureRow(row) {
    while (this.rows.length <= row) {
      this.rows.push(new Array(this.cols).fill(false));
    }
  }
  isOccupied(x, y) {
    if (x < 0 || x >= this.cols || y < 0) return true;
    this.ensureRow(y);
    return this.rows[y][x];
  }
  occupy(x, y, w, h) {
    for (let dy = 0; dy < h; dy++) {
      this.ensureRow(y + dy);
      for (let dx = 0; dx < w; dx++) {
        this.rows[y + dy][x + dx] = true;
      }
    }
  }
  canPlace(x, y, w, h) {
    if (x + w > this.cols) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.isOccupied(x + dx, y + dy)) return false;
      }
    }
    return true;
  }
};
function findFirstFit(grid, w, h, cols) {
  for (let row = 0; ; row++) {
    for (let col = 0; col <= cols - w; col++) {
      if (grid.canPlace(col, row, w, h)) {
        return { x: col, y: row };
      }
    }
  }
}
function placeSequence(sequence, layout, grid, cols, out) {
  for (const seqItem of sequence) {
    const l = chunkYFKCNU46_js.cloneLayoutItem(seqItem);
    const w = Math.min(l.w, cols);
    const h = l.h;
    const pos = findFirstFit(grid, w, h, cols);
    l.x = pos.x;
    l.y = pos.y;
    l.w = w;
    l.moved = false;
    grid.occupy(pos.x, pos.y, w, h);
    const originalIndex = layout.indexOf(seqItem);
    out[originalIndex] = l;
  }
}
function findInsertionIndex(sortedMovable, movedItem, fixedItems, cols) {
  const tempGrid = new OccupancyGrid(cols);
  for (const s of fixedItems) {
    tempGrid.occupy(s.x, s.y, s.w, s.h);
  }
  const placed = [];
  for (const item of sortedMovable) {
    const w = Math.min(item.w, cols);
    const h = item.h;
    const pos = findFirstFit(tempGrid, w, h, cols);
    tempGrid.occupy(pos.x, pos.y, w, h);
    placed.push({ w, h, px: pos.x, py: pos.y });
  }
  const mcx = movedItem.x + 0.5;
  const mcy = movedItem.y + 0.5;
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const pcx = p.px + p.w / 2;
    const pcy = p.py + p.h / 2;
    const sameRow = movedItem.y < p.py + p.h && p.py < movedItem.y + movedItem.h;
    if (sameRow) {
      if (mcx <= pcx) return i;
    } else if (mcy < pcy) {
      return i;
    }
  }
  return placed.length;
}
function compactWrap(layout, cols, fixedItems, movedItemId) {
  if (layout.length === 0) return [];
  const fixedIds = new Set(fixedItems.map((f) => f.i));
  const movedItem = movedItemId ? layout.find((item) => item.i === movedItemId && !fixedIds.has(item.i)) : void 0;
  const movableItems = layout.filter(
    (item) => !fixedIds.has(item.i) && item !== movedItem
  );
  const sortedMovable = sortByWrapOrder(movableItems);
  let sequence;
  if (movedItem) {
    const insertIdx = findInsertionIndex(
      sortedMovable,
      movedItem,
      fixedItems,
      cols
    );
    sequence = [
      ...sortedMovable.slice(0, insertIdx),
      movedItem,
      ...sortedMovable.slice(insertIdx)
    ];
  } else {
    sequence = sortByWrapOrder(
      layout.filter((item) => !fixedIds.has(item.i))
    );
  }
  const grid = new OccupancyGrid(cols);
  const out = new Array(layout.length);
  for (const s of fixedItems) {
    grid.occupy(s.x, s.y, s.w, s.h);
    const originalIndex = layout.indexOf(s);
    const cloned = chunkYFKCNU46_js.cloneLayoutItem(s);
    cloned.moved = false;
    out[originalIndex] = cloned;
  }
  placeSequence(sequence, layout, grid, cols, out);
  return out;
}
var wrapCompactor = {
  type: "wrap",
  allowOverlap: false,
  compact(layout, cols, context) {
    const fixedItems = chunkYFKCNU46_js.getFixedItems(layout, context);
    return compactWrap(layout, cols, fixedItems, context?.movedItemId);
  }
};
var wrapOverlapCompactor = {
  ...wrapCompactor,
  allowOverlap: true,
  compact(layout, _cols, _context) {
    return chunkYFKCNU46_js.cloneLayout(layout);
  }
};

exports.GridBackground = GridBackground;
exports.fastHorizontalCompactor = fastHorizontalCompactor;
exports.fastHorizontalOverlapCompactor = fastHorizontalOverlapCompactor;
exports.fastVerticalCompactor = fastVerticalCompactor;
exports.fastVerticalOverlapCompactor = fastVerticalOverlapCompactor;
exports.wrapCompactor = wrapCompactor;
exports.wrapOverlapCompactor = wrapOverlapCompactor;
