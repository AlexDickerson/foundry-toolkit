// Small presentation helpers used across tabs.

export function formatSignedInt(value: number): string {
  if (value >= 0) return `+${value.toString()}`;
  return value.toString();
}
