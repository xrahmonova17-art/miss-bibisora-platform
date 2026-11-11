import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import TeacherSpeakingAssignments from "./TeacherSpeakingAssignments";
import TeacherHomework from "./TeacherHomework";
import "./teacher-dashboard.css";

const navigation = [
  { id: "overview", label: "Overview", icon: "fa-house" },
  { id: "students", label: "Students", icon: "fa-users" },
  { id: "homework", label: "Homework", icon: "fa-book-open" },
  { id: "speaking-tasks", label: "Speaking Assignments", icon: "fa-file-pdf" },
  { id: "submissions", label: "Speaking Submissions", icon: "fa-microphone-lines" },
  { id: "mock-tests", label: "Mock Tests", icon: "fa-file-circle-check" },
  { id: "analysis", label: "AI Analysis", icon: "fa-chart-line" },
  { id: "feedback", label: "Teacher Feedback", icon: "fa-comment-dots" },
];

const titles = {
  overview: "Overview",
  students: "Students",
  homework: "Homework",
  "speaking-tasks": "Speaking Assignments",
  submissions: "Speaking Submissions",
  "mock-tests": "Mock Tests",
  analysis: "AI Analysis",
  feedback: "Teacher Feedback",
};

const GROUPS = ["13:30", "15:00"];

export default function TeacherDashboard({ onLogout }) {
  const [activePage, setActivePage] = useState("overview");
  const [mobileMenu, setMobileMenu] = useState(false);

  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");

  const [testTitle, setTestTitle] = useState("");
  const [testPart, setTestPart] = useState("Full Speaking Test");
  const [testGroup, setTestGroup] = useState("13:30");
  const [testDescription, setTestDescription] = useState("");
  const [savingTest, setSavingTest] = useState(false);

  const [feedbackSubmission, setFeedbackSubmission] = useState("");
  const [feedbackScore, setFeedbackScore] = useState("6.0");
  const [feedbackLevel, setFeedbackLevel] = useState("B1");
  const [feedbackText, setFeedbackText] = useState("");
  const [savingFeedback, setSavingFeedback] = useState(false);

  const showMessage = (text) => {
    setMessage(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // DASHBOARD MA'LUMOTLARINI YUKLASH
  const loadDashboard = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    setMessage("");

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError) throw authError;

      const authUser = authData?.user;

      if (!authUser) {
        throw new Error("Login session topilmadi. Qayta login qiling.");
      }

      // Teacher profilini topish
      const { data: teacherData, error: teacherError } = await supabase
        .from("students")
        .select("id, full_name, email, user_role, approval_status")
        .eq("auth_user_id", authUser.id)
        .eq("user_role", "teacher")
        .maybeSingle();

      if (teacherError) throw teacherError;

      if (!teacherData) {
        throw new Error("Teacher profili students jadvalidan topilmadi.");
      }

      setTeacher(teacherData);

      // Studentlar, speaking vazifalar va topshirilgan audiolar
      const [
        studentsResult,
        assignmentsResult,
        submissionsResult,
      ] = await Promise.all([
        supabase
          .from("students")
          .select(
            "id, full_name, username, email, student_group, approval_status, user_role, created_at"
          )
          .eq("user_role", "student")
          .order("created_at", { ascending: false }),

        supabase
          .from("speaking_assignments")
          .select(
            "id, title, description, speaking_part, student_group, pdf_path, pdf_name, created_at, created_by"
          )
          .eq("created_by", teacherData.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("speaking_submissions")
          .select(
            "id, student_id, assignment_id, speaking_part, audio_path, transcript, created_at"
          )
          .order("created_at", { ascending: false }),
      ]);

      if (studentsResult.error) throw studentsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (submissionsResult.error) throw submissionsResult.error;

      const studentRows = studentsResult.data || [];
      const assignmentRows = assignmentsResult.data || [];
      const submissionRows = submissionsResult.data || [];

      setStudents(studentRows);
      setAssignments(assignmentRows);

      const studentMap = new Map(
        studentRows.map((student) => [student.id, student])
      );

      const assignmentMap = new Map(
        assignmentRows.map((assignment) => [assignment.id, assignment])
      );

      // Audio fayllar uchun vaqtinchalik URL yaratish
      const enrichedSubmissions = await Promise.all(
        submissionRows.map(async (submission) => {
          let audioUrl = "";

          if (submission.audio_path) {
            const { data: signedData, error: signedError } =
              await supabase.storage
                .from("speaking-audio")
                .createSignedUrl(submission.audio_path, 60 * 60);

            if (!signedError) {
              audioUrl = signedData?.signedUrl || "";
            }
          }

          return {
            ...submission,
            student: studentMap.get(submission.student_id) || null,
            assignment: assignmentMap.get(submission.assignment_id) || null,
            audioUrl,
          };
        })
      );

      setSubmissions(enrichedSubmissions);

      // Teacher feedback
      const submissionIds = enrichedSubmissions.map((item) => item.id);

      if (submissionIds.length === 0) {
        setFeedbackItems([]);
      } else {
        const { data: feedbackData, error: feedbackError } =
          await supabase
            .from("teacher_feedback")
            .select(
              "id, submission_id, teacher_id, score, cefr_level, comment, created_at"
            )
            .in("submission_id", submissionIds)
            .order("created_at", { ascending: false });

        if (feedbackError) throw feedbackError;

        setFeedbackItems(feedbackData || []);
      }
    } catch (error) {
      console.error("Teacher dashboard error:", error);
      setMessage(error.message || "Dashboard ma'lumotlarini yuklab bo'lmadi.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // STUDENTNI TASDIQLASH YOKI RAD ETISH
  const updateApproval = async (studentId, status) => {
    setBusyId(studentId);
    setMessage("");

    try {
      const { error } = await supabase
        .from("students")
        .update({ approval_status: status })
        .eq("id", studentId);

      if (error) throw error;

      setStudents((current) =>
        current.map((student) =>
          student.id === studentId
            ? { ...student, approval_status: status }
            : student
        )
      );
    } catch (error) {
      showMessage(error.message || "Student holatini o'zgartirib bo'lmadi.");
    } finally {
      setBusyId(null);
    }
  };

  // STATISTIKA
  const stats = useMemo(
    () => ({
      total: students.length,
      pending: students.filter((s) => s.approval_status === "pending").length,
      approved: students.filter((s) => s.approval_status === "approved").length,
      rejected: students.filter((s) => s.approval_status === "rejected").length,
      submissions: submissions.length,
    }),
    [students, submissions]
  );

  // STUDENTLARNI QIDIRISH
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const searchable =
        `${student.full_name || ""} ${student.username || ""} ${student.email || ""}`.toLowerCase();

      const matchesSearch = searchable.includes(search.toLowerCase());

      const matchesStatus =
        studentFilter === "all" ||
        student.approval_status === studentFilter;

      return matchesSearch && matchesStatus;
    });
  }, [students, search, studentFilter]);

  const getPart = (item) =>
    item.speaking_part || item.assignment?.speaking_part || "Speaking";

  const getStudentName = (item) =>
    item.student?.full_name || item.student?.username || "Unknown student";

  // MOCK TEST YARATISH
  const createMockTest = async (event) => {
    event.preventDefault();

    if (!teacher) {
      showMessage("Teacher profili topilmadi. Sahifani yangilang.");
      return;
    }

    if (!testTitle.trim()) return;

    setSavingTest(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("speaking_assignments")
        .insert({
          title: testTitle.trim(),
          description: testDescription.trim(),
          speaking_part: testPart,
          student_group: testGroup,
          created_by: teacher.id,
        });

      if (error) throw error;

      setTestTitle("");
      setTestDescription("");
      setTestPart("Full Speaking Test");
      setTestGroup("13:30");

      await loadDashboard(true);
      showMessage("Mock test muvaffaqiyatli yaratildi.");
    } catch (error) {
      showMessage(error.message || "Mock test yaratilmadi.");
    } finally {
      setSavingTest(false);
    }
  };

  // MOCK TESTNI O'CHIRISH
  const deleteMockTest = async (assignmentId) => {
    const confirmed = window.confirm(
      "Bu mock testni o'chirmoqchimisiz?"
    );

    if (!confirmed) return;

    setBusyId(assignmentId);
    setMessage("");

    try {
      const { error } = await supabase
        .from("speaking_assignments")
        .delete()
        .eq("id", assignmentId)
        .eq("created_by", teacher.id);

      if (error) throw error;

      setAssignments((current) =>
        current.filter((item) => item.id !== assignmentId)
      );

      showMessage("Mock test o'chirildi.");
    } catch (error) {
      showMessage(error.message || "Mock testni o'chirib bo'lmadi.");
    } finally {
      setBusyId(null);
    }
  };

  // TEACHER FEEDBACK YUBORISH
  const addFeedback = async (event) => {
    event.preventDefault();

    if (!teacher || !feedbackSubmission || !feedbackText.trim()) {
      showMessage("Avval submission tanlang va feedback yozing.");
      return;
    }

    setSavingFeedback(true);
    setMessage("");

    try {
      const { error } = await supabase
        .from("teacher_feedback")
        .insert({
          submission_id: feedbackSubmission,
          teacher_id: teacher.id,
          score: Number(feedbackScore),
          cefr_level: feedbackLevel,
          comment: feedbackText.trim(),
        });

      if (error) throw error;

      setFeedbackText("");
      setFeedbackSubmission("");
      setFeedbackScore("6.0");
      setFeedbackLevel("B1");

      await loadDashboard(true);
      showMessage("Feedback muvaffaqiyatli yuborildi.");
    } catch (error) {
      showMessage(error.message || "Feedback yuborilmadi.");
    } finally {
      setSavingFeedback(false);
    }
  };

  const openPage = (page) => {
    setActivePage(page);
    setMobileMenu(false);
    setMessage("");
    setSearch("");
  };

  return (
    <div className="teacher-layout">
      {mobileMenu && (
        <button
          className="teacher-overlay"
          onClick={() => setMobileMenu(false)}
          aria-label="Close menu"
        />
      )}

      <aside
        className={`teacher-sidebar ${mobileMenu ? "teacher-sidebar-open" : ""}`}
      >
        <div className="teacher-brand">
          <div className="teacher-brand-icon">
            <i className="fa-solid fa-microphone-lines" />
          </div>
          <div>
            <h2>Speaking<span>.</span></h2>
            <p>TEACHER PANEL</p>
          </div>
        </div>

        <div className="teacher-nav-label">WORKSPACE</div>

        <nav className="teacher-nav">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`teacher-nav-item ${activePage === item.id ? "active" : ""}`}
              onClick={() => openPage(item.id)}
            >
              <i className={`fa-solid ${item.icon}`} />
              <span>{item.label}</span>

              {item.id === "students" && stats.pending > 0 && (
                <span className="teacher-nav-count">{stats.pending}</span>
              )}

              {item.id === "submissions" && stats.submissions > 0 && (
                <span className="teacher-nav-count">{stats.submissions}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="teacher-sidebar-bottom">
          <div className="teacher-profile-mini">
            <div className="teacher-avatar">MB</div>
            <div className="teacher-profile-info">
              <strong>Miss Bibisora</strong>
              <span>Teacher account</span>
            </div>
          </div>

          <button className="teacher-logout" onClick={onLogout}>
            <i className="fa-solid fa-arrow-right-from-bracket" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className="teacher-main">
        <header className="teacher-topbar">
          <div className="teacher-topbar-left">
            <button
              className="teacher-menu-toggle"
              onClick={() => setMobileMenu(true)}
              aria-label="Open menu"
            >
              <i className="fa-solid fa-bars" />
            </button>

            <div>
              <span className="teacher-breadcrumb">Teacher panel /</span>
              <strong>{titles[activePage]}</strong>
            </div>
          </div>

          <div className="teacher-topbar-right">
            <div className="teacher-topbar-date">
              <i className="fa-regular fa-calendar" />
              <span>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="teacher-topbar-avatar">MB</div>
          </div>
        </header>

        <div className="teacher-content">
          {!["homework", "speaking-tasks"].includes(activePage) && (
            <section className="teacher-welcome">
              <div>
                <span className="teacher-eyebrow">YOUR TEACHING SPACE</span>
                <h1>Welcome back, <span>Miss Bibisora!</span></h1>
                <p>Here's what's happening in your speaking classroom today.</p>
              </div>
              <div className="teacher-welcome-icon">
                <i className="fa-solid fa-chalkboard-user" />
              </div>
            </section>
          )}

          {message && (
            <div className="teacher-message">
              <i className="fa-solid fa-circle-exclamation" />
              <span>{message}</span>
              <button onClick={() => setMessage("")} aria-label="Dismiss">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          {/* HOMEWORK */}
          {activePage === "homework" && <TeacherHomework />}

          {/* PDF SPEAKING ASSIGNMENTS */}
          {activePage === "speaking-tasks" && (
            <TeacherSpeakingAssignments
              teacher={teacher}
              onChanged={() => loadDashboard(true)}
            />
          )}

          {/* OVERVIEW */}
          {activePage === "overview" && (
            <>
              <section className="teacher-stats">
                <StatCard
                  label="Total students"
                  value={loading ? "—" : stats.total}
                  note="Registered students"
                  icon="fa-users"
                  color="purple"
                />
                <StatCard
                  label="Pending requests"
                  value={loading ? "—" : stats.pending}
                  note="Waiting for approval"
                  icon="fa-clock"
                  color="orange"
                />
                <StatCard
                  label="Approved students"
                  value={loading ? "—" : stats.approved}
                  note="Can access the classroom"
                  icon="fa-user-check"
                  color="green"
                />
                <StatCard
                  label="Speaking submissions"
                  value={loading ? "—" : stats.submissions}
                  note="Student audio recordings"
                  icon="fa-microphone-lines"
                  color="purple"
                />
              </section>

              <section className="teacher-overview-grid">
                <div className="teacher-panel">
                  <PanelHeading
                    kicker="STUDENT MANAGEMENT"
                    title="Recent registrations"
                    description="Review the latest students who joined your platform."
                    action="View all"
                    onAction={() => openPage("students")}
                  />

                  {loading ? (
                    <Loading />
                  ) : students.length === 0 ? (
                    <EmptyState
                      icon="fa-user-plus"
                      title="No students yet"
                      text="New registrations will appear here."
                    />
                  ) : (
                    <div className="teacher-recent-list">
                      {students.slice(0, 5).map((student) => (
                        <div className="teacher-recent-row" key={student.id}>
                          <div className="teacher-student-avatar">
                            {(student.full_name || "S").charAt(0).toUpperCase()}
                          </div>
                          <div className="teacher-recent-details">
                            <strong>{student.full_name || "Unnamed student"}</strong>
                            <span>{student.email || student.username || "No contact information"}</span>
                          </div>
                          <Status status={student.approval_status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="teacher-panel teacher-quick-panel">
                  <span className="teacher-section-kicker">QUICK ACCESS</span>
                  <h2>Manage your classroom</h2>
                  <p>Go directly to the section you need.</p>

                  <QuickLink
                    icon="fa-user-group"
                    title="Manage students"
                    text="Review and approve registrations"
                    onClick={() => openPage("students")}
                  />
                  <QuickLink
                    icon="fa-book-open"
                    title="Homework"
                    text="Create assignments and track student work"
                    onClick={() => openPage("homework")}
                  />
                  <QuickLink
                    icon="fa-file-pdf"
                    title="Speaking assignments"
                    text="Upload PDF tasks for each group"
                    onClick={() => openPage("speaking-tasks")}
                  />
                  <QuickLink
                    icon="fa-microphone-lines"
                    title="Speaking submissions"
                    text="Listen to student recordings"
                    onClick={() => openPage("submissions")}
                  />
                  <QuickLink
                    icon="fa-file-circle-check"
                    title="Create mock tests"
                    text="Prepare speaking practice tests"
                    onClick={() => openPage("mock-tests")}
                  />
                  <QuickLink
                    icon="fa-comment-dots"
                    title="Teacher feedback"
                    text="Send feedback to students"
                    onClick={() => openPage("feedback")}
                  />

                  <div className="teacher-quick-note">
                    <i className="fa-solid fa-lightbulb" />
                    <span>Manage your speaking classroom from one place.</span>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* STUDENTS */}
          {activePage === "students" && (
            <section className="teacher-panel teacher-students-panel">
              <PanelHeading
                kicker="YOUR CLASSROOM"
                title="Student management"
                description="View student accounts and manage their access."
              />

              <div className="teacher-student-toolbar">
                <div className="teacher-search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    placeholder="Search by name, username or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className="teacher-filter"
                  value={studentFilter}
                  onChange={(e) => setStudentFilter(e.target.value)}
                >
                  <option value="all">All students</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>

                <button
                  className="teacher-refresh-button"
                  onClick={() => loadDashboard(true)}
                  disabled={refreshing}
                >
                  <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              <div className="teacher-table-wrap">
                <table className="teacher-table">
                  <thead>
                    <tr>
                      <th>STUDENT</th>
                      <th>USERNAME</th>
                      <th>GROUP</th>
                      <th>STATUS</th>
                      <th className="teacher-action-heading">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="5"><Loading /></td></tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan="5">
                          <EmptyState
                            icon="fa-users"
                            title="No students found"
                            text="Try changing your search or filter."
                          />
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((student) => (
                        <tr key={student.id}>
                          <td>
                            <div className="teacher-table-person">
                              <div className="teacher-student-avatar">
                                {(student.full_name || "S").charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong>{student.full_name || "Unnamed student"}</strong>
                                <span>{student.email || "No email"}</span>
                              </div>
                            </div>
                          </td>
                          <td>{student.username || "—"}</td>
                          <td>{student.student_group || "Not assigned"}</td>
                          <td><Status status={student.approval_status} /></td>
                          <td>
                            <div className="teacher-row-actions">
                              {student.approval_status !== "approved" && (
                                <button
                                  className="teacher-approve-button"
                                  disabled={busyId === student.id}
                                  onClick={() => updateApproval(student.id, "approved")}
                                >
                                  <i className="fa-solid fa-check" /> Approve
                                </button>
                              )}

                              {student.approval_status !== "rejected" && (
                                <button
                                  className="teacher-reject-button"
                                  disabled={busyId === student.id}
                                  onClick={() => updateApproval(student.id, "rejected")}
                                >
                                  <i className="fa-solid fa-xmark" /> Reject
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="teacher-table-footer">
                <span>
                  Showing <strong>{filteredStudents.length}</strong> of{" "}
                  <strong>{students.length}</strong> students
                </span>
                <span>Speaking classroom</span>
              </div>
            </section>
          )}

          {/* SPEAKING SUBMISSIONS */}
          {activePage === "submissions" && (
            <section className="teacher-panel">
              <PanelHeading
                kicker="STUDENT WORK"
                title="Speaking submissions"
                description="Listen to recordings and read student answers."
              />

              <div className="teacher-toolbar">
                <div className="teacher-search">
                  <i className="fa-solid fa-magnifying-glass" />
                  <input
                    placeholder="Search student or speaking part..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <button
                  className="teacher-refresh-button"
                  onClick={() => loadDashboard(true)}
                  disabled={refreshing}
                >
                  <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {loading ? (
                <Loading />
              ) : submissions.filter((item) => {
                  const searchable =
                    `${getStudentName(item)} ${getPart(item)}`.toLowerCase();
                  return searchable.includes(search.toLowerCase());
                }).length === 0 ? (
                <EmptyState
                  icon="fa-headphones"
                  title="No speaking submissions yet"
                  text="Student recordings will appear here after students submit their speaking tasks."
                />
              ) : (
                <div className="teacher-submission-list">
                  {submissions
                    .filter((item) => {
                      const searchable =
                        `${getStudentName(item)} ${getPart(item)}`.toLowerCase();
                      return searchable.includes(search.toLowerCase());
                    })
                    .map((item) => (
                      <article className="teacher-submission-card" key={item.id}>
                        <div className="teacher-submission-heading">
                          <div className="teacher-student-avatar">
                            {getStudentName(item).charAt(0).toUpperCase()}
                          </div>
                          <div className="teacher-submission-person">
                            <strong>{getStudentName(item)}</strong>
                            <span>
                              {getPart(item)} ·{" "}
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          <Status status="pending" />
                        </div>

                        {item.assignment?.title && (
                          <p className="teacher-submission-assignment">
                            <i className="fa-solid fa-book-open" />{" "}
                            {item.assignment.title}
                          </p>
                        )}

                        {item.audioUrl ? (
                          <div className="teacher-audio-player">
                            <i className="fa-solid fa-volume-high" />
                            <audio controls src={item.audioUrl}>
                              Your browser does not support audio.
                            </audio>
                          </div>
                        ) : (
                          <p className="teacher-no-audio">
                            <i className="fa-solid fa-circle-info" /> No audio file attached.
                          </p>
                        )}

                        {item.transcript && (
                          <div className="teacher-transcript">
                            <strong>
                              <i className="fa-solid fa-file-lines" /> Transcript
                            </strong>
                            <p>{item.transcript}</p>
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              )}
            </section>
          )}

          {/* MOCK TESTS */}
          {activePage === "mock-tests" && (
            <section className="teacher-panel">
              <PanelHeading
                kicker="PRACTICE MANAGEMENT"
                title="Mock tests"
                description="Create speaking tests for your student groups."
              />

              <form className="teacher-create-form" onSubmit={createMockTest}>
                <div className="teacher-form-title">
                  <div className="teacher-form-icon">
                    <i className="fa-solid fa-file-circle-plus" />
                  </div>
                  <div>
                    <h3>Create a mock test</h3>
                    <p>This test will be saved in your speaking assignments.</p>
                  </div>
                </div>

                <div className="teacher-form-grid">
                  <label className="teacher-field teacher-field-wide">
                    <span>Test title</span>
                    <input
                      value={testTitle}
                      onChange={(e) => setTestTitle(e.target.value)}
                      placeholder="Example: Speaking Mock Test 01"
                      required
                    />
                  </label>

                  <label className="teacher-field">
                    <span>Test type</span>
                    <select
                      value={testPart}
                      onChange={(e) => setTestPart(e.target.value)}
                    >
                      <option>Full Speaking Test</option>
                      <option>Part 1.1</option>
                      <option>Part 1.2</option>
                      <option>Part 2</option>
                      <option>Part 3</option>
                    </select>
                  </label>

                  <label className="teacher-field">
                    <span>Student group</span>
                    <select
                      value={testGroup}
                      onChange={(e) => setTestGroup(e.target.value)}
                    >
                      {GROUPS.map((group) => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                    </select>
                  </label>

                  <label className="teacher-field teacher-field-wide">
                    <span>Instructions (optional)</span>
                    <textarea
                      rows="4"
                      value={testDescription}
                      onChange={(e) => setTestDescription(e.target.value)}
                      placeholder="Write instructions for your students..."
                    />
                  </label>
                </div>

                <button
                  className="teacher-primary-button"
                  type="submit"
                  disabled={savingTest}
                >
                  <i className="fa-solid fa-plus" />
                  {savingTest ? "Creating..." : "Create test"}
                </button>
              </form>

              <div className="teacher-subsection-heading">
                <div>
                  <h3>Created speaking tests</h3>
                  <p>Tests saved in your account.</p>
                </div>
                <span className="teacher-count-pill">
                  {assignments.length} items
                </span>
              </div>

              {loading ? (
                <Loading />
              ) : assignments.length === 0 ? (
                <EmptyState
                  icon="fa-clipboard-list"
                  title="No tests created"
                  text="Use the form above to create your first mock test."
                />
              ) : (
                <div className="teacher-test-list">
                  {assignments.map((test) => (
                    <div className="teacher-test-card" key={test.id}>
                      <div className="teacher-test-icon">
                        <i className="fa-solid fa-file-lines" />
                      </div>
                      <div className="teacher-test-info">
                        <strong>{test.title}</strong>
                        <span>
                          {test.speaking_part} · Group {test.student_group || "—"} ·{" "}
                          {new Date(test.created_at).toLocaleDateString()}
                        </span>
                        <small>{test.description || "No extra instructions"}</small>
                      </div>
                      <button
                        className="teacher-icon-button danger"
                        onClick={() => deleteMockTest(test.id)}
                        disabled={busyId === test.id}
                        aria-label="Delete test"
                      >
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* AI ANALYSIS */}
          {activePage === "analysis" && (
            <section className="teacher-panel">
              <PanelHeading
                kicker="PERFORMANCE INSIGHTS"
                title="AI analysis"
                description="Review AI results saved for student speaking submissions."
              />

              <div className="teacher-info-banner">
                <i className="fa-solid fa-circle-info" />
                <span>
                  Automatic AI analysis has not been connected yet. This page
                  will show real analysis after the secure AI connection is added.
                </span>
              </div>

              <EmptyState
                icon="fa-chart-line"
                title="AI analysis is not connected yet"
                text="We will connect speech-to-text, grammar checks and CEFR scoring later."
              />
            </section>
          )}

          {/* TEACHER FEEDBACK */}
          {activePage === "feedback" && (
            <section className="teacher-panel">
              <PanelHeading
                kicker="PERSONAL GUIDANCE"
                title="Teacher feedback"
                description="Send a score, CEFR level and personal comment."
              />

              <form className="teacher-create-form" onSubmit={addFeedback}>
                <div className="teacher-form-title">
                  <div className="teacher-form-icon">
                    <i className="fa-solid fa-comment-medical" />
                  </div>
                  <div>
                    <h3>Write feedback</h3>
                    <p>Select the student's speaking submission first.</p>
                  </div>
                </div>

                <div className="teacher-form-grid">
                  <label className="teacher-field teacher-field-wide">
                    <span>Select speaking submission</span>
                    <select
                      value={feedbackSubmission}
                      onChange={(e) => setFeedbackSubmission(e.target.value)}
                      required
                    >
                      <option value="">Choose a submission</option>
                      {submissions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {getStudentName(item)} — {getPart(item)} —{" "}
                          {new Date(item.created_at).toLocaleDateString()}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="teacher-field">
                    <span>Speaking score</span>
                    <select
                      value={feedbackScore}
                      onChange={(e) => setFeedbackScore(e.target.value)}
                    >
                      {["4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0", "7.5", "8.0", "8.5", "9.0"].map((score) => (
                        <option key={score} value={score}>{score}</option>
                      ))}
                    </select>
                  </label>

                  <label className="teacher-field">
                    <span>CEFR level</span>
                    <select
                      value={feedbackLevel}
                      onChange={(e) => setFeedbackLevel(e.target.value)}
                    >
                      {["A1", "A2", "B1", "B2", "C1"].map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </label>

                  <label className="teacher-field teacher-field-wide">
                    <span>Your feedback</span>
                    <textarea
                      rows="5"
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Write comments, corrections and suggestions..."
                      required
                    />
                  </label>
                </div>

                <button
                  className="teacher-primary-button"
                  type="submit"
                  disabled={savingFeedback || submissions.length === 0}
                >
                  <i className="fa-solid fa-paper-plane" />
                  {savingFeedback ? "Sending..." : "Send feedback"}
                </button>

                {submissions.length === 0 && (
                  <p className="teacher-form-hint">
                    There are no speaking submissions to give feedback on yet.
                  </p>
                )}
              </form>

              <div className="teacher-subsection-heading">
                <div>
                  <h3>Sent feedback</h3>
                  <p>Feedback saved in the teacher_feedback table.</p>
                </div>
                <span className="teacher-count-pill">
                  {feedbackItems.length} items
                </span>
              </div>

              {feedbackItems.length === 0 ? (
                <EmptyState
                  icon="fa-comments"
                  title="No feedback yet"
                  text="Your saved feedback will appear here."
                />
              ) : (
                <div className="teacher-feedback-list">
                  {feedbackItems.map((item) => {
                    const relatedSubmission = submissions.find(
                      (submission) => submission.id === item.submission_id
                    );

                    return (
                      <article className="teacher-feedback-card" key={item.id}>
                        <div className="teacher-feedback-top">
                          <div className="teacher-student-avatar">
                            {(relatedSubmission
                              ? getStudentName(relatedSubmission)
                              : "S"
                            ).charAt(0).toUpperCase()}
                          </div>
                          <div className="teacher-feedback-person">
                            <strong>
                              {relatedSubmission
                                ? getStudentName(relatedSubmission)
                                : "Student"}
                            </strong>
                            <span>
                              {new Date(item.created_at).toLocaleDateString()} ·{" "}
                              {item.cefr_level || "No level"}
                            </span>
                          </div>
                          <span className="teacher-score-pill">
                            {item.score ?? "—"}
                          </span>
                        </div>
                        <p>{item.comment}</p>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <footer className="teacher-footer">
            <span>© {new Date().getFullYear()} Speaking Platform</span>
            <span>Made for better speaking practice</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, note, icon, color }) {
  return (
    <article className="teacher-stat-card">
      <div className="teacher-stat-top">
        <span>{label}</span>
        <div className={`teacher-stat-icon ${color}`}>
          <i className={`fa-solid ${icon}`} />
        </div>
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PanelHeading({ kicker, title, description, action, onAction }) {
  return (
    <div className="teacher-panel-heading">
      <div>
        <span className="teacher-section-kicker">{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && (
        <button className="teacher-text-button" onClick={onAction}>
          {action} <i className="fa-solid fa-arrow-right" />
        </button>
      )}
    </div>
  );
}

function Status({ status }) {
  const value =
    status === "approved" || status === "reviewed"
      ? "approved"
      : status === "rejected"
        ? "rejected"
        : "pending";

  const label =
    value === "approved"
      ? "Approved"
      : value === "rejected"
        ? "Rejected"
        : "Pending";

  return (
    <span className={`teacher-status ${value}`}>
      <span className="teacher-status-dot" />
      {label}
    </span>
  );
}

function Loading() {
  return (
    <div className="teacher-loading">
      <i className="fa-solid fa-spinner fa-spin" />
      Loading dashboard...
    </div>
  );
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="teacher-empty">
      <div className="teacher-empty-icon">
        <i className={`fa-solid ${icon}`} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function QuickLink({ icon, title, text, onClick }) {
  return (
    <button className="teacher-quick-link" onClick={onClick}>
      <span className="teacher-quick-icon purple">
        <i className={`fa-solid ${icon}`} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <i className="fa-solid fa-chevron-right" />
    </button>
  );
}