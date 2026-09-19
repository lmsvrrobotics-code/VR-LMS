/**
 * Class helpers for the collapsible student / teacher sidebar rails.
 *
 * The rails expand on hover. Labels must stay MOUNTED across that transition
 * and fade, rather than being conditionally rendered ({expanded && <span>}):
 * unmounting made the text appear instantly at full opacity while the panel was
 * still widening, which is the pop that made the motion read as a jerk.
 *
 * The easing lives in index.css (.sidebar-rail / .sidebar-pad / .sidebar-label).
 * These helpers exist so the two rails cannot drift apart, and so the
 * show/hide state is testable without rendering a component.
 */

/**
 * Class for a label that fades with the rail.
 *
 * @param expanded whether the rail is showing labels
 * @param extra    layout classes for this particular label
 */
export const labelClass = (expanded: boolean, extra = ""): string =>
  `${extra ? `${extra} ` : ""}sidebar-label ${expanded ? "is-shown" : "is-hidden"}`;

/**
 * Props every fading label needs.
 *
 * Collapsed labels are pulled out of the accessibility tree — a screen reader
 * should not announce text a sighted user cannot see.
 *
 * `inert` matters because the labels are no longer hidden with
 * `visibility: hidden` (that was transitioned, and the mis-ordered
 * transition-delay behind it caused a blink on hover). Opacity alone leaves
 * descendants focusable, and one of these wrappers contains a real button —
 * the theme toggle — which would otherwise be tabbable while invisible.
 *
 * It is emitted as the STRING "true", and omitted entirely when expanded.
 * React 18 does not recognise `inert` as a boolean prop: `inert={true}` is
 * dropped with a console warning, and any present value — including
 * inert="false" — activates it, which would disable the labels that are
 * supposed to be interactive. Browsers without `inert` support still get
 * aria-hidden plus pointer-events:none from the CSS.
 */
export const labelProps = (expanded: boolean, extra = "") => ({
  className: labelClass(expanded, extra),
  "aria-hidden": !expanded,
  ...(expanded ? {} : { inert: "true" }),
});

/**
 * Row padding class. The padding step is animated (.sidebar-pad) so icons glide
 * into their expanded position instead of snapping at the midpoint of the
 * width transition.
 *
 * @param collapsedPx the collapsed horizontal padding, chosen per row so the
 *                    icon stays optically centred in the 76px rail
 */
export const rowPadClass = (expanded: boolean, collapsedPx: string, expandedClass = "px-6"): string =>
  `sidebar-pad ${expanded ? expandedClass : collapsedPx}`;

/**
 * Classes for the rail element itself.
 *
 * `is-collapsed` drives the scrollbar suppression in index.css. It is a plain
 * class, NOT `lg:is-collapsed` — Tailwind's responsive prefixes only apply to
 * classes Tailwind generates, so `lg:` on a hand-written class silently emits
 * no rule at all. The desktop scoping is a media query in the stylesheet.
 *
 * @param expanded whether the rail is showing labels
 */
export const railStateClass = (expanded: boolean): string =>
  expanded ? "w-64 lg:shadow-2xl" : "w-64 lg:w-[76px] is-collapsed";
