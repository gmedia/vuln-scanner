import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeableRow } from "@/components/gesture/SwipeableRow";
import {
  clampRevealOffset,
  shouldReveal,
  FLICK_VELOCITY_PX_PER_MS,
} from "@/hooks/use-row-swipe";

const REVEAL = 100;

function Harness({ onAction }: { onAction?: () => void }) {
  return (
    <SwipeableRow
      revealWidth={REVEAL}
      actions={
        <button type="button" data-testid="action" onClick={onAction}>
          Delete
        </button>
      }
    >
      <div data-testid="content">Row</div>
    </SwipeableRow>
  );
}

function contentWrap(): HTMLElement {
  const wrap = screen.getByTestId("content").parentElement;
  if (!wrap) throw new Error("content wrapper missing");
  Object.assign(wrap, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  });
  return wrap as HTMLElement;
}

function expectClosed(wrap: HTMLElement) {
  expect(wrap.style.transform).toBe("translateX(0px)");
}

function expectRevealed(wrap: HTMLElement) {
  expect(wrap.style.transform).toBe(`translateX(-${REVEAL}px)`);
}

function swipeLeft(wrap: HTMLElement, dx: number, dy = 0) {
  fireEvent.pointerDown(wrap, { pointerId: 1, clientX: 300, clientY: 300 });
  fireEvent.pointerMove(wrap, {
    pointerId: 1,
    clientX: 300 + dx,
    clientY: 300 + dy,
  });
  fireEvent.pointerUp(wrap, {
    pointerId: 1,
    clientX: 300 + dx,
    clientY: 300 + dy,
  });
}

describe("useRowSwipe pure helpers", () => {
  it("clamps reveal offsets to [-revealWidth, 0]", () => {
    expect(clampRevealOffset(-250, REVEAL)).toBe(-REVEAL);
    expect(clampRevealOffset(40, REVEAL)).toBe(0);
    expect(clampRevealOffset(-60, REVEAL)).toBe(-60);
  });

  it("reveals past half the panel width", () => {
    expect(shouldReveal({ offset: -50, revealWidth: REVEAL, velocity: 0 })).toBe(true);
    expect(shouldReveal({ offset: -49, revealWidth: REVEAL, velocity: 0 })).toBe(false);
  });

  it("only treats a release as a flick past a minimum travel", () => {
    expect(
      shouldReveal({ offset: -10, revealWidth: REVEAL, velocity: -FLICK_VELOCITY_PX_PER_MS - 0.1 }),
    ).toBe(false);
    expect(
      shouldReveal({ offset: -90, revealWidth: REVEAL, velocity: FLICK_VELOCITY_PX_PER_MS + 0.1 }),
    ).toBe(false);
    expect(
      shouldReveal({ offset: -40, revealWidth: REVEAL, velocity: -FLICK_VELOCITY_PX_PER_MS - 0.1 }),
    ).toBe(true);
  });
});

describe("SwipeableRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reveals the action panel on a long left swipe", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -REVEAL);
    expectRevealed(wrap);
    expect(wrap.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it("does not reveal on a short swipe", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -20);
    expectClosed(wrap);
  });

  it("ignores a vertical scroll gesture", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -5, -120);
    expectClosed(wrap);
  });

  it("does not reveal on a rightward drag", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, 60);
    expectClosed(wrap);
  });

  it("closes when tapping the content while revealed", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -REVEAL);
    expectRevealed(wrap);

    fireEvent.pointerDown(wrap, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerUp(wrap, { pointerId: 2, clientX: 300, clientY: 300 });
    expectClosed(wrap);
    expect(fireEvent.click(wrap)).toBe(false);
  });

  it("closes on an outside pointerdown", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -REVEAL);
    expectRevealed(wrap);

    fireEvent.pointerDown(document.body, { pointerId: 3, clientX: 5, clientY: 5 });
    expectClosed(wrap);
  });

  it("closes on Escape", () => {
    render(<Harness />);
    const wrap = contentWrap();
    swipeLeft(wrap, -REVEAL);
    expectRevealed(wrap);

    fireEvent.keyDown(document, { key: "Escape" });
    expectClosed(wrap);
  });

  it("runs the revealed action", () => {
    const onAction = vi.fn();
    render(<Harness onAction={onAction} />);
    const wrap = contentWrap();
    swipeLeft(wrap, -REVEAL);

    fireEvent.click(screen.getByTestId("action"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("suppresses the click after a swipe but keeps plain taps", () => {
    render(<Harness />);
    const wrap = contentWrap();

    expect(fireEvent.click(wrap)).toBe(true);

    swipeLeft(wrap, -20);
    expect(fireEvent.click(wrap)).toBe(false);
    expect(fireEvent.click(wrap)).toBe(true);
  });

  it("snaps back on pointercancel", () => {
    render(<Harness />);
    const wrap = contentWrap();

    fireEvent.pointerDown(wrap, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(wrap, { pointerId: 1, clientX: 200, clientY: 300 });
    expect(wrap.style.transform).toBe(`translateX(-${REVEAL}px)`);
    fireEvent.pointerCancel(wrap, { pointerId: 1, clientX: 200, clientY: 300 });
    expectClosed(wrap);
  });
});
