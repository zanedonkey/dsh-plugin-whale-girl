/** Anchor a non-interactive thought bubble to the visible artwork, not the empty square. */
export function bubbleLayout({ x, y, size, width, height, visibleHeight, bottomInset = 17, viewportWidth, viewportHeight, topClearance = 56 }) {
  const margin = 12, gap = 28;
  const left = Math.max(margin, Math.min(viewportWidth - width - margin, x + size / 2 - width / 2));
  const artBottom = y + size - bottomInset;
  const artTop = artBottom - visibleHeight;
  const above = artTop - gap - height;
  const below = artBottom + gap;
  const belowFits = below + height <= viewportHeight - margin;
  const aboveSpace = artTop - topClearance;
  const belowSpace = viewportHeight - margin - artBottom;
  const side = above < topClearance && (belowFits || belowSpace > aboveSpace) ? 'below' : 'above';
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  const minTop = Math.min(topClearance, maxTop);
  const top = Math.min(maxTop, Math.max(minTop, side === 'below' ? below : above));
  const tailX = Math.min(Math.max(22, width - 28), Math.max(22, x + size * 0.4 - left));
  return { left, top, side, tailX };
}

/** Prefer an adjacent panel that fits without covering the pet; clamp only as a fallback. */
export function panelLayout({ x, y, size, width, height, viewportWidth, viewportHeight, topClearance = 56 }) {
  const margin = 12, gap = 12;
  const maxX = Math.max(margin, viewportWidth - width - margin);
  const maxY = Math.max(margin, viewportHeight - height - margin);
  const minY = Math.min(topClearance, maxY);
  const place = (left, top, side) => ({ left: Math.min(maxX, Math.max(margin, left)), top: Math.min(maxY, Math.max(minY, top)), side });
  const centerX = x + size / 2 - width / 2, centerY = y + size / 2 - height / 2;
  const candidates = [place(centerX, y - height - gap, 'above'), place(centerX, y + size + gap, 'below'),
    place(x + size + gap, centerY, 'right'), place(x - width - gap, centerY, 'left')];
  return candidates.find(panel => panel.left + width <= x - gap || panel.left >= x + size + gap
    || panel.top + height <= y - gap || panel.top >= y + size + gap) || candidates[0];
}
