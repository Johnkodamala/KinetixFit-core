import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { selection as hapticSelection } from '../lib/feedback';

// iOS-style floating tab bar: a glass lens sits under the current tab and slides (with a droplet-like
// stretch) when it changes. Slide a finger along the bar and the lens follows it, ticking once per tab,
// and the tab under the finger is chosen on release — a plain tap still works as a normal button.
// Styles: .phone-bottom-nav / .nav-lens in src/styles/app.css and glass.css.

export interface Tab { id: string; label: string; icon: ReactNode; }

const SCRUB_THRESHOLD_PX = 8; // movement before a press becomes a slide (so taps stay taps)
const INSET_PX = 6;           // the lens track's inset inside the bar (matches .nav-lens top/left)

export default function TabBar({ tabs, activeId, onChange }: {
  tabs: Tab[]; activeId: string; onChange: (id: string) => void;
}) {
  const activeIndex = Math.max(0, tabs.findIndex(t => t.id === activeId));
  // lens position in tab-widths; fractional while sliding
  const [scrubPos, setScrubPos] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const press = useRef<{ x: number; scrubbing: boolean; lastIndex: number } | null>(null);
  const suppressClick = useRef(false);
  const prevIndex = useRef(activeIndex);

  // Droplet stretch when the lens travels to another tab (skipped while sliding — it follows the finger).
  useEffect(() => {
    const from = prevIndex.current;
    prevIndex.current = activeIndex;
    if (from === activeIndex || scrubPos !== null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stretch = 1 + Math.min(0.35, 0.16 * Math.abs(activeIndex - from));
    dropRef.current?.animate(
      [
        { transform: 'scale(1, 1)' },
        { transform: `scale(${stretch}, 0.9)`, offset: 0.4 },
        { transform: 'scale(1, 1)' }
      ],
      { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  }, [activeIndex, scrubPos]);

  const indexAt = (clientX: number) => {
    const nav = navRef.current;
    if (!nav) return { pos: activeIndex, index: activeIndex };
    const rect = nav.getBoundingClientRect();
    const segment = (rect.width - INSET_PX * 2) / tabs.length;
    const pos = Math.min(tabs.length - 1, Math.max(0, (clientX - rect.left - INSET_PX) / segment - 0.5));
    return { pos, index: Math.round(pos) };
  };

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    press.current = { x: e.clientX, scrubbing: false, lastIndex: activeIndex };
  };

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p) return;
    if (!p.scrubbing) {
      if (Math.abs(e.clientX - p.x) < SCRUB_THRESHOLD_PX) return;
      p.scrubbing = true;
      navRef.current?.setPointerCapture(e.pointerId);
    }
    const { pos, index } = indexAt(e.clientX);
    setScrubPos(pos);
    if (index !== p.lastIndex) {
      p.lastIndex = index;
      hapticSelection();
    }
  };

  const endPress = (e: PointerEvent<HTMLElement>) => {
    const p = press.current;
    press.current = null;
    if (!p?.scrubbing) return;
    const { index } = indexAt(e.clientX);
    setScrubPos(null);
    suppressClick.current = true; // the click that follows a slide isn't a tap on the tab it ended over
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    // the slide already ticked for this tab, so change silently
    if (tabs[index].id !== activeId) onChange(tabs[index].id);
  };

  const cancelPress = () => { press.current = null; setScrubPos(null); };

  const lensPos = scrubPos ?? activeIndex;

  return (
    <nav
      ref={navRef}
      className={`phone-bottom-nav ${scrubPos !== null ? 'is-scrubbing' : ''}`}
      aria-label="Main"
      style={{ ['--tab-count' as string]: tabs.length, ['--lens-pos' as string]: lensPos }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={cancelPress}
    >
      <span className="nav-lens" aria-hidden="true"><span ref={dropRef} className="nav-lens-drop" /></span>
      {tabs.map((tab, i) => {
        const active = tab.id === activeId;
        const under = scrubPos !== null && Math.round(scrubPos) === i;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => { if (suppressClick.current) return; if (tab.id !== activeId) hapticSelection(); onChange(tab.id); }}
            className={`nav-item-btn ${active && scrubPos === null ? 'nav-item-active' : ''} ${under ? 'nav-item-under' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
