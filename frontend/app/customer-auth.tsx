"use client";

import { FormEvent, useState } from "react";
import { customerApi, Customer, primeCsrf, setAccessToken } from "@/lib/customer-api";

export function AuthDialog({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: (customer: Customer) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await primeCsrf();
      if (!sent) {
        await customerApi("auth/otp/request/", { method: "POST", body: JSON.stringify({ phone_number: phone }) });
        setSent(true);
      } else {
        const result = await customerApi<{ access: string; user: Customer }>("auth/otp/verify/", { method: "POST", body: JSON.stringify({ phone_number: phone, code }) });
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
      <span className="eyebrow">തട്ട് ACCOUNT</span><h2 id="auth-title">{sent ? "Enter your code" : "Sign in with your phone"}</h2>
      <p>{sent ? `We sent a one-time code to ${phone}.` : "Your account keeps your addresses and orders together."}</p>
      <form onSubmit={submit}>
        {!sent ? <label>Phone number<input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} required pattern="\+[1-9]\d{7,14}" /></label> : <label>6-digit verification code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required pattern="\d{6}" autoFocus /></label>}
        {error && <div className="customer-error" role="alert">{error}</div>}
        <button className="plum-button wide-button" disabled={busy}>{busy ? "Please wait…" : sent ? "Verify and continue" : "Send verification code"}<span>→</span></button>
        {sent && <button className="text-button auth-back" type="button" onClick={() => { setSent(false); setCode(""); setError(""); }}>Change phone number</button>}
      </form>
      <small>By continuing, you agree to receive account verification messages.</small>
    </section>
  </div>;
}
