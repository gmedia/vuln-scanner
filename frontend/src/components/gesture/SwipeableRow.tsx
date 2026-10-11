import * as React from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REVEAL_WIDTH_PX,
  useRowSwipe,
} from "@/hooks/use-row-swipe";

export function SwipeableRow({
  actions,
  children,
  className,
  contentClassName,
  actionsClassName,
  revealWidth = DEFAULT_REVEAL_WIDTH_PX,
}: {
  readonly actions: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly actionsClassName?: string;
  readonly revealWidth?: number;
}) {
  const {
    rootRef,
    contentRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onActionsFocusCapture,
  } = useRowSwipe({ revealWidth });

  return (
    <div
      ref={rootRef}
      className={cn("relative overflow-hidden rounded-lg", className)}
    >
      <div
        className={cn("absolute inset-y-0 right-0 flex items-stretch", actionsClassName)}
        style={{ width: revealWidth }}
        onFocusCapture={onActionsFocusCapture}
      >
        {actions}
      </div>
      <div
        ref={contentRef}
        className={cn("relative touch-pan-y", contentClassName)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
