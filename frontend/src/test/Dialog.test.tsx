import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";

describe("Dialog", () => {
  describe("DialogOverlay", () => {
    it("renders overlay with default styling", () => {
      const { container } = render(
        <Dialog open>
          <DialogOverlay />
        </Dialog>
      );
      const overlay = container.firstChild as HTMLElement;
      expect(overlay).toBeInTheDocument();
      expect(overlay).toHaveClass("fixed", "inset-0", "z-50", "bg-black/80");
    });

    it("applies custom className", () => {
      const { container } = render(
        <Dialog open>
          <DialogOverlay className="custom-overlay" />
        </Dialog>
      );
      const overlay = container.firstChild as HTMLElement;
      expect(overlay).toHaveClass("custom-overlay");
    });
  });

  describe("DialogContent", () => {
    it("renders content with children inside portal", () => {
      render(
        <Dialog open>
          <DialogContent>Hello Dialog</DialogContent>
        </Dialog>
      );
      const content = screen.getByText("Hello Dialog");
      expect(content).toBeInTheDocument();
    });

    it("renders close button with X icon and sr-only text", () => {
      render(
        <Dialog open>
          <DialogContent>Content</DialogContent>
        </Dialog>
      );
      const closeButton = document.querySelector(
        'button[class*="absolute"]'
      ) as HTMLElement;
      expect(closeButton).toBeInTheDocument();
      const xIcon = closeButton.querySelector("svg");
      expect(xIcon).toBeInTheDocument();
      const srOnly = closeButton.querySelector(".sr-only");
      expect(srOnly).toBeInTheDocument();
      expect(srOnly?.textContent).toBe("Close");
    });

    it("renders with default styling classes", () => {
      render(
        <Dialog open>
          <DialogContent data-testid="dialog-content">Content</DialogContent>
        </Dialog>
      );
      const content = screen.getByTestId("dialog-content");
      expect(content).toHaveClass("fixed", "z-50", "gap-4", "border", "bg-card", "p-6", "shadow-lg");
    });

    it("applies custom className to content", () => {
      render(
        <Dialog open>
          <DialogContent className="custom-dialog" data-testid="dialog-content">
            Content
          </DialogContent>
        </Dialog>
      );
      const content = screen.getByTestId("dialog-content");
      expect(content).toHaveClass("custom-dialog");
    });
  });

  describe("DialogTitle", () => {
    it("renders title with text", () => {
      render(
        <Dialog open>
          <DialogTitle>My Dialog</DialogTitle>
        </Dialog>
      );
      const title = screen.getByText("My Dialog");
      expect(title).toBeInTheDocument();
      expect(title.tagName).toBe("H2");
    });

    it("applies custom className", () => {
      render(
        <Dialog open>
          <DialogTitle className="custom-title">Title</DialogTitle>
        </Dialog>
      );
      const title = screen.getByText("Title");
      expect(title).toHaveClass("custom-title");
    });
  });

  describe("DialogDescription", () => {
    it("renders description with text", () => {
      render(
        <Dialog open>
          <DialogDescription>A helpful description</DialogDescription>
        </Dialog>
      );
      const desc = screen.getByText("A helpful description");
      expect(desc).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(
        <Dialog open>
          <DialogDescription className="custom-desc">Desc</DialogDescription>
        </Dialog>
      );
      const desc = screen.getByText("Desc");
      expect(desc).toHaveClass("custom-desc");
    });
  });

  describe("DialogHeader", () => {
    it("renders with children", () => {
      render(<DialogHeader>Header content</DialogHeader>);
      const header = screen.getByText("Header content");
      expect(header).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <DialogHeader className="custom-header">Header</DialogHeader>
      );
      const header = container.querySelector("div");
      expect(header).toHaveClass("custom-header");
    });
  });

  describe("DialogFooter", () => {
    it("renders with children", () => {
      render(<DialogFooter>Footer content</DialogFooter>);
      const footer = screen.getByText("Footer content");
      expect(footer).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <DialogFooter className="custom-footer">Footer</DialogFooter>
      );
      const footer = container.querySelector("div");
      expect(footer).toHaveClass("custom-footer");
    });
  });
});
