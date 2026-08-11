import { assertEquals } from "jsr:@std/assert@1"
import { computeInstallStamps } from "./lectio-auth-core.ts"

Deno.test("extension first install stamps extension_installed_at", () => {
  const { stamps, wasFirstInstall } = computeInstallStamps("extension", null, "2026-08-11T12:00:00.000Z")
  assertEquals(wasFirstInstall, true)
  assertEquals(stamps.extension_installed_at, "2026-08-11T12:00:00.000Z")
  assertEquals(stamps.app_installed_at, undefined)
})

Deno.test("extension reinstall stamps extension_reinstalled_at", () => {
  const { stamps, wasFirstInstall } = computeInstallStamps(
    "extension",
    {
      extension_installed_at: "2026-01-01T00:00:00.000Z",
      extension_uninstalled_at: "2026-06-01T00:00:00.000Z",
      extension_reinstalled_at: null,
    },
    "2026-08-11T12:00:00.000Z",
  )
  assertEquals(wasFirstInstall, false)
  assertEquals(stamps.extension_reinstalled_at, "2026-08-11T12:00:00.000Z")
})

Deno.test("android first install stamps app + android columns", () => {
  const { stamps, wasFirstInstall } = computeInstallStamps("android", null, "2026-08-11T12:00:00.000Z")
  assertEquals(wasFirstInstall, true)
  assertEquals(stamps.app_installed_at, "2026-08-11T12:00:00.000Z")
  assertEquals(stamps.android_installed_at, "2026-08-11T12:00:00.000Z")
  assertEquals(stamps.iphone_installed_at, undefined)
})

Deno.test("ios returning user does not restamp", () => {
  const { stamps, wasFirstInstall } = computeInstallStamps(
    "ios",
    {
      app_installed_at: "2026-01-01T00:00:00.000Z",
      iphone_installed_at: "2026-01-01T00:00:00.000Z",
    },
    "2026-08-11T12:00:00.000Z",
  )
  assertEquals(wasFirstInstall, false)
  assertEquals(Object.keys(stamps).length, 0)
})
