import { cn } from "@/lib/utils"

/**
 * Shared Tailwind class helpers for the marketing site's reused primitives.
 * The bespoke `.site-*` CSS was migrated to utilities; these two primitives are
 * used across many surfaces, so they live here to stay DRY and consistent.
 */

/** The shared max-width page gutter (was `.site-container`). */
export const siteContainerClass =
  "relative mx-auto w-full max-w-[1200px] px-[22px] min-[720px]:px-10"

/** The `<main>` wrapper (was `.site-main`): sits above the diagonal, grows. */
export const siteMainClass = "relative z-[1] flex-[1_0_auto]"

/** Vertical rhythm for text/content pages (was `.site-page`). */
export const sitePageClass = "pt-10 pb-[110px]"

export type SiteButtonVariant = "primary" | "secondary" | "ghost"

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2.5 rounded-full border border-transparent px-[30px] py-3.5 text-base font-bold tracking-[-0.01em] no-underline transition-[transform,opacity,box-shadow,border-color] duration-300 [&_svg]:size-[18px] focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-brand motion-reduce:transition-none"

const BUTTON_VARIANTS: Record<SiteButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-[0_10px_26px_-10px_color-mix(in_oklch,var(--blue)_42%,transparent)] hover:-translate-y-px hover:scale-[1.01] hover:opacity-[0.92]",
  secondary:
    "border-[#d2d2d7] bg-white text-ink hover:-translate-y-px hover:scale-[1.01] hover:border-[#b9b9c0]",
  ghost:
    "bg-white/[0.16] text-white hover:bg-white/[0.26] focus-visible:outline-white",
}

export function siteButton(
  variant: SiteButtonVariant = "primary",
  className?: string,
) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className)
}

export type SiteEyebrowTone = "muted" | "volt" | "ink" | "white"

const EYEBROW_BASE =
  "inline-block font-mono text-xs uppercase tracking-[0.02em]"

const EYEBROW_TONES: Record<SiteEyebrowTone, string> = {
  muted: "text-ink-muted",
  volt: "text-volt",
  ink: "text-ink",
  white: "text-white/85",
}

export function siteEyebrow(tone: SiteEyebrowTone = "muted", className?: string) {
  return cn(EYEBROW_BASE, EYEBROW_TONES[tone], className)
}
