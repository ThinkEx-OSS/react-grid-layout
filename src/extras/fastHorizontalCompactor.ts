/**
 * Fast Horizontal Compactor
 *
 * An optimized horizontal compaction algorithm using a "sweeping tide" approach.
 * This algorithm has O(n log n) complexity (dominated by sorting) compared to
 * the default horizontal compactor which can have O(n²) complexity due to
 * recursive collision resolution.
 *
 * Best suited for large layouts (200+ items) where compaction performance
 * is critical. For smaller layouts, the difference is negligible.
 *
 * Adapted from the vertical fast compactor algorithm from PR #2152 by Morris Brodersen (@morris).
 *
 * @example
 * ```tsx
 * import { fastHorizontalCompactor } from 'react-grid-layout/extras';
 *
 * <GridLayout
 *   compactor={fastHorizontalCompactor}
 *   layout={layout}
 *   // ...
 * />
 * ```
 */

import type {
  CompactContext,
  Compactor,
  Layout,
  LayoutItem,
  Mutable
} from "../core/types.js";
import { cloneLayout, getFixedItems } from "../core/layout.js";

/**
 * Ensure the tide array has enough rows.
 */
function ensureTideRows(tide: number[], neededRows: number): void {
  while (tide.length < neededRows) {
    tide.push(0);
  }
}

/**
 * Find the maximum tide value for a range of rows.
 */
function getMaxTideForItem(tide: number[], y: number, h: number): number {
  let maxTide = 0;
  for (let row = y; row < y + h; row++) {
    const tideValue = tide[row] ?? 0;
    if (tideValue > maxTide) {
      maxTide = tideValue;
    }
  }
  return maxTide;
}

/**
 * Check if an item can be placed at a given position without colliding with fixed items.
 */
function canPlaceAt(
  item: LayoutItem,
  x: number,
  y: number,
  fixedItems: LayoutItem[],
  cols: number
): boolean {
  // Check grid bounds
  if (x + item.w > cols) return false;

  for (const fixedItem of fixedItems) {
    if (
      x < fixedItem.x + fixedItem.w &&
      x + item.w > fixedItem.x &&
      y < fixedItem.y + fixedItem.h &&
      y + item.h > fixedItem.y
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Fast horizontal compaction using a "sweeping tide" algorithm with row wrapping.
 *
 * The algorithm works by:
 * 1. Sorting items by (y, x, static) - top-to-bottom, left-to-right (like standard compactor)
 * 2. Maintaining a "tide" array that tracks the rightmost occupied column per row
 * 3. For each item, finding the leftmost position it can occupy
 * 4. If the item doesn't fit in its current row, wrapping to the next row
 * 5. Checking for collisions with static items and adjusting as needed
 *
 * This avoids recursive collision resolution, making it O(n log n) overall.
 *
 * @param layout - The layout to compact (will be modified in place)
 * @param cols - Number of columns in the grid
 * @param allowOverlap - Whether to allow overlapping items
 * @param fixedItems - Items that don't move (statics + anchors when fixed)
 */
function compactHorizontalFast(
  layout: LayoutItem[],
  cols: number,
  allowOverlap: boolean,
  fixedItems: LayoutItem[]
): void {
  const numItems = layout.length;
  if (numItems === 0) return;
  const fixedIds = new Set(fixedItems.map(f => f.i));

  // Sort items by column then row (same as standard horizontal compactor)
  layout.sort((a, b) => {
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    const aFixed = fixedIds.has(a.i);
    const bFixed = fixedIds.has(b.i);
    if (aFixed && !bFixed) return -1;
    if (!aFixed && bFixed) return 1;
    return 0;
  });

  // Calculate max row extent for pre-allocation
  let maxRow = 0;
  for (let i = 0; i < numItems; i++) {
    const item = layout[i];
    if (item !== undefined) {
      const bottom = item.y + item.h;
      if (bottom > maxRow) maxRow = bottom;
    }
  }

  // "Sweeping tide" - tracks the rightmost blocked column per row
  const tide: number[] = new Array(maxRow).fill(0);

  // Safety limit for row wrapping (prevents infinite loops)
  // Use a limit relative to layout size (at least 10_000, or 100x the number of items)
  const maxRowLimit = Math.max(10_000, numItems * 100);

  for (let i = 0; i < numItems; i++) {
    const item = layout[i] as Mutable<LayoutItem>;

    if (fixedIds.has(item.i)) {
      // Fixed items don't move; they become part of the tide
      ensureTideRows(tide, item.y + item.h);
      const t = item.x + item.w;
      for (let y = item.y; y < item.y + item.h; y++) {
        if ((tide[y] ?? 0) < t) {
          tide[y] = t;
        }
      }
      continue;
    }

    // For non-fixed items, find the best position
    let targetY = item.y;
    let targetX = 0;
    let placed = false;

    // Try to place the item, wrapping to lower rows if needed
    while (!placed) {
      ensureTideRows(tide, targetY + item.h);

      // Find the maximum tide across the rows this item spans
      const maxTide = getMaxTideForItem(tide, targetY, item.h);

      // Try to place at the tide position
      targetX = maxTide;

      // Check if item fits within grid bounds
      if (targetX + item.w <= cols) {
        if (
          allowOverlap ||
          canPlaceAt(item, targetX, targetY, fixedItems, cols)
        ) {
          placed = true;
        } else {
          let maxFixedRight = targetX;
          let foundCollision = false;
          for (const fixedItem of fixedItems) {
            if (
              targetX < fixedItem.x + fixedItem.w &&
              targetX + item.w > fixedItem.x &&
              targetY < fixedItem.y + fixedItem.h &&
              targetY + item.h > fixedItem.y
            ) {
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
              // Can't fit in this row, wrap to next
              targetY++;
            }
          } else if (foundCollision) {
            // Pushed past grid edge, wrap to next row
            targetY++;
          } else {
            // No collision but can't place - shouldn't happen
            placed = true;
          }
        }
      } else {
        // Doesn't fit in this row, wrap to next
        targetY++;
      }

      // Safety check to prevent infinite loops
      if (targetY > maxRowLimit) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn(
            `Fast horizontal compactor: Item "${item.i}" exceeded max row limit (${targetY}). ` +
              `This may indicate a layout that cannot be compacted within grid bounds.`
          );
        }
        // Give up and place at current position
        targetX = 0;
        placed = true;
      }
    }

    // Update item position
    item.x = targetX;
    item.y = targetY;
    item.moved = false;

    // Update tide: mark rows as blocked up to item's right edge
    ensureTideRows(tide, targetY + item.h);
    const t = targetX + item.w;
    for (let y = targetY; y < targetY + item.h; y++) {
      if ((tide[y] ?? 0) < t) {
        tide[y] = t;
      }
    }
  }
}

/**
 * Fast horizontal compactor - optimized for large layouts.
 *
 * Uses a "sweeping tide" algorithm that achieves O(n log n) complexity
 * instead of the potentially O(n²) recursive collision resolution.
 *
 * Best suited for layouts with 200+ items where compaction performance
 * becomes noticeable. For smaller layouts, the standard horizontalCompactor
 * works equally well.
 */
export const fastHorizontalCompactor: Compactor = {
  type: "horizontal",
  allowOverlap: false,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    const out = cloneLayout(layout) as LayoutItem[];
    compactHorizontalFast(out, cols, false, fixedItems);
    return out;
  }
};

/**
 * Fast horizontal compactor that allows overlapping items.
 *
 * Compacts items leftward but allows them to overlap each other.
 */
export const fastHorizontalOverlapCompactor: Compactor = {
  ...fastHorizontalCompactor,
  allowOverlap: true,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    const out = cloneLayout(layout) as LayoutItem[];
    compactHorizontalFast(out, cols, true, fixedItems);
    return out;
  }
};
