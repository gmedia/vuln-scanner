import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/Pagination";

describe("Pagination", () => {
  it("exposes prev/next as buttons with frozen aria-labels", () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious disabled />
          </PaginationItem>
          <PaginationItem>
            <span>Page 1 of 2</span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(screen.getByRole("navigation", { name: "pagination" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /previous page/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /next page/i }),
    ).not.toBeDisabled();
  });

  it("fires onClick on next", async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext onClick={onNext} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    await user.click(screen.getByRole("button", { name: /next page/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
