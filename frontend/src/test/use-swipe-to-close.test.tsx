import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  useSwipeToClose,
  clampOffset,
  isVerticalScroll,
  shouldCloseOnRelease,
  CLOSE_FRACTION,
  FLICK_MIN_PX,
  MIN_CLOSE_PX,
} from "@/hooks/use-swipe-to-close";

function Harness({
  enabled,
  onClose,
}: {
  enabled: boolean;
  onClose: () => void;
}) {
  const {
    ref,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onClickCapture,
  } = useSwipeToClose({ enabled, onClose });
  return (
    <div
      ref={ref}
      data-testid="surface"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onClickCapture={onClickCapture}
    />
  );
}

function armCapture(el: HTMLElement) {
  Object.assign(el, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  });
}

// setup.ts gives every zero-sized element width=500, height=300 in jsdom.
const WIDTH = 500;

describe("useSwipeToClose pure helpers", () => {
  it("clamps drag offsets to [-width, 0]", () => {
    expect(clampOffset(-600, WIDTH)).toBe(-WIDTH);
    expect(clampOffset(50, WIDTH)).toBe(0);
    expect(clampOffset(-120, WIDTH)).toBe(-120);
  });

  it("detects vertical-dominant movement as scroll", () => {
    expect(isVerticalScroll(-5, 100)).toBe(true);
    expect(isVerticalScroll(40, 10)).toBe(false);
    expect(isVerticalScroll(10, 20)).toBe(true);
  });

  it("closes past the distance threshold", () => {
    const minClose = Math.min(MIN_CLOSE_PX, CLOSE_FRACTION * WIDTH);
    expect(shouldCloseOnRelease({ offset: -minClose, width: WIDTH, velocity: 0 })).toBe(true);
    expect(
      shouldCloseOnRelease({ offset: -minClose + 1, width: WIDTH, velocity: 0 }),
    ).toBe(false);
  });

  it("closes on a fast left flick even when short", () => {
    expect(
      shouldCloseOnRelease({ offset: -FLICK_MIN_PX, width: WIDTH, velocity: -0.5 }),
    ).toBe(true);
    // same flick distance but below the min travel -> no close
    expect(
      shouldCloseOnRelease({ offset: -FLICK_MIN_PX + 1, width: WIDTH, velocity: -0.5 }),
    ).toBe(false);
    // fast enough distance but rightward velocity -> no close
    expect(
      shouldCloseOnRelease({ offset: -FLICK_MIN_PX, width: WIDTH, velocity: 0.1 }),
    ).toBe(false);
  });
});

describe("useSwipeToClose gesture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes the drawer on a long left swipe", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: 100 });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(el.style.transform).toBe(`translateX(${-WIDTH}px)`);
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("snaps back and does not close on a short swipe", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 80, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 80, clientY: 100 });

    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("translateX(0px)");
  });

  it("ignores a vertical scroll gesture", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 95, clientY: 220 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 95, clientY: 220 });

    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
  });

  it("ignores a rightward drag", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 220, clientY: 100 });

    expect(el.style.transform).toBe("");
  });

  it("ignores gestures that start at the viewport edge", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 10, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: -200, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: -200, clientY: 100 });

    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe("");
  });

  it("suppresses the click that follows an activated swipe but keeps plain taps", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    // Plain tap: click must pass through.
    expect(fireEvent.click(el)).toBe(true);

    // Swipe: the trailing click must be swallowed.
    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 80, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 80, clientY: 100 });
    expect(fireEvent.click(el)).toBe(false);
    // ...and only once.
    expect(fireEvent.click(el)).toBe(true);
  });

  it("does not swallow a tap after a swipe-close", () => {
    const onClose = vi.fn();
    render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: 100 });
    expect(onClose).toHaveBeenCalledTimes(1);

    // A swipe-close emits no click; the next plain tap must still go through.
    fireEvent.pointerDown(el, { pointerId: 2, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 2, clientX: 150, clientY: 100 });
    expect(fireEvent.click(el)).toBe(true);
  });

  it("does nothing while disabled", () => {
    const onClose = vi.fn();
    render(<Harness enabled={false} onClose={onClose} />);
    const el = screen.getByTestId("surface");
    armCapture(el);

    fireEvent.pointerDown(el, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 0, clientY: 100 });
    fireEvent.pointerUp(el, { pointerId: 1, clientX: 0, clientY: 100 });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("clears inline styles when the drawer reopens", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Harness enabled onClose={onClose} />);
    const el = screen.getByTestId("surface");
    el.style.transform = "translateX(-80px)";
    el.style.transition = "transform 180ms ease-out";

    rerender(<Harness enabled={false} onClose={onClose} />);
    rerender(<Harness enabled onClose={onClose} />);

    expect(el.style.transform).toBe("");
    expect(el.style.transition).toBe("");
  });
});
