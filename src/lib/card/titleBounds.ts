import type { Point, Rect } from '../../config/templates';

/** Shared by preview gating and the final export DOM, after fonts have loaded. */
export function titleFits(element: HTMLElement, position: Point, region: Rect): boolean {
  return position.x >= region.x && position.y >= region.y &&
    position.x + element.offsetWidth <= region.x + region.width + 1 &&
    position.y + element.offsetHeight <= region.y + region.height + 1 &&
    element.scrollWidth <= element.clientWidth + 1;
}
