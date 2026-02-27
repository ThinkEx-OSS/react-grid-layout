/**
 * Wrap Compactor
 *
 * A compaction algorithm that treats grid items like words in a paragraph.
 * Items flow left-to-right, wrapping to the next row when they reach
 * the grid edge — fully supporting variable item widths and heights.
 *
 * When dragging:
 * - The dragged item's cursor position determines its insertion point
 *   in the sequence (via center-point comparison against packed items)
 * - Other items shift to accommodate the new position
 * - The item only changes position when dragged past another item's center
 *
 * This creates a natural reordering behavior similar to drag-and-drop
 * in file managers or card layouts.
 *
 * Based on the algorithm from PR #1773 by John Thomson (@JohnThomson),
 * extended with 2D occupancy tracking and center-based drag reordering.
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
 * Compare two items in wrap order: top-to-bottom, then left-to-right.
 */
function compareSortOrder(a: LayoutItem, b: LayoutItem): number {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

/**
 * Sort items in wrap order: left-to-right, top-to-bottom.
 * This is the visual reading order for wrapped content.
 */
function sortByWrapOrder(layout: readonly LayoutItem[]): LayoutItem[] {
  return [...layout].sort(compareSortOrder);
}

/**
 * 2D occupancy grid that grows rows on demand.
 * Each cell tracks whether it is occupied by a placed item.
 */
class OccupancyGrid {
  private rows: boolean[][] = [];
  constructor(private cols: number) {}

  private ensureRow(row: number): void {
    while (this.rows.length <= row) {
      this.rows.push(new Array<boolean>(this.cols).fill(false));
    }
  }

  isOccupied(x: number, y: number): boolean {
    if (x < 0 || x >= this.cols || y < 0) return true;
    this.ensureRow(y);
    return this.rows[y]![x]!;
  }

  occupy(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      this.ensureRow(y + dy);
      for (let dx = 0; dx < w; dx++) {
        this.rows[y + dy]![x + dx] = true;
      }
    }
  }

  canPlace(x: number, y: number, w: number, h: number): boolean {
    if (x + w > this.cols) return false;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (this.isOccupied(x + dx, y + dy)) return false;
      }
    }
    return true;
  }
}

/**
 * Find the first grid position where an item of size w×h fits,
 * scanning left-to-right, top-to-bottom.
 */
function findFirstFit(
  grid: OccupancyGrid,
  w: number,
  h: number,
  cols: number
): { x: number; y: number } {
  for (let row = 0; ; row++) {
    for (let col = 0; col <= cols - w; col++) {
      if (grid.canPlace(col, row, w, h)) {
        return { x: col, y: row };
      }
    }
  }
}

/**
 * Place a sequence of items into the occupancy grid, writing results
 * into `out` at each item's original index in `layout`.
 */
function placeSequence(
  sequence: readonly LayoutItem[],
  layout: Layout,
  grid: OccupancyGrid,
  cols: number,
  out: LayoutItem[]
): void {
  for (const seqItem of sequence) {
    const l = cloneLayoutItem(seqItem);
    const w = Math.min(l.w, cols);
    const h = l.h;
    const pos = findFirstFit(grid, w, h, cols);

    (l as Mutable<LayoutItem>).x = pos.x;
    (l as Mutable<LayoutItem>).y = pos.y;
    (l as Mutable<LayoutItem>).w = w;
    (l as Mutable<LayoutItem>).moved = false;
    grid.occupy(pos.x, pos.y, w, h);

    const originalIndex = layout.indexOf(seqItem);
    out[originalIndex] = l;
  }
}

/**
 * Determine where a dragged item should be inserted in the sequence.
 *
 * Uses a two-pass approach:
 *  1. Place non-dragged items to get their actual grid positions.
 *  2. Compare the dragged item's center against placed items' centers
 *     to find the insertion index (natural "past the midpoint" threshold).
 *
 * Row affinity: items whose y-ranges overlap are considered on the
 * "same row" and compared by center-X only. Otherwise, top-Y decides.
 */
function findInsertionIndex(
  sortedMovable: readonly LayoutItem[],
  movedItem: LayoutItem,
  fixedItems: readonly LayoutItem[],
  cols: number
): number {
  const tempGrid = new OccupancyGrid(cols);
  for (const s of fixedItems) {
    tempGrid.occupy(s.x, s.y, s.w, s.h);
  }

  const placed: Array<{ w: number; h: number; px: number; py: number }> = [];
  for (const item of sortedMovable) {
    const w = Math.min(item.w, cols);
    const h = item.h;
    const pos = findFirstFit(tempGrid, w, h, cols);
    tempGrid.occupy(pos.x, pos.y, w, h);
    placed.push({ w, h, px: pos.x, py: pos.y });
  }

  // Use the top-left cell center rather than the full-item center.
  // This keeps insertion stable during resize (position unchanged, only
  // size changes) while still tracking the cursor position during drag.
  const mcx = movedItem.x + 0.5;
  const mcy = movedItem.y + 0.5;

  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!;
    const pcx = p.px + p.w / 2;
    const pcy = p.py + p.h / 2;

    // Items whose y-ranges overlap share a visual row
    const sameRow =
      movedItem.y < p.py + p.h && p.py < movedItem.y + movedItem.h;

    if (sameRow) {
      if (mcx <= pcx) return i;
    } else if (mcy < pcy) {
      return i;
    }
  }

  return placed.length;
}

/**
 * Compact items in wrap order using a 2D occupancy grid.
 *
 * When `movedItemId` is provided (during a drag), a two-pass algorithm
 * ensures a stable, center-based insertion threshold so items don't
 * jitter as the user drags.
 *
 * Handles items of any width and height.
 */
function compactWrap(
  layout: Layout,
  cols: number,
  fixedItems: LayoutItem[],
  movedItemId?: string
): LayoutItem[] {
  if (layout.length === 0) return [];

  const fixedIds = new Set(fixedItems.map(f => f.i));

  const movedItem = movedItemId
    ? layout.find(item => item.i === movedItemId && !fixedIds.has(item.i))
    : undefined;

  const movableItems = layout.filter(
    item => !fixedIds.has(item.i) && item !== movedItem
  );
  const sortedMovable = sortByWrapOrder(movableItems);

  let sequence: LayoutItem[];

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
      layout.filter(item => !fixedIds.has(item.i))
    );
  }

  const grid = new OccupancyGrid(cols);
  const out: LayoutItem[] = new Array(layout.length);

  for (const s of fixedItems) {
    grid.occupy(s.x, s.y, s.w, s.h);
    const originalIndex = layout.indexOf(s);
    const cloned = cloneLayoutItem(s);
    (cloned as Mutable<LayoutItem>).moved = false;
    out[originalIndex] = cloned;
  }

  placeSequence(sequence, layout, grid, cols, out);

  return out;
}

/**
 * Wrap compactor — arranges items like words in a paragraph.
 *
 * Items flow left-to-right and wrap to the next row when they
 * reach the grid edge. Supports items of any width and height;
 * each item is placed at the earliest position where it fits
 * without overlapping others.
 *
 * During drag, uses center-point comparison for stable reorder
 * thresholds — items swap when the dragged item's center crosses
 * the midpoint of another item.
 */
export const wrapCompactor: Compactor = {
  type: "wrap",
  allowOverlap: false,

  compact(layout: Layout, cols: number, context?: CompactContext): Layout {
    const fixedItems = getFixedItems(layout, context);
    return compactWrap(layout, cols, fixedItems, context?.movedItemId);
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
