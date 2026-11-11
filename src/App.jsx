
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import StudentDashboard from "./StudentDashboard";
import TeacherLogin from "./TeacherLogin";
import TeacherDashboard from "./TeacherDashboard";
import "./App.css";

function GraduationCap({ small = false }) {
  return (
    <svg
      className={small ? "cap-small" : "cap-large"}
      viewBox="0 0 64 48"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 16L32 2L62 16L32 30L2 16Z" fill="currentColor" />
      <path d="M13 22V34C23 43 41 43 51 34V22L32 32L13 22Z" fill="currentColor" />
      <path d="M59 18V35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="59" cy="39" r="3" fill="currentColor" />
    </svg>
  );
}

export default function App() {
  const isTeacherRoute =
    window.location.pathname.replace(/\/+$/, "") === "/teacher";

  const [page, setPage] = useState("register");

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [group, setGroup] = useState("13:30");

  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [student, setStudent] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const isRegister = page === "register";

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (mounted) setCheckingSession(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("students")
        .select(
          "id, full_name, username, email, student_group, approval_status, user_role, auth_user_id"
        )
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error || !profile) {
        await supabase.auth.signOut();

        if (mounted) {
          setPage("login");
          setCheckingSession(false);
        }
        return;
      }

      if (
        profile.user_role === "teacher" &&
        profile.approval_status === "approved"
      ) {
        if (!isTeacherRoute) {
          window.location.replace("/teacher");
          return;
        }

        setTeacher(profile);
        setCheckingSession(false);
        return;
      }

      if (
        profile.user_role === "student" &&
        profile.approval_status === "approved"
      ) {
        if (isTeacherRoute) {
          await supabase.auth.signOut();

          if (mounted) {
            setCheckingSession(false);
          }
          return;
        }

        setStudent(profile);
        setCheckingSession(false);
        return;
      }

      await supabase.auth.signOut();

      if (mounted) {
        setPage("login");
        setCheckingSession(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [isTeacherRoute]);

  function changePage(nextPage) {
    setPage(nextPage);
    setMessage("");
    setPassword("");
    setShowPassword(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          username: username.trim(),
          student_group: group,
        },
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage(
      "Account created! Please check your email to confirm your account. Your teacher must approve your account before you can enter."
    );
  }

  async function handleLogin(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("students")
      .select(
        "id, full_name, username, email, student_group, approval_status, user_role, auth_user_id"
      )
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage("Account profile not found. Please contact your teacher.");
      return;
    }

    if (profile.user_role !== "student") {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage("Please use the correct login page.");
      return;
    }

    if (profile.approval_status === "pending") {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage("Your account is waiting for teacher approval.");
      return;
    }

    if (profile.approval_status !== "approved") {
      await supabase.auth.signOut();
      setLoading(false);
      setMessage(
        "Your account has not been approved. Please contact your teacher."
      );
      return;
    }

    setStudent(profile);
    setLoading(false);
  }

  function handleTeacherLogin(profile) {
    setTeacher(profile);
    setStudent(null);
    setMessage("");
  }

  async function handleLogout() {
    const wasTeacher = Boolean(teacher);

    await supabase.auth.signOut();

    setStudent(null);
    setTeacher(null);
    setPage("login");
    setMessage("");
    setPassword("");

    window.location.assign(wasTeacher ? "/teacher" : "/");
  }

  if (checkingSession) {
    return <div className="gate-message">Checking your account...</div>;
  }

  if (teacher) {
    return <TeacherDashboard onLogout={handleLogout} />;
  }

  if (student) {
    return (
      <StudentDashboard
        student={student}
        onLogout={handleLogout}
      />
    );
  }

  // Separate teacher portal
  if (isTeacherRoute) {
    return <TeacherLogin onLogin={handleTeacherLogin} />;
  }

  // Student portal
  return (
    <main className="auth-page">
      <div className={`auth-card ${isRegister ? "register-card" : "login-card"}`}>
        <section className="visual-panel">
          {isRegister ? (
            <div className="register-visual-text">
              <GraduationCap />
              <h1>Multi-level</h1>
              <h2>with Miss Bibisora</h2>
              <p className="visual-tagline">Learn · Practice · Excel</p>
              <p className="dream-text">
                Your dreams
                <br />
                start with knowledge.
              </p>
              <span className="heart">♥</span>
            </div>
          ) : (
            <>
              <div className="login-brand">
                <div className="login-brand-icon">
                  <GraduationCap small />
                </div>
                <h2>Multi-level with Miss Bibisora</h2>
                <p>Learn · Practice · Excel</p>
              </div>

              <div className="login-visual-text">
                <h1>
                  Your journey
                  <br />
                  continues here.
                </h1>
                <p>
                  Keep learning, keep practicing, and move closer
                  <br className="desktop-break" />
                  to your English goals.
                </p>
              </div>

              <p className="visual-bottom">Believe in your progress.</p>
            </>
          )}
        </section>

        <section className="form-panel">
          {isRegister ? (
            <>
              <div className="form-heading register-heading">
                <h1>Create Account</h1>
                <p>Join our study room and start learning</p>
              </div>

              <form onSubmit={handleRegister}>
                <div className="input-wrap">
                  <span>♙</span>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>

                <div className="input-wrap">
                  <span>♙</span>
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    minLength={3}
                    required
                  />
                </div>

                <div className="input-wrap">
                  <span>✉</span>
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="input-wrap">
                  <span>♙</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password (min. 8 characters)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? "◉" : "◎"}
                  </button>
                </div>

                <div className="group-area">
                  <label>Select Your Group</label>
                  <div className="group-options">
                    {["13:30", "15:00"].map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={group === item ? "active" : ""}
                        onClick={() => setGroup(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {message && <p className="form-message">{message}</p>}

                <button className="submit-button" disabled={loading}>
                  {loading ? "Please wait..." : "Register Account"}
                </button>
              </form>

              <div className="account-switch">
                Already have an account?{" "}
                <button type="button" onClick={() => changePage("login")}>
                  Log in
                </button>
              </div>

              <p className="terms">
                By registering, you agree to our{" "}
                <strong>Terms</strong> and <strong>Privacy Policy.</strong>
              </p>
            </>
          ) : (
            <>
              <div className="form-heading login-heading">
                <h1>Welcome Back!</h1>
                <p>Sign in to continue your learning journey.</p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="login-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="login-field">
                  <label>Password</label>
                  <div className="login-password">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "◉" : "◎"}
                    </button>
                  </div>
                </div>

                <div className="forgot-row">
                  <button
                    type="button"
                    onClick={() =>
                      setMessage(
                        "Please contact your teacher to reset your password."
                      )
                    }
                  >
                    Forgot password?
                  </button>
                </div>

                {message && <p className="form-message">{message}</p>}

                <button className="submit-button login-submit" disabled={loading}>
                  {loading ? "Please wait..." : "Sign In　 →"}
                </button>
              </form>

              <div className="account-switch login-switch">
                Don't have an account?{" "}
                <button type="button" onClick={() => changePage("register")}>
                  Create Account
                </button>
              </div>

              <p className="copyright">
                © 2026 Multi-level with Miss Bibisora
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
