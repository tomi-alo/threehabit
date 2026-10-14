"use client";

import { useState } from "react";
import { signIn, signUp } from "@/app/actions";

export function AuthForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setNotice(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result =
      mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);

    if (result.error) setError(result.error);
    else if ("needsConfirmation" in result && result.needsConfirmation) {
      setNotice("Check your email to confirm the account, then sign in.");
    }
    setPending(false);
  }

  return (
    <section className="panel">
      <h1>{mode === "sign-in" ? "Sign in" : "Create an account"}</h1>
      <p className="lede">
        Your three habits stay with this account. A refresh will still know who you are.
      </p>
      <form action={onSubmit} className="stack">
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </label>
        {error ? <p className="message">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        <button type="submit" className="primary" disabled={pending}>
          {pending ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button
        type="button"
        className="text"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
          setNotice(null);
        }}
      >
        {mode === "sign-in" ? "Need an account?" : "Already have an account?"}
      </button>
    </section>
  );
}
