"use client"

import { useEffect } from "react"

/**
 * Drives the hero's scroll parallax (device mockup, floating cards, diagonal
 * ground). Renders nothing — the markup lives in the server-rendered landing
 * page so the hero copy stays in the initial HTML. No-op on small screens
 * (the mockup is un-transformed there) and when reduced motion is requested.
 */
export function ParallaxController() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.innerWidth <= 720) return

    const mockup = document.querySelector<HTMLElement>(".site-mockup")
    const gpa = document.querySelector<HTMLElement>(".site-float--gpa")
    const dark = document.querySelector<HTMLElement>(".site-float--dark")
    const diag = document.querySelector<HTMLElement>(".site-diagonal")

    let raf = 0
    const update = () => {
      const s = window.scrollY
      if (mockup)
        mockup.style.transform = `rotateY(${-15 + s / 50}deg) rotateX(${5 + s / 100}deg) translateY(${s / 12}px)`
      if (gpa) gpa.style.transform = `rotate(${5 + s / 25}deg) translateY(${-s / 6}px)`
      if (dark) dark.style.transform = `rotate(${-4 - s / 30}deg) translateY(${s / 9}px)`
      if (diag) diag.style.transform = `translateY(${s * 0.2}px)`
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  return null
}
