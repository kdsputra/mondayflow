import { useState, type FormEvent } from "react";
import { ArrowRight, Check, KeyRound, LockKeyhole, Mail, Sparkles, UsersRound } from "lucide-react";
import { requestPasswordReset, signInWithEmail, signInWithGoogle, signUpWithEmail } from "./database";

type AuthMode = "signin" | "signup" | "reset";

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (mode === "signin") await signInWithEmail(email, password);
      if (mode === "signup") {
        const session = await signUpWithEmail(fullName, email, password);
        if (!session) setMessage("Check your email to confirm the account, then sign in.");
      }
      if (mode === "reset") {
        await requestPasswordReset(email);
        setMessage("Password reset instructions have been sent.");
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-brand"><span><Sparkles size={20} /></span><strong>MondayFlow</strong></div>
        <div className="auth-copy">
          <p>WORK MANAGEMENT</p>
          <h1>One place for every team to plan and deliver.</h1>
          <span>Organize workspaces, protect private boards, and collaborate with the right people in real time.</span>
        </div>
        <div className="auth-points">
          <div><UsersRound size={18} /><span><strong>Shared workspaces</strong>Invite members with controlled roles.</span></div>
          <div><LockKeyhole size={18} /><span><strong>Secure by default</strong>Every request is protected by database permissions.</span></div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <h2>{mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back"}</h2>
            <p>{mode === "signup" ? "Start with your first workspace and board." : mode === "reset" ? "We'll email you a secure reset link." : "Sign in to open your workspaces."}</p>
          </div>
          {mode !== "reset" ? <button className="google-button" type="button" onClick={() => void signInWithGoogle()}><span>G</span> Continue with Google</button> : null}
          {mode !== "reset" ? <div className="auth-divider"><span>or use email</span></div> : null}
          <form onSubmit={submit} className="auth-form">
            {mode === "signup" ? <label>Full name<div><UsersRound size={17} /><input required minLength={2} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" /></div></label> : null}
            <label>Email address<div><Mail size={17} /><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></div></label>
            {mode !== "reset" ? <label>Password<div><KeyRound size={17} /><input required minLength={8} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></div></label> : null}
            {error ? <div className="auth-alert error">{error}</div> : null}
            {message ? <div className="auth-alert success"><Check size={16} />{message}</div> : null}
            <button className="primary-button auth-submit" disabled={loading}>{loading ? "Please wait..." : mode === "signup" ? "Create account" : mode === "reset" ? "Send reset link" : <>Sign in <ArrowRight size={17} /></>}</button>
          </form>
          <div className="auth-switch">
            {mode === "signin" ? <><button onClick={() => setMode("reset")}>Forgot password?</button><span>New to MondayFlow? <button onClick={() => setMode("signup")}>Create account</button></span></> : <button onClick={() => setMode("signin")}>Back to sign in</button>}
          </div>
        </div>
        <p className="auth-footnote">By continuing, you agree to your organization's workspace policies.</p>
      </section>
    </main>
  );
}
