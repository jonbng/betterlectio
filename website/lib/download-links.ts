export const DOWNLOAD_LINKS = {
  ios: "https://apps.apple.com/dk/app/betterlectio/id6761808963",
  // Safari uses the same App Store listing as iOS.
  safari: "https://apps.apple.com/dk/app/betterlectio/id6761808963",
  chrome:
    "https://chromewebstore.google.com/detail/betterlectio/cbopfnaegoknpplkngoppmmomppimhkh?authuser=0&hl=en",
  firefox: "https://addons.mozilla.org/en-US/firefox/addon/betterlectio/",
  edge: "https://microsoftedge.microsoft.com/addons/detail/better-lectio/kkchnogenoakbemocdflbkmbibhllggp",
} as const

export type DownloadPlatform = keyof typeof DOWNLOAD_LINKS
