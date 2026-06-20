import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Separator } from "@/components/ui/Separator";

describe("Card", () => {
  it("renders with children", () => {
    render(<Card>Card content</Card>);
    const card = screen.getByText("Card content");
    expect(card).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<Card className="custom-card">Styled</Card>);
    const card = container.querySelector("div");
    expect(card).toHaveClass("custom-card");
  });
});

describe("CardHeader", () => {
  it("renders with children", () => {
    render(<CardHeader>Header</CardHeader>);
    const header = screen.getByText("Header");
    expect(header).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <CardHeader className="custom-header">Header</CardHeader>,
    );
    const header = container.querySelector("div");
    expect(header).toHaveClass("custom-header");
  });
});

describe("CardTitle", () => {
  it("renders with children", () => {
    render(<CardTitle>Title</CardTitle>);
    const title = screen.getByText("Title");
    expect(title).toBeInTheDocument();
    expect(title.tagName).toBe("H3");
  });

  it("applies custom className", () => {
    const { container } = render(
      <CardTitle className="custom-title">Title</CardTitle>,
    );
    const title = container.querySelector("h3");
    expect(title).toHaveClass("custom-title");
  });
});

describe("CardDescription", () => {
  it("renders with children", () => {
    render(<CardDescription>Description</CardDescription>);
    const description = screen.getByText("Description");
    expect(description).toBeInTheDocument();
    expect(description.tagName).toBe("P");
  });

  it("applies custom className", () => {
    const { container } = render(
      <CardDescription className="custom-desc">Description</CardDescription>,
    );
    const description = container.querySelector("p");
    expect(description).toHaveClass("custom-desc");
  });
});

describe("CardContent", () => {
  it("renders with children", () => {
    render(<CardContent>Content</CardContent>);
    const content = screen.getByText("Content");
    expect(content).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <CardContent className="custom-content">Content</CardContent>,
    );
    const content = container.querySelector("div");
    expect(content).toHaveClass("custom-content");
  });
});

describe("CardFooter", () => {
  it("renders with children", () => {
    render(<CardFooter>Footer</CardFooter>);
    const footer = screen.getByText("Footer");
    expect(footer).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <CardFooter className="custom-footer">Footer</CardFooter>,
    );
    const footer = container.querySelector("div");
    expect(footer).toHaveClass("custom-footer");
  });
});

describe("Skeleton", () => {
  it("renders with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.querySelector("div");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass("animate-pulse");
  });

  it("applies custom className", () => {
    const { container } = render(
      <Skeleton className="h-10 w-20" />,
    );
    const skeleton = container.querySelector("div");
    expect(skeleton).toHaveClass("h-10");
    expect(skeleton).toHaveClass("w-20");
  });
});

describe("Separator", () => {
  it("renders horizontal orientation by default", () => {
    const { container } = render(<Separator />);
    const separator = container.firstChild;
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass("h-[1px]");
    expect(separator).toHaveClass("w-full");
  });

  it("renders vertical orientation", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const separator = container.firstChild;
    expect(separator).toBeInTheDocument();
    expect(separator).toHaveClass("h-full");
    expect(separator).toHaveClass("w-[1px]");
  });
});
