"use client";

import { FormEvent, useEffect, useState } from "react";
import { customerApi, Customer, primeCsrf, setAccessToken } from "@/lib/customer-api";

export function AuthDialog({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: (customer: Customer) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resending, setResending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!sent || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sent, resendSeconds]);

  async function resendCode() {
    setResending(true); setError("");
    try {
      await primeCsrf();
      await customerApi("auth/otp/request/", { method: "POST", body: JSON.stringify({ email }) });
      setCode(""); setResendSeconds(60);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not resend the code."); }
    finally { setResending(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await primeCsrf();
      if (!sent) {
        await customerApi("auth/otp/request/", { method: "POST", body: JSON.stringify({ email }) });
        setSent(true);
        setResendSeconds(60);
      } else {
        const result = await customerApi<{ access: string; user: Customer }>("auth/otp/verify/", { method: "POST", body: JSON.stringify({ email, code }) });
        setAccessToken(result.access);
        const customer = await customerApi<Customer>("auth/me/");
        onSignedIn(customer);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not complete sign in."); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop customer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="customer-auth-card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="customer-close" onClick={onClose} aria-label="Close sign in">×</button>
      <span className="eyebrow">തട്ട് ACCOUNT</span><h2 id="auth-title">{sent ? "Enter your code" : "Sign in with email"}</h2>
      <p>{sent ? `We sent a one-time code to ${email}.` : "Your account keeps your addresses and orders together."}</p>
      <form onSubmit={submit}>
        {!sent ? <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value.trim())} required maxLength={254} /></label> : <label>6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required pattern="\d{6}" autoFocus /></label>}
        {error && <div className="customer-error" role="alert">{error}</div>}
        <button className="plum-button wide-button" disabled={busy}>{busy ? "Please wait…" : sent ? "Verify and continue" : "Send verification code"}<span>→</span></button>
        {sent && <div className="auth-code-actions">
          <button className="text-button auth-back" type="button" onClick={() => { setSent(false); setCode(""); setError(""); }}>Change email</button>
          <button className="text-button auth-resend" type="button" onClick={() => void resendCode()} disabled={resendSeconds > 0 || resending}>{resending ? "Sending…" : resendSeconds > 0 ? `Resend code in ${resendSeconds}s` : "Resend code"}</button>
        </div>}
      </form>
      <small>By continuing, you agree to receive account verification email.</small>
    </section>
  </div>;
}
