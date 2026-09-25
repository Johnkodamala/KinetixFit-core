// The bend of a running track, drawn behind the Today hero. Lanes draw themselves in on load and a
// short accent stroke "runs" the third lane now and then. Purely decorative (aria-hidden); the
// animation lives in src/styles/app.css (.kx-lanes) and stops under prefers-reduced-motion.
const CX = 190;
const CY = 135;
const RADII = [44, 66, 88, 110, 132];

function lanePath(r: number) {
  // straight from the left edge, then a half-circle bend back toward the left
  return `M 0 ${CY + r} L ${CX} ${CY + r} A ${r} ${r} 0 0 0 ${CX} ${CY - r} L 0 ${CY - r}`;
}

export default function TrackLanes() {
  return (
    <svg className="kx-lanes" viewBox="0 0 340 280" aria-hidden="true" preserveAspectRatio="xMaxYMax meet">
      {RADII.map(r => <path key={r} d={lanePath(r)} />)}
      <path className="kx-lane-accent" d={lanePath(RADII[2])} />
    </svg>
  );
}
