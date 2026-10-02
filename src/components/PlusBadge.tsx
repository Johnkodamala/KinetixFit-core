// The small gold PLUS label that tells a Plus account from a free one: top of Today, Account, the opening screen.
export default function PlusBadge({ className = '' }: { className?: string }) {
  return <span className={`kx-plus-badge ${className}`.trim()}>PLUS</span>;
}
