export function aiItemGridClass(count: number): string {
  return count >= 3
    ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    : "grid grid-cols-1 gap-4";
}
