import { Command } from "commander";
import chalk from "chalk";
import { webcrypto } from "node:crypto";
import type { CookieStore } from "../types.js";
import { setCookies } from "../lib/storage.js";

interface ExportedCredential {
  student_id: string;
  school_id: number;
  key_version: number;
  ciphertext: string;
  iv: string;
  wrapped_dek: string;
  wrap_iv: string;
}

interface CookiePayload {
  version: 1;
  studentId: string;
  schoolId: string;
  capturedAt: string;
  cookies: Array<{ name: string; value: string }>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function aad(studentId: string, schoolId: string, purpose: "jar" | "dek"): Uint8Array {
  return encoder.encode(`betterlectio:lectio-session:v1:${purpose}:${schoolId}:${studentId}`);
}

async function decryptCredential(row: ExportedCredential): Promise<CookiePayload> {
  const keyBytes = decodeBase64(requiredEnv(`LECTIO_SESSION_MASTER_KEY_V${row.key_version}`));
  if (keyBytes.byteLength !== 32) throw new Error("Session master key must decode to 32 bytes");
  const masterKey = await webcrypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const studentId = row.student_id;
  const schoolId = String(row.school_id);
  const dekBytes = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(row.wrap_iv), additionalData: aad(studentId, schoolId, "dek") },
    masterKey,
    decodeBase64(row.wrapped_dek),
  );
  const dek = await webcrypto.subtle.importKey("raw", dekBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await webcrypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(row.iv), additionalData: aad(studentId, schoolId, "jar") },
    dek,
    decodeBase64(row.ciphertext),
  );
  const payload = JSON.parse(decoder.decode(plaintext)) as CookiePayload;
  if (payload.version !== 1 || payload.studentId !== studentId || payload.schoolId !== schoolId) {
    throw new Error("Decrypted session identity does not match the requested donor");
  }
  return payload;
}

async function importSession(studentId: string, schoolId: string): Promise<number> {
  if (!/^\d+$/.test(studentId) || !/^\d+$/.test(schoolId)) {
    throw new Error("Student and school IDs must be numeric");
  }
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/export_lectio_session_credential`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_student_id: studentId,
      p_school_id: Number(schoolId),
      p_accessor: "lectio-cli",
    }),
  });
  if (!response.ok) throw new Error(`Supabase session export failed (${response.status})`);
  const rows = await response.json() as ExportedCredential[];
  if (rows.length !== 1) throw new Error("No active, consented session was found");

  const payload = await decryptCredential(rows[0]);
  const store: CookieStore = {
    schoolId,
    schoolName: `Lectio school ${schoolId}`,
    savedAt: Date.now(),
    cookies: payload.cookies.map(({ name, value }) => ({
      name,
      value,
      domain: ".lectio.dk",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
    })),
  };
  setCookies(store);
  return store.cookies.length;
}

export const sessionCommand = new Command("session")
  .description("Manage explicitly-consented shared Lectio sessions")
  .addCommand(
    new Command("import")
      .description("Import an encrypted donor session from Supabase")
      .requiredOption("--student <id>", "Consenting donor's Lectio student ID")
      .requiredOption("--school <id>", "Donor's Lectio school ID")
      .option("--json", "Output as JSON")
      .action(async (options: { student: string; school: string; json?: boolean }) => {
        try {
          const cookieCount = await importSession(options.student, options.school);
          if (options.json) console.log(JSON.stringify({ success: true, cookieCount }));
          else console.log(chalk.green("✓") + ` Imported ${cookieCount} cookies to ~/.lectio-cli/cookies.json`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Session import failed";
          if (options.json) console.log(JSON.stringify({ success: false, error: message }));
          else console.error(chalk.red("Error:"), message);
          process.exitCode = 1;
        }
      }),
  );
