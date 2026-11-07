"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthCtx {
  profile: Profile | null;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({ profile: null, signOut: async () => {} });

export const useAuth = () => useContext(Ctx);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "blocked">("loading");

  useEffect(() => {
    let cancelled = false;
    const goLogin = () => window.location.replace("/login");

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          goLogin();
          return;
        }
        const { data: p, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", data.session.user.id)
          .single();
        if (cancelled) return;
        if (error) {
          setProfile(null);
          setState("blocked");
          return;
        }
        if (!p || !p.active || p.role === "engineer") {
          setProfile(p as Profile | null);
          setState("blocked");
          return;
        }
        setProfile(p as Profile);
        setState("ok");
      } catch {
        goLogin();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") goLogin();
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  if (state === "loading") {
    return (
      <div className="p-10 text-slate-500">
        Loading...{" "}
        <a href="/login" className="ml-2 text-blue-700 underline">
          Open login page
        </a>
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-lg font-semibold">Access not allowed</h1>
        <p className="mt-2 text-sm text-slate-600">
          {profile
            ? "This website is for CRM / Admin. Engineers should use the mobile app."
            : "Your profile is not set up or is inactive. Contact the admin."}
        </p>
        <button
          onClick={signOut}
          className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Sign out
        </button>
      </div>
    );
  }

  return <Ctx.Provider value={{ profile, signOut }}>{children}</Ctx.Provider>;
}
