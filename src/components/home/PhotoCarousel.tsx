import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff, Pause, Play } from "lucide-react";
import type { Photo } from "../../types";
import { cn } from "../../lib/utils";

const DEFAULT_INTERVAL_MS = 3000;
const MAX_DOTS = 12;
const SWIPE_THRESHOLD_PX = 40;

/**
 * Auto-rotating photo carousel.
 *
 * - Advances every `intervalMs` (Admin › Photos › Seconds per photo); manual navigation restarts the countdown.
 * - Pauses while a mouse hovers it or keyboard focus is inside it, and has an
 *   explicit pause button (needed for touch screens and WCAG 2.2.2).
 * - Swipe on touch devices, arrow keys when focused.
 */
export function PhotoCarousel({ photos, label, intervalMs = DEFAULT_INTERVAL_MS }: { photos: Photo[]; label: string; intervalMs?: number }) {
  const count = photos.length;
  // `previous` is the slide fading out, kept rendered so the crossfade works.
  const [position, setPosition] = useState({ index: 0, previous: -1 });
  const [userPaused, setUserPaused] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [failed, setFailed] = useState<Set<number>>(() => new Set());
  const touchStartX = useRef<number | null>(null);

  const index = position.index;
  const running = count > 1 && !userPaused && !hoverPaused && !focusPaused;
  const active = Math.min(index, Math.max(count - 1, 0));

  const goTo = useCallback((next: number | ((current: number) => number)) => {
    setPosition((current) => {
      const target = typeof next === "function" ? next(current.index) : next;
      return target === current.index ? current : { index: target, previous: current.index };
    });
  }, []);

  useEffect(() => {
    if (index > count - 1) setPosition({ index: 0, previous: -1 });
  }, [count, index]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => goTo((current) => (current + 1) % count), intervalMs);
    return () => window.clearTimeout(timer);
  }, [running, active, count, goTo, intervalMs]);

  const go = useCallback((delta: number) => goTo((current) => (current + delta + count) % count), [count, goTo]);

  if (!count) return null;

  const showDots = count > 1 && count <= MAX_DOTS;
  // Only mount images for the visible slide, its neighbours (so the next photo
  // is already loaded when it fades in) and the one fading out. Every slide is
  // stacked in the viewport, so loading="lazy" alone would fetch them all.
  const shouldLoad = (i: number) =>
    i === active || i === position.previous || i === (active + 1) % count || i === (active - 1 + count) % count;

  return (
    <div
      className="carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHoverPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHoverPaused(false)}
      onFocus={(e) => {
        // Only keyboard focus pauses; a mouse click on "next" should not freeze rotation.
        if ((e.target as HTMLElement).matches(":focus-visible")) setFocusPaused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusPaused(false);
      }}
      onKeyDown={(e) => {
        if (count < 2) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      }}
    >
      <div
        className="carousel-viewport"
        aria-live={running ? "off" : "polite"}
        onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null; }}
        onTouchEnd={(e) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          const end = e.changedTouches[0]?.clientX;
          if (start === null || end === undefined || count < 2) return;
          const delta = end - start;
          if (Math.abs(delta) > SWIPE_THRESHOLD_PX) go(delta < 0 ? 1 : -1);
        }}
      >
        {photos.map((photo, i) => {
          const isActive = i === active;
          const broken = failed.has(photo.id);
          return (
            <figure
              key={photo.id}
              className="carousel-slide"
              data-active={isActive}
              aria-hidden={!isActive}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
            >
              {broken ? (
                <div className="carousel-broken"><ImageOff size={28} /><span>Image unavailable</span></div>
              ) : shouldLoad(i) ? (
                <>
                  <img className="carousel-backdrop" src={photo.imageUrl} alt="" aria-hidden="true" decoding="async" />
                  <img
                    className="carousel-image"
                    src={photo.imageUrl}
                    alt={photo.caption || `Photo ${i + 1}`}
                    decoding="async"
                    draggable={false}
                    onError={() => setFailed((current) => new Set(current).add(photo.id))}
                  />
                </>
              ) : null}
              {photo.caption && <figcaption className="carousel-caption">{photo.caption}</figcaption>}
            </figure>
          );
        })}

        {count > 1 && (
          <>
            <button type="button" className="carousel-nav carousel-nav-prev" aria-label="Previous photo" onClick={() => go(-1)}>
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="carousel-nav carousel-nav-next" aria-label="Next photo" onClick={() => go(1)}>
              <ChevronRight size={20} />
            </button>
          </>
        )}
        {running && <div key={active} className="carousel-progress" style={{ animationDuration: `${intervalMs}ms` }} />}
      </div>

      {count > 1 && (
        <div className="carousel-controls">
          <button
            type="button"
            className="carousel-pause"
            aria-label={userPaused ? "Resume slideshow" : "Pause slideshow"}
            aria-pressed={userPaused}
            onClick={() => setUserPaused((value) => !value)}
          >
            {userPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          {showDots && (
            <div className="carousel-dots">
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  className={cn("carousel-dot", i === active && "is-active")}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === active}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
          )}
          <span className="carousel-count">{active + 1} / {count}</span>
        </div>
      )}
    </div>
  );
}
