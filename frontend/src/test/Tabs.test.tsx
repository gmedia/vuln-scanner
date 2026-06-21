import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";

describe("Tabs", () => {
  it("TabsList renders children", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
  });

  it("TabsTrigger renders with data-state", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const active = screen.getByRole("tab", { name: "Tab 1" });
    expect(active).toHaveAttribute("data-state", "active");
    const inactive = screen.getByRole("tab", { name: "Tab 2" });
    expect(inactive).toHaveAttribute("data-state", "inactive");
  });

  it("TabsContent renders children", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsContent value="tab1">Content 1</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Content 1")).toBeInTheDocument();
  });

  it("TabsList applies custom className", () => {
    const { container } = render(
      <Tabs defaultValue="tab1">
        <TabsList className="custom-list">
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const list = container.querySelector('[role="tablist"]');
    expect(list).toHaveClass("custom-list");
  });

  it("TabsTrigger applies custom className", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1" className="custom-trigger">
            Tab 1
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const trigger = screen.getByRole("tab", { name: "Tab 1" });
    expect(trigger).toHaveClass("custom-trigger");
  });

  it("TabsContent applies custom className", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsContent value="tab1" className="custom-content">
          Content 1
        </TabsContent>
      </Tabs>,
    );
    const content = screen.getByText("Content 1");
    expect(content).toHaveClass("custom-content");
  });
});
