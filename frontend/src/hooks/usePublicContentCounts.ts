import { useEffect, useState } from "react";
import axios from "axios";

const ADMIN_BASE =
  (import.meta.env.VITE_ADMIN_API_URL as string) || "http://localhost:5000";

export interface PublicContentCounts {
  books: number;
  kits: number;
  gallery: number;
  locations: number;
  projects: number;
  testimonials: number;
}

// Fail OPEN: until the counts arrive we assume content exists, so the navbar
// renders its full set on first paint and hides tabs only once the server has
// actually confirmed a section is empty. The inverse default (start at 0) would
// make every tab flicker in after load, which looks broken on a fast connection
// and hides real tabs entirely if the request fails.
const ASSUME_PRESENT: PublicContentCounts = {
  books: 1, kits: 1, gallery: 1, locations: 1, projects: 1, testimonials: 1,
};

// Module-level cache: the Navbar mounts on every page, and these counts change
// only when an admin edits content. Fetch once per page load, not per route.
let cached: PublicContentCounts | null = null;
let inflight: Promise<PublicContentCounts> | null = null;

const fetchCounts = (): Promise<PublicContentCounts> => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = axios
      .get(`${ADMIN_BASE}/api/public/content-counts`, { timeout: 15000 })
      .then((r) => {
        cached = { ...ASSUME_PRESENT, ...(r.data as Partial<PublicContentCounts>) };
        return cached;
      })
      .catch(() => ASSUME_PRESENT) // backend down → show everything
      .finally(() => { inflight = null; });
  }
  return inflight;
};

/**
 * Counts of the admin-managed public content, for hiding empty nav tabs.
 *
 * A tab is hidden only when the server explicitly reports 0 for that section.
 */
export const usePublicContentCounts = (): PublicContentCounts => {
  const [counts, setCounts] = useState<PublicContentCounts>(cached ?? ASSUME_PRESENT);

  useEffect(() => {
    let alive = true;
    fetchCounts().then((c) => { if (alive) setCounts(c); });
    return () => { alive = false; };
  }, []);

  return counts;
};
