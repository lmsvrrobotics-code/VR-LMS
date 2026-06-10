import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDashboardTheme } from "@/hooks/useDashboardTheme";

interface ThemeToggleProps {
  className?: string;
  /** Optional caption shown next to the switch (e.g. in a sidebar). */
  label?: string;
}

/**
 * Premium light/dark switch for the dashboards. A sliding pill with a
 * day → night gradient track, a morphing sun/moon knob, soft star accents,
 * and a focus glow. Reads/writes the scoped dashboard theme so it stays in
 * sync everywhere it is rendered.
 */
export function ThemeToggle({ className, label }: ThemeToggleProps) {
  const { isDark, toggle } = useDashboardTheme();

  const Switch = (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
      className={cn(
        "group relative inline-flex h-8 w-16 shrink-0 items-center rounded-full p-1",
        "transition-colors duration-500 ease-in-out",
        "ring-1 ring-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        isDark
          ? "bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 ring-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6),0_0_18px_-4px_rgba(99,102,241,0.6)] focus-visible:ring-indigo-400 focus-visible:ring-offset-slate-900"
          : "bg-gradient-to-br from-amber-300 via-orange-300 to-orange-400 ring-black/5 shadow-[inset_0_1px_2px_rgba(255,255,255,0.5),0_0_18px_-4px_rgba(249,115,22,0.55)] focus-visible:ring-orange-400 focus-visible:ring-offset-white",
        className
      )}
    >
      {/* Star accents — fade in only at night */}
      <span
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          isDark ? "opacity-100" : "opacity-0"
        )}
        aria-hidden="true"
      >
        <span className="absolute left-2 top-1.5 h-0.5 w-0.5 rounded-full bg-white/90" />
        <span className="absolute left-3.5 top-3 h-px w-px rounded-full bg-white/70" />
        <span className="absolute left-2.5 bottom-1.5 h-px w-px rounded-full bg-white/60" />
      </span>

      {/* Sliding knob with morphing icon */}
      <span
        className={cn(
          "relative z-10 flex h-6 w-6 items-center justify-center rounded-full",
          "transition-transform duration-500 ease-theme-spring",
          isDark
            ? "translate-x-8 bg-gradient-to-br from-slate-100 to-slate-300 shadow-[0_2px_6px_rgba(0,0,0,0.5)]"
            : "translate-x-0 bg-white shadow-[0_2px_6px_rgba(180,83,9,0.45)]"
        )}
      >
        <Sun
          className={cn(
            "absolute h-4 w-4 text-orange-500 transition-all duration-300",
            isDark ? "scale-0 -rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100"
          )}
        />
        <Moon
          className={cn(
            "absolute h-[15px] w-[15px] text-indigo-500 transition-all duration-300",
            isDark ? "scale-100 rotate-0 opacity-100" : "scale-0 rotate-90 opacity-0"
          )}
        />
      </span>
    </button>
  );

  if (!label) return Switch;

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {Switch}
    </div>
  );
}

export default ThemeToggle;
