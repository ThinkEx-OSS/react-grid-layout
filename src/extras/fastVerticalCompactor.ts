/**
 * Fast Vertical Compactor
 *
 * An optimized vertical compaction algorithm using a "rising tide" approach.
 * This algorithm has O(n log n) complexity (dominated by sorting) compared to
 * the default vertical compactor which can have O(n²) complexity due to
 * recursive collision resolution.
 *
 * Best suited for large layouts (200+ items) where compaction performance
 * is critical. For smaller layouts, the difference is negligible.
 *
 * Based on the algorithm from PR #2152 by Morris Brodersen (@morris).
 *
 * @example
 * ```tsx
 * import { fastVerticalCompactor } from 'react-grid-layout/extras';
 *
 * <GridLayout
 *   compactor={fastVerticalCompactor}
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
 * Check if two layout items collide (overlap).
 */
function collides(l1: LayoutItem, l2: LayoutItem): boolean {
  if (l1.i === l2.i) return false;
  return (
    l1.x < l2.x + l2.w &&
    l1.x + l1.w > l2.x &&
    l1.y < l2.y + l2.h &&
    l1.y + l1.h > l2.y
  );
}

/**
 * Fast vertical compaction using a "rising tide" algorithm.
 *
 * The algorithm works by:
 * 1. Sorting items by (y, x, static) - top-to-bottom, left-to-right
 * 2. Maintaining a "tide" array that tracks the highest occupied row per column
 * 3. For each item, moving it up to meet the tide (closing gaps)
 * 4. Checking for collisions with static items and adjusting as needed
 *
 * This avoids recursive collision resolution, making it O(n log n) overall.
 *
 * @param layout - The layout to compact (will be modified in place)
 * @param cols - Number of columns in the grid
 * @param allowOverlap - Whether to allow overlapping items
 * @param fixedItems - Items that don't move (statics + anchors when fixed)
 */
function compactVerticalFast(
  layout: LayoutItem[],
  cols: number,
  allowOverlap: boolean,
  fixedItems: LayoutItem[]
): void {
  const numItems = layout.length;
  const fixedIds = new Set(fixedItems.map(f => f.i));

  // Sort items by position: top-to-bottom, left-to-right
  // Fixed items (static + anchor when fixed) sorted first to reduce collision checks
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

  // "Rising tide" - tracks the highest blocked row per column
  const tide: number[] = new Array(cols).fill(0);

  const numFixed = fixedItems.length;
  let fixedOffset = 0;

  for (let i = 0; i < numItems; i++) {
    const item = layout[i] as Mutable<LayoutItem>;

    // Clamp x2 to grid bounds
    let x2 = item.x + item.w;
    if (x2 > cols) {
      x2 = cols;
    }

    if (fixedIds.has(item.i)) {
      // Fixed items don't move; they become part of the tide
      ++fixedOffset;
    } else {
      // Find the minimum gap between the item and the tide
      let minGap = Infinity;
      for (let x = item.x; x < x2; ++x) {
        const tideValue = tide[x] ?? 0;
        const gap = item.y - tideValue;
        if (gap < minGap) {
          minGap = gap;
        }
      }

      // Close the gap (move item up to meet the tide)
      if (!allowOverlap || minGap > 0) {
        item.y -= minGap;
      }

      // Handle collisions with fixed items
      for (let j = fixedOffset; !allowOverlap && j < numFixed; ++j) {
        const fixedItem = fixedItems[j];
        if (fixedItem === undefined) continue;

        // Early exit: if fixed item is below current item, no more collisions possible
        if (fixedItem.y >= item.y + item.h) {
          break;
        }

        if (collides(item, fixedItem)) {
          // Move current item below the fixed item
          item.y = fixedItem.y + fixedItem.h;

          if (j > fixedOffset) {
            j = fixedOffset;
          }
        }
      }

      // Reset moved flag
      item.moved = false;
    }

    // Update tide: mark columns as blocked up to item's bottom
    const t = item.y + item.h;
    for (let x = item.x; x < x2; ++x) {
      const currentTide = tide[x] ?? 0;
      if (currentTide < t) {
        tide[x] = t;
      }
    }
  }
}

/**
 * Fast vertical compactor - optimized for large layouts.
 *
 * Uses a "rising tide" algorithm that achieves O(n log n) complexity
 * instead of the potentially O(n²) recursive collision resolution.
 *
 * Best suited for layouts with 200+ items where compaction performance
 * becomes noticeable. For smaller layouts, the standard verticalCompactor
 * works equally well.
 */
export const fastVerticalCompactor: Compactor = {
  type: "vertical",
  allowOverlap: false,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map(f => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter(l => fixedIds.has(l.i));
    const out = cloneLayout(layout) as LayoutItem[];
    compactVerticalFast(out, cols, false, fixedItemsInOrder);
    return out;
  }
};

/**
 * Fast vertical compactor that allows overlapping items.
 *
 * Compacts items upward but allows them to overlap each other.
 */
export const fastVerticalOverlapCompactor: Compactor = {
  ...fastVerticalCompactor,
  allowOverlap: true,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    const fixedIds = new Set(fixedItems.map(f => f.i));
    const sorted = [...layout].sort((a, b) => {
      if (a.y < b.y) return -1;
      if (a.y > b.y) return 1;
      if (a.x < b.x) return -1;
      if (a.x > b.x) return 1;
      return 0;
    });
    const fixedItemsInOrder = sorted.filter(l => fixedIds.has(l.i));
    const out = cloneLayout(layout) as LayoutItem[];
    compactVerticalFast(out, cols, true, fixedItemsInOrder);
    return out;
  }
};
