// The floating scan button on Today covered right-aligned controls ("Change", the end of a text card) as they passed under it
// and sometimes stopped there. Like most floating buttons, it steps aside while the page scrolls down and comes back as soon as
// it scrolls up, and it is always there at the top of the page.

/** Closer to the top than this (px scrolled), the button is always shown. */
const TOP_ZONE = 48;
/** A change of fewer px than this isn't a scroll: it neither hides nor shows the button. */
const STEP = 4;

/** Whether the button should be away, given whether it is now, where the page was scrolled to and where it is now. */
export function scanButtonAway(wasAway: boolean, fromY: number, toY: number): boolean {
  if (toY <= TOP_ZONE) return false;
  const moved = toY - fromY;
  if (moved > STEP) return true;
  if (moved < -STEP) return false;
  return wasAway;
}
