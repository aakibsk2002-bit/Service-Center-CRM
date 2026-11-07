"use client";

import { useState } from "react";
import { supabase, isConfigured } from "@/lib/supabase";
import { toLoginEmail } from "@/lib/loginId";

const CENTRE = process.env.NEXT_PUBLIC_CENTRE_NAME ?? "Service Centre";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: toLoginEmail(email), password });
    setBusy(false);
    if (error) {
      const m = error.message || "Unknown error";
      let hint = "";
      if (/invalid login credentials/i.test(m)) hint = " (incorrect username or password)";
      else if (/email not confirmed/i.test(m)) hint = " (confirm the user in Supabase)";
      else if (/invalid api key|apikey/i.test(m)) hint = " (the key in .env.local is incorrect)";
      else if (/fetch|network/i.test(m)) hint = " (the URL in .env.local is incorrect, or there is no internet)";
      setError(m + hint);
      return;
    }
    window.location.assign("/");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden flex-col justify-between bg-ink p-12 text-white lg:flex">
        <div>
          <div className="text-lg font-semibold tracking-tight">Service Desk</div>
          <div className="text-sm text-slate-400">{CENTRE}</div>
        </div>
        <div>
          <p className="max-w-md text-3xl font-medium leading-snug tracking-tight">
            Every product that comes in, from the counter to the customer&apos;s hand.
          </p>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 text-sm">
            <div>
              <dt className="mono text-slate-400">Inward</dt>
              <dd className="mt-1 text-slate-200">Details and signature taken on the phone</dd>
            </div>
            <div>
              <dt className="mono text-slate-400">Repair</dt>
              <dd className="mt-1 text-slate-200">Parts and work noted on the job</dd>
            </div>
            <div>
              <dt className="mono text-slate-400">Outward</dt>
              <dd className="mt-1 text-slate-200">Full history kept by serial number</dd>
            </div>
          </dl>
        </div>
        <div className="mono text-xs text-slate-500">2026-27/001</div>
      </aside>

      <main className="flex items-center justify-center p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Use the username (or email) and password given by your admin.</p>

          {!isConfigured && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Supabase keys are not set. Add them in <code>.env.local</code> and restart.
            </p>
          )}

          <label htmlFor="email" className="mt-8 block text-sm font-medium">
            Username or email
          </label>
          <input
            id="email"
            type="text"
            autoCapitalize="none"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field mt-1.5 w-full"
          />
          <label htmlFor="password" className="mt-4 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field mt-1.5 w-full"
          />
          {error && (
            <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn btn-primary mt-6 w-full py-2.5">
            {busy ? "Signing in" : "Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
