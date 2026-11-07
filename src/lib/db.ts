import { supabase } from "@/lib/supabase";

/** Supabase returns at most 1000 rows per call, so read big report results page by page. */
export async function rpcAll<T>(
  fn: string,
  args: Record<string, unknown>,
  pageSize = 1000,
  max = 20000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await supabase.rpc(fn, args).range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
