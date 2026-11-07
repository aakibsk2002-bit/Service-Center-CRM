import { createBrowserClient } from "@supabase/ssr";

// Accept sloppy input: trims spaces/quotes, drops any path or trailing "/" after the domain.
function cleanUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim().replace(/^["']|["']$/g, "");
  if (!v) return "http://localhost:54321";
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).origin;
  } catch {
    return "http://localhost:54321";
  }
}
const cleanKey = (raw: string | undefined) => (raw ?? "").trim().replace(/^["']|["']$/g, "");

const url = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = cleanKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || "missing-key";

export const isConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createBrowserClient(url, key);
