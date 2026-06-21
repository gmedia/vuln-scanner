import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Select,
  SelectGroup,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "@/components/ui/Select";

describe("Select", () => {
  describe("SelectTrigger", () => {
    it("renders with children and ChevronDown icon", () => {
      render(
        <Select>
          <SelectTrigger>Choose option</SelectTrigger>
        </Select>
      );
      const trigger = screen.getByRole("combobox");
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent("Choose option");
      const chevron = trigger.querySelector("svg");
      expect(chevron).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(
        <Select>
          <SelectTrigger className="custom-trigger">Select</SelectTrigger>
        </Select>
      );
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveClass("custom-trigger");
    });

    it("renders with default styling classes", () => {
      render(
        <Select>
          <SelectTrigger>Select</SelectTrigger>
        </Select>
      );
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveClass("flex", "h-10", "w-full", "rounded-md", "border", "bg-card");
    });
  });

  describe("SelectItem", () => {
    it("renders with text inside SelectContent", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
          </SelectContent>
        </Select>
      );
      const items = screen.getAllByRole("option");
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("Apple");
    });

    it("applies custom className", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectItem value="apple" className="custom-item">
              Apple
            </SelectItem>
          </SelectContent>
        </Select>
      );
      const item = screen.getByRole("option");
      expect(item).toHaveClass("custom-item");
    });
  });

  describe("SelectLabel", () => {
    it("renders label text inside SelectGroup", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );
      expect(screen.getByText("Fruits")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="custom-label">Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );
      const label = screen.getByText("Fruits");
      expect(label).toHaveClass("custom-label");
    });
  });

  describe("SelectSeparator", () => {
    it("renders separator element inside SelectContent", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectItem value="a">A</SelectItem>
            <SelectSeparator />
            <SelectItem value="b">B</SelectItem>
          </SelectContent>
        </Select>
      );
      const separator = document.querySelector('[class*="h-px"]');
      expect(separator).toBeInTheDocument();
    });

    it("applies custom className", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectItem value="a">A</SelectItem>
            <SelectSeparator className="custom-sep" />
            <SelectItem value="b">B</SelectItem>
          </SelectContent>
        </Select>
      );
      const separator = document.querySelector('[class*="h-px"]');
      expect(separator).toBeInTheDocument();
      expect(separator).toHaveClass("custom-sep");
    });
  });

  describe("SelectContent", () => {
    it("renders children inside portal when open", () => {
      render(
        <Select defaultOpen>
          <SelectContent>
            <SelectItem value="one">One</SelectItem>
          </SelectContent>
        </Select>
      );
      const items = screen.getAllByRole("option");
      expect(items).toHaveLength(1);
      expect(items[0]).toHaveTextContent("One");
    });
  });

  describe("SelectScrollUpButton", () => {
    it("is a forwardRef component with displayName", () => {
      expect(SelectScrollUpButton.displayName).toBe("SelectScrollUpButton");
      expect(typeof SelectScrollUpButton).toBe("object");
    });
  });

  describe("SelectScrollDownButton", () => {
    it("is a forwardRef component with displayName", () => {
      expect(SelectScrollDownButton.displayName).toBe("SelectScrollDownButton");
      expect(typeof SelectScrollDownButton).toBe("object");
    });
  });
});
