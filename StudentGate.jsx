
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import StudentDashboard from "./StudentDashboard";

export default function StudentGate() {
  const [status, setStatus] = useState("loading");
  const [student, setStudent] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function checkStudent() {
      const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !session) {
        if (mounted) setStatus("login");
        return;
      }

      const { data, error } = await supabase
        .from("students")
        .select("full_name, username, student_group, approval_status")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error || !data) {
        setStatus("error");
        return;
      }

      if (data.approval_status === "approved") {
        setStudent(data);
        setStatus("approved");
      } else if (data.approval_status === "rejected") {
        setStatus("rejected");
      } else {
        setStatus("pending");
      }
    }

    checkStudent();

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange(() => {
        checkStudent();
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (status === "loading") {
    return <div className="gate-message">Checking your account...</div>;
  }

  if (status === "login") {
    return <div className="gate-message">Please log in first.</div>;
  }

  if (status === "pending") {
    return (
      <div className="gate-message">
        <h2>Account Pending Approval</h2>
        <p>Your teacher has not approved your account yet.</p>
        <button onClick={logout}>Log Out</button>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="gate-message">
        <h2>Account Not Approved</h2>
        <p>Please contact your teacher for more information.</p>
        <button onClick={logout}>Log Out</button>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="gate-message">
        <h2>Unable to verify your account</h2>
        <p>Please try again later or contact your teacher.</p>
        <button onClick={logout}>Log Out</button>
      </div>
    );
  }

  return <StudentDashboard student={student} onLogout={logout} />;
}
