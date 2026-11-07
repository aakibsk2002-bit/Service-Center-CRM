import { supabase } from "@/lib/supabase";
import { JOB_SELECT, type JobFull, type Status } from "@/lib/types";

/** Fetch jobs with customer/device joined. q = serial / name / phone / job no. */
export async function fetchJobs(opts: { q?: string; status?: Status | "all"; category?: number | null; limit?: number }) {
  const limit = opts.limit ?? 100;
  const q = opts.q?.trim();

  let ids: string[] | null = null;
  if (q) {
    const { data, error } = await supabase.rpc("search_jobs", { q });
    if (error) throw error;
    ids = (data as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [] as JobFull[];
  }

  let query = supabase
    .from("job_cards")
    .select(JOB_SELECT)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (ids) query = query.in("id", ids);
  if (opts.status && opts.status !== "all") query = query.eq("status", opts.status);
  if (opts.category) query = query.eq("category_id", opts.category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as JobFull[];
}

export async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("job-files").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Every job that has not been handed back yet (oldest first). */
export async function fetchActive(limit = 400) {
  const { data, error } = await supabase
    .from("job_cards")
    .select(JOB_SELECT)
    .neq("status", "outward")
    .order("received_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as JobFull[];
}
