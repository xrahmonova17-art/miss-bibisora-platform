
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import "./teacher-login.css";

export default function TeacherLogin({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
        setError("");
        setMessage("");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const { data, error: loginError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

      if (loginError) throw loginError;

      const { data: teacher, error: profileError } =
        await supabase
          .from("students")
          .select("*")
          .eq("auth_user_id", data.user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (!teacher) {
        throw new Error("Teacher profili topilmadi.");
      }

      if (
        teacher.user_role !== "teacher" ||
        teacher.approval_status !== "approved"
      ) {
        await supabase.auth.signOut();
        throw new Error("Teacher akkaunti tasdiqlanmagan.");
      }

      onLogin(teacher);
    } catch (err) {
      console.error("TEACHER LOGIN ERROR:", err);
      setError(err.message || "Login xatoligi.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Avval email manzilingizni kiriting.");
      return;
    }

    setLoading(true);

    try {
      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/teacher`
          }
        );

      if (error) throw error;

      setMessage(
        "Parolni tiklash xati emailingizga yuborildi. Inbox va Spam papkalarini tekshiring."
      );
    } catch (err) {
      console.error("PASSWORD RESET ERROR:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 6) {
      setError("Yangi parol kamida 6 ta belgidan iborat bo‘lsin.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      await supabase.auth.signOut();

      setIsRecovery(false);
      setNewPassword("");
      setPassword("");
      setMessage(
        "Parol muvaffaqiyatli yangilandi. Endi yangi parol bilan kiring."
      );
    } catch (err) {
      console.error("UPDATE PASSWORD ERROR:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="teacher-login-page">
      <div className="teacher-login-decoration decoration-one"></div>
      <div className="teacher-login-decoration decoration-two"></div>

      <section className="teacher-login-card">
        <div className="teacher-login-logo">
          <div className="teacher-login-logo-icon">
            <i className="fa-solid fa-graduation-cap"></i>
          </div>
          <h2>Multi-level</h2>
          <p>WITH MISS BIBISORA</p>
        </div>

        <div className="teacher-login-heading">
          <span className="teacher-login-label">
            {isRecovery ? "PASSWORD RECOVERY" : "TEACHER PORTAL"}
          </span>

          <h1>
            {isRecovery ? "Create new password" : "Welcome back!"}
          </h1>

          <p>
            {isRecovery
              ? "Enter your new password below."
              : "Sign in to manage your students and learning platform."}
          </p>
        </div>

        {isRecovery ? (
          <form onSubmit={handleUpdatePassword}>
            <label htmlFor="new-password">New password</label>

            <div className="teacher-input-box">
              <i className="fa-solid fa-lock"></i>
              <input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="teacher-login-error">
                <i className="fa-solid fa-circle-exclamation"></i>
                {error}
              </div>
            )}

            {message && <p>{message}</p>}

            <button
              className="teacher-login-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <label htmlFor="teacher-email">Email address</label>

            <div className="teacher-input-box">
              <i className="fa-regular fa-envelope"></i>
              <input
                id="teacher-email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <label htmlFor="teacher-password">Password</label>

            <div className="teacher-input-box">
              <i className="fa-solid fa-lock"></i>
              <input
                id="teacher-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                className="teacher-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                <i
                  className={`fa-regular ${
                    showPassword ? "fa-eye-slash" : "fa-eye"
                  }`}
                ></i>
              </button>
            </div>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              style={{
                display: "block",
                margin: "10px 0 18px auto",
                border: "none",
                background: "none",
                color: "#6b63c5",
                cursor: "pointer",
                fontSize: "14px"
              }}
            >
              Forgot password?
            </button>

            {error && (
              <div className="teacher-login-error">
                <i className="fa-solid fa-circle-exclamation"></i>
                {error}
              </div>
            )}

            {message && <p>{message}</p>}

            <button
              className="teacher-login-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In to Dashboard"}
              {!loading && (
                <i className="fa-solid fa-arrow-right"></i>
              )}
            </button>
          </form>
        )}

        <div className="teacher-login-security">
          <i className="fa-solid fa-shield-halved"></i>
          <span>Secure access for authorized teachers only.</span>
        </div>

        <footer className="teacher-login-footer">
          © 2026 Multi-level with Miss Bibisora
        </footer>
      </section>
    </main>
  );
}
