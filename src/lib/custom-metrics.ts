/** Metric ids are user-typed - normalize to a safe, unique identifier. */
export function slugifyMetricId(displayName: string): string {
  return (
    "custom_" +
    displayName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
  );
}
