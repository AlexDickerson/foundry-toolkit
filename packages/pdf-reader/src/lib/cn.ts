/** Minimal className merge. Filters falsy values and joins with a space.
 *  Sufficient for the shared PDF reader components, which don't produce
 *  conflicting Tailwind utility classes that would require tailwind-merge. */
export function cn(...classes: (string | boolean | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
