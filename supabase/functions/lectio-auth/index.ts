import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleLectioAuth } from "../_shared/lectio-auth-core.ts"

// Universal Lectio → Supabase auth for extension, iOS, and Android.
// Accepts QR credentials only (never Lectio cookies). Clients keep their own
// session; the server jar is retained only for explicitly allowlisted donors.
//
// Legacy endpoints kept for outdated clients:
//   verify-lectio-auth (extension QR)
//   token-for-auth (mobile cookies)

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  )
  return await handleLectioAuth(req, admin)
})
