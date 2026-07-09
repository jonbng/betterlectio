import { ImageResponse } from "next/og"

// Shared 1200×630 Open Graph renderer used by the file-based `opengraph-image`
// / `twitter-image` routes. Kept font-free (Satori's built-in sans) so static
// generation of the many per-school images never depends on a network fetch.

export const OG_SIZE = { width: 1200, height: 630 } as const
export const OG_CONTENT_TYPE = "image/png"

// The BetterLectio glyph from `app/icon.svg`, recoloured for the dark OG ground.
const LOGO_PATH =
  "M124.195 462.295C114.509 458.656 115.316 471.775 115.295 317.536C115.276 166.892 115.215 168.558 121.5 147.531C165.305 0.990779 378.667 22.6316 394.93 175.264C396.058 185.854 396.039 292.002 394.907 303.646C386.971 385.269 323.428 451.2 242.681 461.592C232.71 462.876 127.402 463.5 124.195 462.295ZM243.363 433.489C302.672 422.528 348.217 380.925 362.946 324.256C368.528 302.779 370.148 268.969 365.315 274.806C341.035 304.132 307.598 322.573 271.162 326.734C262.224 327.754 262.224 327.754 260.802 332.288C245.778 380.188 199.865 421.361 149.123 432.436C145.667 433.19 142.84 434.173 142.84 434.62C142.84 436.066 235.035 435.028 243.363 433.489ZM155.667 401.59C184.185 392.229 208.869 372.221 224.073 346.144C227.768 339.805 233.942 326.725 233.464 326.247C233.312 326.095 229.854 325.243 225.78 324.354C195.388 317.721 165.511 299.2 145.853 274.806C142.913 271.158 142.913 271.158 142.877 309.867C142.857 331.157 143.035 348.576 143.273 348.576C144.445 348.576 152.785 343.851 158.401 340.005C171.559 330.994 183.381 336.062 183.262 347.693C182.929 359.741 162.307 372.979 142.888 378.182C142.782 378.211 142.841 378.056 142.841 391.705C142.841 406.512 141.3 406.306 155.667 401.59ZM272.166 298.742C341.882 287.435 392.392 203.771 357.395 157.57C329.913 121.29 269.503 141.528 269.318 187.077C269.3 191.657 267.678 195.349 264.514 198.011C255.208 205.842 241.778 199.397 241.728 187.077C241.585 151.921 202.523 127.883 170.97 143.534C152.788 152.552 143.135 168.927 143.445 190.223C144.416 256.954 206.598 309.377 272.166 298.742ZM251.116 272.787C247.626 271.544 218.402 243.22 216.074 238.825C210.912 229.08 219.702 217.569 231.01 219.264C234.438 219.778 235.61 220.671 245.136 230.024C255.523 240.223 255.523 240.223 265.91 230.024C279.93 216.258 289.106 215.076 294.903 226.287C299.055 234.316 297.109 237.832 278.081 256.691C260.062 274.548 258.567 275.441 251.116 272.787ZM186.179 205.036C177.022 202.374 171.629 189.813 175.597 180.393C183.212 162.314 210.458 167.993 210.458 187.659C210.458 200.414 198.851 208.721 186.179 205.036ZM311.459 204.657C296.172 197.762 297.398 174.465 313.272 170.174C333.594 164.682 345.95 190.84 328.745 202.932C324.537 205.89 316.066 206.735 311.459 204.657ZM256.334 142.749C256.334 141.533 267.311 130.18 271.896 126.653C288.75 113.689 313.394 107.877 333.509 112.122C340.143 113.522 338.96 111.252 328.568 102.647C284.601 66.2387 226.445 66.2387 182.478 102.647C172.086 111.252 170.902 113.522 177.537 112.122C197.652 107.877 222.296 113.689 239.15 126.653C243.735 130.18 254.712 141.533 254.712 142.749C254.712 143.15 255.077 143.478 255.523 143.478C255.969 143.478 256.334 143.15 256.334 142.749Z"

export function renderOgImage({
  eyebrow = "betterlectio.dk",
  title,
  subtitle,
}: {
  eyebrow?: string
  title: string
  subtitle: string
}): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0a0f1f",
          backgroundImage:
            "radial-gradient(900px 600px at 85% -10%, #1c53d6 0%, rgba(28,83,214,0) 60%), radial-gradient(700px 500px at 0% 120%, #0071e3 0%, rgba(0,113,227,0) 55%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top row: logo mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              width: "96px",
              height: "96px",
              borderRadius: "24px",
              backgroundColor: "#ffffff",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            }}
          >
            <svg width="60" height="60" viewBox="0 0 512 512">
              <path d={LOGO_PATH} fill="#0a0f1f" />
            </svg>
          </div>
          <span style={{ fontSize: "34px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            BetterLectio
          </span>
        </div>

        {/* Headline block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#8fb6ff",
              marginBottom: "20px",
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              fontSize: "84px",
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              maxWidth: "1000px",
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontSize: "34px",
              fontWeight: 500,
              color: "rgba(255,255,255,0.78)",
              marginTop: "28px",
              maxWidth: "980px",
              lineHeight: 1.3,
            }}
          >
            {subtitle}
          </span>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  )
}
