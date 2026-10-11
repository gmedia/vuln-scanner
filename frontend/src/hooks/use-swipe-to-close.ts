import * as React from "react";

/**
 * Swipe-to-close gesture for a left-anchored off-canvas drawer.
 *
 * The gesture lives on an inner "surface" element (not on the Radix
 * `SheetContent` host). The host keeps ownership of the open/close keyframe
 * animation (`transform: scale()` + opacity), while this surface owns
 * `transform: translateX()`. Because they are different elements, the two
 * transforms never fight and the drag can hand off into the exit animation
 * without a snap.
 */

/** Ignore gestures that begin within this many px of the viewport left edge. */
export const EDGE_GUARD_PX = 24;
/** Minimum pointer travel before the gesture commits to an axis. */
export const START_THRESHOLD_PX = 8;
/** Absolute close distance, capped by the drawer width fraction. */
export const MIN_CLOSE_PX = 96;
/** Close once the drawer has been dragged this fraction of its width. */
export const CLOSE_FRACTION = 0.3;
/** A leftward flick faster than this (px/ms) closes even on a short drag. */
export const FLICK_VELOCITY_PX_PER_MS = 0.45;
/** Minimum travel for a flick to count. */
export const FLICK_MIN_PX = 24;
/** Duration of the wrapper's slide-out / snap-back transition. */
export const CLOSE_DURATION_MS = 180;
/** Vertical travel must exceed horizontal by this factor to count as scroll. */
export const VERTICAL_DOMINANCE = 1.25;
/** Velocity is measured over the trailing window of samples. */
export const VELOCITY_WINDOW_MS = 120;

export interface SwipeToCloseOptions {
  /** Only listen while the drawer is open. */
  readonly enabled: boolean;
  readonly onClose: () => void;
}

export interface SwipeToClose {
  readonly ref: React.RefObject<HTMLDivElement | null>;
  readonly onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onLostPointerCapture: (
    event: React.PointerEvent<HTMLDivElement>,
  ) => void;
  readonly onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => void;
}

/** Clamp a horizontal drag to [-width, 0]; rightward drags never move the panel. */
export function clampOffset(dx: number, width: number): number {
  return Math.max(-width, Math.min(0, dx));
}

/** True when vertical travel dominates, i.e. the user is scrolling, not swiping. */
export function isVerticalScroll(dx: number, dy: number): boolean {
  return Math.abs(dy) >= VERTICAL_DOMINANCE * Math.abs(dx);
}

/**
 * Decide whether releasing the drawer at `offset` with `velocity` (px/ms,
 * negative = leftward) should close it.
 */
export function shouldCloseOnRelease(input: {
  readonly offset: number;
  readonly width: number;
  readonly velocity: number;
}): boolean {
  const moved = Math.abs(input.offset);
  const minClose = Math.min(MIN_CLOSE_PX, CLOSE_FRACTION * input.width);
  if (moved >= minClose) return true;
  return input.velocity <= -FLICK_VELOCITY_PX_PER_MS && moved >= FLICK_MIN_PX;
}

type Sample = { readonly x: number; readonly t: number };

type GestureSession = {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  active: boolean;
  ignored: boolean;
  offset: number;
  samples: Sample[];
};

export function useSwipeToClose({
  enabled,
  onClose,
}: SwipeToCloseOptions): SwipeToClose {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const session = React.useRef<GestureSession | null>(null);
  const suppressClick = React.useRef(false);

  const applyTransform = React.useCallback((px: number, animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate
      ? `transform ${CLOSE_DURATION_MS}ms ease-out`
      : "none";
    el.style.transform = `translateX(${px}px)`;
  }, []);

  const clearInline = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = "";
    el.style.userSelect = "";
  }, []);

  // Start every open from a clean surface (no stale transform/transition).
  React.useLayoutEffect(() => {
    if (enabled) clearInline();
  }, [enabled, clearInline]);

  const releaseCapture = React.useCallback((pointerId: number) => {
    const el = ref.current;
    try {
      el?.releasePointerCapture?.(pointerId);
    } catch {
      // Element may already be gone; nothing to release.
    }
  }, []);

  const endSession = React.useCallback(
    (pointerId: number) => {
      releaseCapture(pointerId);
      session.current = null;
      if (ref.current) ref.current.style.userSelect = "";
    },
    [releaseCapture],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!event.isPrimary) return;
      // Leave the OS back-swipe / edge gestures alone.
      if (event.clientX <= EDGE_GUARD_PX) return;
      const el = ref.current;
      if (!el) return;
      const width = el.getBoundingClientRect().width;
      if (!width) return;
      // Reset per gesture: a swipe-close emits no trailing click, so a stale flag would swallow the next tap.
      suppressClick.current = false;
      session.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        width,
        active: false,
        ignored: false,
        offset: 0,
        samples: [{ x: event.clientX, t: event.timeStamp }],
      };
    },
    [enabled],
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
        if (isVerticalScroll(dx, dy)) {
          current.ignored = true;
          return;
        }
        if (dx >= 0) return; // rightward drags never activate
        current.active = true;
        suppressClick.current = true;
        const el = ref.current;
        try {
          el?.setPointerCapture?.(event.pointerId);
        } catch {
          // Pointer capture is best-effort.
        }
        if (el) el.style.userSelect = "none";
      }

      const offset = clampOffset(dx, current.width);
      current.offset = offset;

      const now = event.timeStamp;
      current.samples.push({ x: event.clientX, t: now });
      while (
        current.samples.length > 1 &&
        now - current.samples[0].t > VELOCITY_WINDOW_MS
      ) {
        current.samples.shift();
      }

      applyTransform(offset, false);
    },
    [applyTransform],
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

        if (
          shouldCloseOnRelease({
            offset: current.offset,
            width: current.width,
            velocity,
          })
        ) {
          const el = ref.current;
          if (el) {
            // Commit the live offset, then slide the rest of the way out.
            el.style.transition = "none";
            el.style.transform = `translateX(${current.offset}px)`;
            void el.offsetWidth; // force reflow so the transition starts here
            el.style.transition = `transform ${CLOSE_DURATION_MS}ms ease-out`;
            el.style.transform = `translateX(${-current.width}px)`;
          }
          onClose();
        } else {
          applyTransform(0, true);
        }
      }

      endSession(event.pointerId);
    },
    [applyTransform, endSession, onClose],
  );

  const onPointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active) applyTransform(0, true);
      endSession(event.pointerId);
    },
    [applyTransform, endSession],
  );

  const onLostPointerCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const current = session.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (current.active) applyTransform(0, true);
      session.current = null;
      if (ref.current) ref.current.style.userSelect = "";
    },
    [applyTransform],
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

  return {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClickCapture,
  };
}
