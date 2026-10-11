import * as React from "react";

/**
 * Horizontal swipe-to-reveal gesture for a list row.
 *
 * The row content translates left to uncover a fixed-width action panel that
 * sits behind it. The gesture lives on the content element; the panel is
 * clipped by the row root, so no layout shift occurs and vertical scrolling
 * inside the row keeps working.
 */

/** Minimum pointer travel before committing to an axis. */
export const START_THRESHOLD_PX = 8;
/** Default width of the revealed action panel. */
export const DEFAULT_REVEAL_WIDTH_PX = 96;
/** Horizontal flick faster than this (px/ms) decides open/close on release. */
export const FLICK_VELOCITY_PX_PER_MS = 0.45;
/** Duration of the reveal / reset transition. */
export const REVEAL_DURATION_MS = 180;
/** Vertical travel must exceed horizontal by this factor to count as scroll. */
export const VERTICAL_DOMINANCE = 1.25;
/** Velocity is measured over the trailing window of samples. */
export const VELOCITY_WINDOW_MS = 120;

/** Clamp a reveal drag to [-revealWidth, 0]; rightward drags never move the row. */
export function clampRevealOffset(offset: number, revealWidth: number): number {
  return Math.max(-revealWidth, Math.min(0, offset));
}

/**
 * Decide whether releasing at `offset` with `velocity` (px/ms, negative =
 * leftward) should leave the action panel revealed.
 */
export function shouldReveal(input: {
  readonly offset: number;
  readonly revealWidth: number;
  readonly velocity: number;
}): boolean {
  if (input.velocity <= -FLICK_VELOCITY_PX_PER_MS) return true;
  if (input.velocity >= FLICK_VELOCITY_PX_PER_MS) return false;
  return Math.abs(input.offset) >= input.revealWidth / 2;
}

export interface UseRowSwipeOptions {
  readonly revealWidth?: number;
}

export interface RowSwipe {
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  readonly contentRef: React.RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly close: () => void;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onActionsFocusCapture: () => void;
}

type Sample = { readonly x: number; readonly t: number };

type GestureSession = {
  pointerId: number;
  startX: number;
  startY: number;
  baseOffset: number;
  active: boolean;
  ignored: boolean;
  offset: number;
  samples: Sample[];
};

export function useRowSwipe({
  revealWidth = DEFAULT_REVEAL_WIDTH_PX,
}: UseRowSwipeOptions = {}): RowSwipe {
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const session = React.useRef<GestureSession | null>(null);
  const suppressClick = React.useRef(false);

  const applyOffset = React.useCallback((px: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${REVEAL_DURATION_MS}ms ease-out`
      : "none";
    el.style.transform = `translateX(${px}px)`;
  }, []);

  // Settle to the resting position on any programmatic open/close (outside tap, Escape, focus, action click).
  React.useLayoutEffect(() => {
    applyOffset(open ? -revealWidth : 0, true);
  }, [open, revealWidth, applyOffset]);

  React.useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const releaseCapture = React.useCallback((pointerId: number) => {
    try {
      contentRef.current?.releasePointerCapture?.(pointerId);
    } catch {
      // Capture may already be gone; nothing to release.
    }
  }, []);

  const endSession = React.useCallback(
    (pointerId: number) => {
      releaseCapture(pointerId);
      session.current = null;
      if (contentRef.current) contentRef.current.style.userSelect = "";
    },
    [releaseCapture],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!event.isPrimary) return;
      // Reset per gesture: a swipe emits no trailing click, so a stale flag would swallow the next tap.
      suppressClick.current = false;
      const base = open ? -revealWidth : 0;
      session.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseOffset: base,
        active: false,
        ignored: false,
        offset: base,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };
    },
    [open, revealWidth],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session.current;
      if (
        !current ||
        current.pointerId !== event.pointerId ||
        current.ignored
      ) {
        return;
      }
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;

      if (!current.active) {
        if (Math.hypot(dx, dy) < START_THRESHOLD_PX) return;
        if (Math.abs(dy) >= VERTICAL_DOMINANCE * Math.abs(dx)) {
          current.ignored = true;
          return;
        }
        current.active = true;
        suppressClick.current = true;
        const el = contentRef.current;
        try {
          el?.setPointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture is best-effort.
        }
        if (el) el.style.userSelect = "none";
      }

      const offset = clampRevealOffset(current.baseOffset + dx, revealWidth);
      current.offset = offset;

      const now = event.timeStamp;
      current.samples.push({ x: event.clientX, t: now });
      while (
        current.samples.length > 1 &&
        now - current.samples[0].t > VELOCITY_WINDOW_MS
      ) {
        current.samples.shift();
      }

      applyOffset(offset, false);
    },
    [applyOffset, revealWidth],
  );

  const onPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;

      if (current.active) {
        const first = current.samples[0];
        const last = current.samples[current.samples.length - 1];
        const dt = last.t - first.t;
        const velocity = dt > 0 ? (last.x - first.x) / dt : 0;
        const next = shouldReveal({
          offset: current.offset,
          revealWidth,
          velocity,
        });
        setOpen(next);
        applyOffset(next ? -revealWidth : 0, true);
      } else if (open) {
        // A tap on the content while revealed closes the row and swallows the tap.
        setOpen(false);
        applyOffset(0, true);
        suppressClick.current = true;
      }

      endSession(event.pointerId);
    },
    [applyOffset, endSession, open, revealWidth],
  );

  const onPointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active) applyOffset(current.baseOffset, true);
      endSession(event.pointerId);
    },
    [applyOffset, endSession],
  );

  const onClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const onActionsFocusCapture = React.useCallback(() => {
    setOpen(true);
  }, []);

  const close = React.useCallback(() => {
    setOpen(false);
  }, []);

  return {
    rootRef,
    contentRef,
    open,
    close,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onActionsFocusCapture,
  };
}
