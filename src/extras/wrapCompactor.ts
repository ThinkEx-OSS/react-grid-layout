/**
 * Wrap Compactor
 *
 * A compaction algorithm that treats grid items like words in a paragraph.
 * Items flow left-to-right, wrapping to the next row when they reach
 * the grid edge.
 *
 * When dragging:
 * - Moving an item earlier in the sequence shifts other items down/right
 * - Moving an item later in the sequence shifts other items up/left
 *
 * This creates a natural reordering behavior similar to drag-and-drop
 * in file managers or card layouts.
 *
 * Based on the algorithm from PR #1773 by John Thomson (@JohnThomson).
 *
 * @example
 * ```tsx
 * import { wrapCompactor } from 'react-grid-layout/extras';
 *
 * <GridLayout
 *   compactor={wrapCompactor}
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
import { cloneLayout, cloneLayoutItem, getFixedItems } from "../core/layout.js";

/**
 * Sort items in wrap order: left-to-right, top-to-bottom.
 * This is the visual reading order for wrapped content.
 */
function sortByWrapOrder(layout: Layout): LayoutItem[] {
  return [...layout].sort((a, b) => {
    // Primary: top-to-bottom (by row)
    if (a.y !== b.y) return a.y - b.y;
    // Secondary: left-to-right (by column)
    return a.x - b.x;
  });
}

/**
 * Convert a linear wrap position back to x,y coordinates.
 */
function fromWrapPosition(pos: number, cols: number): { x: number; y: number } {
  return {
    x: pos % cols,
    y: Math.floor(pos / cols)
  };
}

/**
 * Compact items in wrap order, filling gaps from left-to-right, top-to-bottom.
 * All items are assumed to be 1x1 for wrap mode to work correctly.
 *
 * @param layout - Layout to compact
 * @param cols - Number of columns
 * @param fixedItems - Items that don't move (statics + anchors when fixed)
 */
function compactWrap(
  layout: Layout,
  cols: number,
  fixedItems: LayoutItem[]
): LayoutItem[] {
  if (layout.length === 0) return [];

  const sorted = sortByWrapOrder(layout);
  const out: LayoutItem[] = new Array(layout.length);
  const fixedIds = new Set(fixedItems.map(f => f.i));

  // Track which positions are occupied by fixed items
  const fixedPositions = new Set<number>();
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
    if (sortedItem === undefined) continue;

    const l = cloneLayoutItem(sortedItem);

    if (fixedIds.has(l.i)) {
      const originalIndex = layout.indexOf(sortedItem);
      out[originalIndex] = l;
      (l as Mutable<LayoutItem>).moved = false;
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
    (l as Mutable<LayoutItem>).x = newCoords.x;
    (l as Mutable<LayoutItem>).y = newCoords.y;

    nextPos += l.w;

    const originalIndex = layout.indexOf(sortedItem);
    out[originalIndex] = l;
    (l as Mutable<LayoutItem>).moved = false;
  }

  return out;
}

/**
 * Wrap compactor - arranges items like words in a paragraph.
 *
 * Items flow left-to-right and wrap to the next row when they
 * reach the grid edge. Dragging an item reorders the sequence,
 * with other items shifting to maintain the flow.
 *
 * Works best with uniformly-sized items (especially 1x1), but
 * handles larger items by ensuring they fit within row bounds.
 */
export const wrapCompactor: Compactor = {
  type: "wrap",
  allowOverlap: false,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    return compactWrap(layout, cols, fixedItems);
  }
};

/**
 * Wrap compactor that allows overlapping items.
 */
export const wrapOverlapCompactor: Compactor = {
  ...wrapCompactor,
  allowOverlap: true,

  compact(layout: Layout, _cols: number, _context?: CompactContext): Layout {
    return cloneLayout(layout);
  }
};
