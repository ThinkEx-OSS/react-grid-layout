import { calcGridCellDimensions, getFixedItems, cloneLayout, cloneLayoutItem } from './chunk-ELGH2DIT.mjs';
import { useMemo } from 'react';
import { jsx } from 'react/jsx-runtime';

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
  const dims = useMemo(
    () => calcGridCellDimensions({
      width,
      cols,
      rowHeight,
      margin,
      containerPadding
    }),
    [width, cols, rowHeight, margin, containerPadding]
  );
  const rowCount = useMemo(() => {
    if (rows !== "auto") return rows;
    if (height) {
      const padding = containerPadding ?? margin;
      return Math.ceil(
        (height - padding[1] * 2 + margin[1]) / (rowHeight + margin[1])
      );
    }
    return 10;
  }, [rows, height, rowHeight, margin, containerPadding]);
  const totalHeight = useMemo(() => {
    const padding = containerPadding ?? margin;
    return padding[1] * 2 + rowCount * rowHeight + (rowCount - 1) * margin[1];
  }, [rowCount, rowHeight, margin, containerPadding]);
  const cells = useMemo(() => {
    const rects = [];
    const { cellWidth, cellHeight, offsetX, offsetY, gapX, gapY } = dims;
    for (let row = 0; row < rowCount; row++) {
      for (let col = 0; col < cols; col++) {
        const x = offsetX + col * (cellWidth + gapX);
        const y = offsetY + row * (cellHeight + gapY);
        rects.push(
          /* @__PURE__ */ jsx(
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
  return /* @__PURE__ */ jsx(
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
    const fixedItems = getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map((f) => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter((l) => fixedIds.has(l.i));
    const out = cloneLayout(layout);
    compactVerticalFast(out, cols, false, fixedItemsInOrder);
    return out;
  }
};
var fastVerticalOverlapCompactor = {
  ...fastVerticalCompactor,
  allowOverlap: true,
  compact(layout, cols, context) {
    const fixedItems = getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map((f) => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter((l) => fixedIds.has(l.i));
    const out = cloneLayout(layout);
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
    const fixedItems = getFixedItems(layout, context);
    const out = cloneLayout(layout);
    compactHorizontalFast(out, cols, false, fixedItems);
    return out;
  }
};
var fastHorizontalOverlapCompactor = {
  ...fastHorizontalCompactor,
  allowOverlap: true,
  compact(layout, cols, context) {
    const fixedItems = getFixedItems(layout, context);
    const out = cloneLayout(layout);
    compactHorizontalFast(out, cols, true, fixedItems);
    return out;
  }
};

// src/extras/wrapCompactor.ts
function sortByWrapOrder(layout) {
  return [...layout].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}
function fromWrapPosition(pos, cols) {
  return {
    x: pos % cols,
    y: Math.floor(pos / cols)
  };
}
function compactWrap(layout, cols, fixedItems) {
  if (layout.length === 0) return [];
  const sorted = sortByWrapOrder(layout);
  const out = new Array(layout.length);
  const fixedIds = new Set(fixedItems.map((f) => f.i));
  const fixedPositions = /* @__PURE__ */ new Set();
  for (const s of fixedItems) {
    for (let dy = 0; dy < s.h; dy++) {
      for (let dx = 0; dx < s.w; dx++) {
        fixedPositions.add((s.y + dy) * cols + (s.x + dx));
      }
    }
  }
  let nextPos = 0;
  for (let i = 0; i < sorted.length; i++) {
    const sortedItem = sorted[i];
    if (sortedItem === void 0) continue;
    const l = cloneLayoutItem(sortedItem);
    if (fixedIds.has(l.i)) {
      const originalIndex2 = layout.indexOf(sortedItem);
      out[originalIndex2] = l;
      l.moved = false;
      continue;
    }
    while (fixedPositions.has(nextPos)) {
      nextPos++;
    }
    const { x, y } = fromWrapPosition(nextPos, cols);
    if (x + l.w > cols) {
      nextPos = (y + 1) * cols;
      while (fixedPositions.has(nextPos)) {
        nextPos++;
      }
    }
    const newCoords = fromWrapPosition(nextPos, cols);
    l.x = newCoords.x;
    l.y = newCoords.y;
    nextPos += l.w;
    const originalIndex = layout.indexOf(sortedItem);
    out[originalIndex] = l;
    l.moved = false;
  }
  return out;
}
var wrapCompactor = {
  type: "wrap",
  allowOverlap: false,
  compact(layout, cols, context) {
    const fixedItems = getFixedItems(layout, context);
    return compactWrap(layout, cols, fixedItems);
  }
};
var wrapOverlapCompactor = {
  ...wrapCompactor,
  allowOverlap: true,
  compact(layout, _cols, _context) {
    return cloneLayout(layout);
  }
};

export { GridBackground, fastHorizontalCompactor, fastHorizontalOverlapCompactor, fastVerticalCompactor, fastVerticalOverlapCompactor, wrapCompactor, wrapOverlapCompactor };
