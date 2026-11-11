
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./student-dashboard.css";

const PARTS = [
  { id: "part1_1", title: "Part 1.1", subtitle: "Short Questions", icon: "fa-comments" },
  { id: "part1_2", title: "Part 1.2", subtitle: "Topic Questions", icon: "fa-book-open" },
  { id: "part2", title: "Part 2", subtitle: "Picture Speaking", icon: "fa-image" },
  { id: "part3", title: "Part 3", subtitle: "Discussion", icon: "fa-lightbulb" },
];

const NAV = [
  ["overview", "Overview", "fa-house"],
  ["speaking", "Speaking Practice", "fa-microphone"],
  ["mock", "Full Mock Test", "fa-clipboard-check"],
  ["homework", "Homework", "fa-book"],
  ["results", "My Results", "fa-chart-column"],
  ["progress", "My Progress", "fa-chart-line"],
  ["feedback", "Teacher Feedback", "fa-comment"],
  ["profile", "My Profile", "fa-user"],
];

const isPreview = (student) => student?.id === "preview-student";

function getPartId(part) {
  const normalized = String(part || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const map = {
    part11: "part1_1",
    part12: "part1_2",
    part2: "part2",
    part3: "part3",
  };

  return map[normalized] || part;
}

function getPartName(part) {
  const partId = getPartId(part);
  return PARTS.find((item) => item.id === partId)?.title || part || "Speaking";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function getFileName(file) {
  return file?.name || "No file selected";
}

function formatAnalysisValue(value) {
  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "object" ? JSON.stringify(item) : String(item)
    ).join(", ");
  }

  return JSON.stringify(value, null, 2);
}

export default function StudentDashboard({ student, onLogout }) {
  const [page, setPage] = useState("overview");

  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [homework, setHomework] = useState([]);
  const [homeworkSubmissions, setHomeworkSubmissions] = useState([]);
  const [feedback, setFeedback] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);

  const [audioFile, setAudioFile] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);

  const [homeworkAnswers, setHomeworkAnswers] = useState({});
  const [homeworkFiles, setHomeworkFiles] = useState({});
  const [homeworkSearch, setHomeworkSearch] = useState("");

  const [resultSearch, setResultSearch] = useState("");
  const [resultPart, setResultPart] = useState("all");

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioPreviewRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const preview = isPreview(student);

  const displayName = student?.full_name || "Student";
  const initial = displayName.charAt(0).toUpperCase();

  // NOTIFICATION
  function showNotice(message) {
    setNotice(message);
    clearTimeout(noticeTimerRef.current);

    noticeTimerRef.current = setTimeout(() => {
      setNotice("");
    }, 3500);
  }

  // DEMO DATA
  function loadPreviewData() {
    setAssignments([
      {
        id: "demo-a1",
        title: "Daily Questions",
        description: "Answer these short questions.",
        speaking_part: "part1_1",
        questions: [
          "What is your favourite hobby?",
          "Do you enjoy reading?",
          "What do you usually do at weekends?",
        ],
        student_group: student?.student_group,
      },
      {
        id: "demo-a2",
        title: "Topic Speaking",
        description: "Speak about your favourite place.",
        speaking_part: "part1_2",
        questions: [
          "Describe your favourite place.",
          "Why do you like it?",
          "When did you last visit it?",
        ],
      },
      {
        id: "demo-a3",
        title: "Picture Description",
        description: "Describe the picture and compare the situations.",
        speaking_part: "part2",
        questions: [
          "Describe what you can see in the picture.",
          "Compare the people and their activities.",
        ],
      },
      {
        id: "demo-a4",
        title: "Discussion",
        description: "Share your opinion and explain your ideas.",
        speaking_part: "part3",
        questions: [
          "Is technology important in education?",
          "What are the advantages of online learning?",
        ],
      },
    ]);

    setSubmissions([]);
    setHomework([]);
    setHomeworkSubmissions([]);
    setFeedback([]);
  }

  // LOAD DATA
  async function loadData(isRefresh = false) {
    if (!student?.id || preview) {
      loadPreviewData();
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [
        assignmentResult,
        submissionResult,
        homeworkResult,
        homeworkSubmissionResult,
      ] = await Promise.all([
        supabase
          .from("speaking_assignments")
          .select(
            "id, title, description, speaking_part, student_group, pdf_path, pdf_name, created_at, created_by"
          )
          .eq("student_group", student.student_group)
          .order("created_at", { ascending: false }),

        supabase
          .from("speaking_submissions")
          .select(
            "id, student_id, assignment_id, speaking_part, audio_path, transcript, ai_score, cefr_level, ai_analysis, created_at"
          )
          .eq("student_id", student.id)
          .order("created_at", { ascending: false }),

        supabase
          .from("homework_assignments")
          .select("*")
          .eq("student_group", student.student_group),

        supabase
          .from("homework_submissions")
          .select("*")
          .eq("student_id", student.id),
      ]);

      if (assignmentResult.error) throw assignmentResult.error;
      if (submissionResult.error) throw submissionResult.error;

      setAssignments(assignmentResult.data || []);
      setSubmissions(submissionResult.data || []);

      if (homeworkResult.error) {
        console.error("Homework loading error:", homeworkResult.error);
        setHomework([]);
      } else {
        setHomework(homeworkResult.data || []);
      }

      if (homeworkSubmissionResult.error) {
        console.error(
          "Homework submissions loading error:",
          homeworkSubmissionResult.error
        );
        setHomeworkSubmissions([]);
      } else {
        setHomeworkSubmissions(homeworkSubmissionResult.data || []);
      }

      const ids = (submissionResult.data || []).map((item) => item.id);

      if (ids.length) {
        const feedbackResult = await supabase
          .from("teacher_feedback")
          .select("*")
          .in("submission_id", ids);

        if (feedbackResult.error) {
          console.error("Feedback loading error:", feedbackResult.error);
          setFeedback([]);
        } else {
          setFeedback(feedbackResult.data || []);
        }
      } else {
        setFeedback([]);
      }
    } catch (err) {
      setError(err.message || "Could not load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [student?.id]);

  // RECORDING TIMER
  useEffect(() => {
    if (!recording) {
      clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [recording]);

  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(noticeTimerRef.current);

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      if (audioPreviewRef.current) {
        URL.revokeObjectURL(audioPreviewRef.current);
      }
    };
  }, []);

  // CALCULATIONS
  const attemptsFor = (assignmentId) =>
    submissions.filter(
      (item) => item.assignment_id === assignmentId
    ).length;

  const remainingAttempts = (assignmentId) =>
    Math.max(0, 3 - attemptsFor(assignmentId));

  const homeworkSubmissionFor = (homeworkId) =>
    homeworkSubmissions.find(
      (item) => item.homework_id === homeworkId
    );

  const averageScore = useMemo(() => {
    const scores = submissions
      .filter(
        (item) =>
          item.ai_score !== null &&
          item.ai_score !== undefined &&
          !Number.isNaN(Number(item.ai_score))
      )
      .map((item) => Number(item.ai_score));

    if (!scores.length) return "—";

    return Math.round(
      scores.reduce((a, b) => a + b, 0) / scores.length
    );
  }, [submissions]);

  const homeworkDone = homeworkSubmissions.filter(
    (item) =>
      item.status === "submitted" || item.status === "accepted"
  ).length;

  const filteredResults = submissions.filter((item) => {
    const matchesPart =
      resultPart === "all" ||
      getPartId(item.speaking_part) === resultPart;

    const matchesSearch = getPartName(item.speaking_part)
      .toLowerCase()
      .includes(resultSearch.toLowerCase());

    return matchesPart && matchesSearch;
  });

  const filteredHomework = homework.filter((item) =>
    `${item.title || ""} ${item.description || ""}`
      .toLowerCase()
      .includes(homeworkSearch.toLowerCase())
  );

  const completedParts = PARTS.filter((part) =>
    submissions.some(
      (item) => getPartId(item.speaking_part) === part.id
    )
  ).length;

  // ASSIGNMENTS
  function openAssignment(assignment) {
    if (remainingAttempts(assignment.id) <= 0) {
      showNotice("You have used all 3 attempts for this assignment.");
      return;
    }

    setSelectedAssignment(assignment);
    setAudioFile(null);
    setRecordedBlob(null);
    setSeconds(0);
  }

  function closeAssignment() {
    if (saving || recording) return;

    setSelectedAssignment(null);
    setAudioFile(null);
    setRecordedBlob(null);
    setSeconds(0);
  }

  async function openSpeakingPdf(assignment) {
    if (!assignment?.pdf_path) {
      showNotice("Teacher has not uploaded a PDF for this assignment.");
      return;
    }

    const { data, error: pdfError } = await supabase.storage
      .from("homework-files")
      .createSignedUrl(assignment.pdf_path, 600);

    if (pdfError) {
      showNotice(pdfError.message);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  // AUDIO RECORDING
  async function startRecording() {
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        !window.MediaRecorder
      ) {
        showNotice("Audio recording is not supported in this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      chunksRef.current = [];

      let recorder;

      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        recorder = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
      } else {
        recorder = new MediaRecorder(stream);
      }

      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        setRecordedBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
      setSeconds(0);
      setAudioFile(null);
    } catch (err) {
      showNotice(
        err?.name === "NotAllowedError"
          ? "Please allow microphone access in your browser."
          : "Could not start recording. Check your microphone."
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    setRecording(false);
    clearInterval(timerRef.current);
  }

  function clearRecording() {
    setRecordedBlob(null);
    setAudioFile(null);
    setSeconds(0);

    if (audioPreviewRef.current) {
      URL.revokeObjectURL(audioPreviewRef.current);
      audioPreviewRef.current = null;
    }
  }

  // SUBMIT SPEAKING + AI ANALYSIS

  // SUBMIT SPEAKING + AI ANALYSIS
  async function submitSpeaking() {
    const audioToUpload = recordedBlob || audioFile;

    if (!selectedAssignment) {
      showNotice("Please select an assignment.");
      return;
    }

    if (!audioToUpload) {
      showNotice("Please record or upload your audio first.");
      return;
    }

    if (!student?.id || preview) {
      showNotice("Please log in with your student account.");
      return;
    }

    if (saving || recording) return;

    if (remainingAttempts(selectedAssignment.id) <= 0) {
      showNotice("You have used all 3 attempts.");
      return;
    }

    setSaving(true);

    let uploadedPath = null;
    let submissionId = null;

    try {
      const extension = audioToUpload.type?.includes("mp4")
        ? "mp4"
        : audioToUpload.type?.includes("wav")
        ? "wav"
        : "webm";

      const fileName = `${student.id}/${selectedAssignment.id}/${Date.now()}.${extension}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("speaking-audio")
        .upload(fileName, audioToUpload, {
          contentType: audioToUpload.type || "audio/webm",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      uploadedPath = uploadData.path;

      // Save audio submission first
      const { data: savedSubmission, error: insertError } = await supabase
        .from("speaking_submissions")
        .insert({
          student_id: student.id,
          assignment_id: selectedAssignment.id,
          speaking_part: selectedAssignment.speaking_part,
          audio_path: uploadedPath,
          transcript: "",
          ai_score: null,
          cefr_level: null,
          ai_analysis: null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      submissionId = savedSubmission.id;

      // Run AI analysis
      try {
        const formData = new FormData();

        formData.append("audio", audioToUpload, `speaking.${extension}`);
        formData.append(
          "speaking_part",
          selectedAssignment.speaking_part || ""
        );

        const { data: aiData, error: aiError } =
          await supabase.functions.invoke("speaking-ai-analysis", {
            body: formData,
          });

        if (aiError) throw aiError;

        if (!aiData?.success) {
          throw new Error(aiData?.error || "AI analysis failed.");
        }

        const analysis = aiData.analysis || {};

        const { error: updateError } = await supabase
          .from("speaking_submissions")
          .update({
            transcript: aiData.transcript || "",
            ai_score: analysis.overall_score ?? null,
            cefr_level: analysis.cefr_estimate || null,
            ai_analysis: analysis,
          })
          .eq("id", submissionId);

        if (updateError) throw updateError;

        showNotice("Speaking submitted and AI analysis completed!");
      } catch (aiError) {
        console.error("AI analysis error:", aiError);

        showNotice(
          "Your audio was saved, but AI analysis failed. Your teacher can still listen to it."
        );
      }

      setSelectedAssignment(null);
      clearRecording();
      await loadData(true);
    } catch (err) {
      console.error("Speaking submission error:", err);

      if (!submissionId && uploadedPath) {
        await supabase.storage
          .from("speaking-audio")
          .remove([uploadedPath]);
      }

      showNotice(err.message || "Could not submit your speaking assignment.");
    } finally {
      setSaving(false);
    }
  }

  // HOMEWORK
  async function openAttachment(path) {
    if (!path) {
      showNotice("Attachment is not available.");
      return;
    }

    const { data, error: signedError } = await supabase.storage
      .from("homework-files")
      .createSignedUrl(path, 600);

    if (signedError) {
      showNotice(signedError.message);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function submitHomework(item) {
    if (preview) {
      showNotice("Preview mode: homework is not saved.");
      return;
    }

    const existing = homeworkSubmissionFor(item.id);

    if (existing) {
      showNotice("You have already submitted this homework.");
      return;
    }

    const answer = homeworkAnswers[item.id] || "";
    const file = homeworkFiles[item.id];

    if (!answer.trim() && !file) {
      showNotice("Write an answer or attach a file first.");
      return;
    }

    setSaving(true);
    setError("");

    let filePath = null;

    try {
      if (file) {
        const safeName = file.name.replace(
          /[^a-zA-Z0-9._-]/g,
          "_"
        );

        filePath = `${student.id}/${item.id}/${Date.now()}-${safeName}`;

        const uploadResult = await supabase.storage
          .from("homework-files")
          .upload(filePath, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });

        if (uploadResult.error) throw uploadResult.error;
      }

      const result = await supabase
        .from("homework_submissions")
        .insert({
          student_id: student.id,
          homework_id: item.id,
          answer: answer.trim() || null,
          file_path: filePath,
          status: "submitted",
        });

      if (result.error) throw result.error;

      showNotice("Homework submitted successfully!");

      setHomeworkAnswers((old) => ({
        ...old,
        [item.id]: "",
      }));

      setHomeworkFiles((old) => ({
        ...old,
        [item.id]: null,
      }));

      await loadData(true);
    } catch (err) {
      if (filePath) {
        await supabase.storage
          .from("homework-files")
          .remove([filePath]);
      }

      setError(err.message || "Could not submit homework.");
    } finally {
      setSaving(false);
    }
  }

  // SHARED UI
  function renderPageHeading(title, description) {
    return (
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        <button
          className="outline-button"
          onClick={() => loadData(true)}
          disabled={refreshing}
        >
          <i className={`fa-solid fa-rotate ${refreshing ? "fa-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    );
  }

  function renderEmpty(icon, message) {
    return (
      <div className="empty-state">
        <i className={`fa-regular ${icon}`} />
        <p>{message}</p>
      </div>
    );
  }

  function renderAssignmentCard(item) {
    const left = remainingAttempts(item.id);

    return (
      <article className="assignment-card" key={item.id}>
        <div className="assignment-card-body">
          <div className="assignment-topline">
            <span className="mini-label">
              {getPartName(item.speaking_part)}
            </span>

            <span className={`attempt-pill ${left === 0 ? "limit" : ""}`}>
              {left}/3 attempts left
            </span>
          </div>

          <h3>{item.title}</h3>

          <p>
            {item.description || "Complete this speaking assignment."}
          </p>

          {item.pdf_path && (
            <button
              className="outline-button"
              onClick={() => openSpeakingPdf(item)}
            >
              <i className="fa-solid fa-file-pdf" />
              Open PDF: {item.pdf_name || "Speaking task"}
            </button>
          )}

          <button
            className="primary-button"
            disabled={left === 0}
            onClick={() => openAssignment(item)}
          >
            {left === 0 ? "Attempts finished" : "Start speaking"}
            <i className="fa-solid fa-arrow-right" />
          </button>
        </div>
      </article>
    );
  }

  // OVERVIEW
  function renderOverview() {
    return (
      <>
        <section className="student-welcome">
          <div>
            <span className="eyebrow">
              MISS BIBISORA · SPEAKING PLATFORM
            </span>

            <h1>Welcome back, {displayName.split(" ")[0]}!</h1>

            <p>
              Every speaking practice brings you one step closer to confidence.
            </p>

            <button
              className="primary-button"
              onClick={() => setPage("speaking")}
            >
              Start practising
              <i className="fa-solid fa-arrow-right" />
            </button>
          </div>

          <div className="welcome-decoration">
            <i className="fa-solid fa-microphone-lines" />
          </div>
        </section>

        <div className="student-stats">
          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-microphone" />
            </div>
            <div>
              <small>Speaking Attempts</small>
              <strong>{submissions.length}</strong>
            </div>
          </div>

          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-book-open" />
            </div>
            <div>
              <small>Homework Done</small>
              <strong>{homeworkDone}</strong>
            </div>
          </div>

          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-star" />
            </div>
            <div>
              <small>Average AI Score</small>
              <strong>{averageScore}</strong>
            </div>
          </div>

          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-trophy" />
            </div>
            <div>
              <small>Teacher Feedback</small>
              <strong>{feedback.length}</strong>
            </div>
          </div>
        </div>

        <div className="student-two-columns">
          <section className="student-panel">
            <div className="panel-heading">
              <div>
                <h2>Speaking Practice</h2>
                <p>Choose a part and start speaking</p>
              </div>
              <div className="heading-decoration" />
            </div>

            <div className="part-grid">
              {PARTS.map((part) => (
                <button
                  className="part-card"
                  key={part.id}
                  onClick={() => setPage("speaking")}
                >
                  <div className="part-icon">
                    <i className={`fa-solid ${part.icon}`} />
                  </div>

                  <strong>{part.title}</strong>
                  <small>{part.subtitle}</small>
                  <i className="fa-solid fa-arrow-right part-arrow" />
                </button>
              ))}
            </div>
          </section>

          <section className="student-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent Results</h2>
                <p>Your latest speaking submissions</p>
              </div>
              <div className="heading-decoration" />
            </div>

            {submissions.length ? (
              <div className="recent-list">
                {submissions.slice(0, 5).map((item) => (
                  <div className="recent-item" key={item.id}>
                    <div className="recent-icon">
                      <i className="fa-solid fa-microphone" />
                    </div>

                    <div>
                      <strong>{getPartName(item.speaking_part)}</strong>
                      <small>{formatDate(item.created_at)}</small>
                    </div>

                    <b>{item.ai_score ?? "—"}</b>
                  </div>
                ))}
              </div>
            ) : (
              renderEmpty("fa-folder-open", "Your speaking results will appear here.")
            )}
          </section>
        </div>

        <section className="student-panel">
          <div className="panel-heading">
            <div>
              <h2>Your learning progress</h2>
              <p>Completed speaking parts</p>
            </div>
            <div className="heading-decoration" />
          </div>

          <div className="progress-list">
            <div className="progress-label">
              <strong>Speaking parts completed</strong>
              <span>{completedParts}/4</span>
            </div>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(completedParts / 4) * 100}%` }}
              />
            </div>
          </div>
        </section>
      </>
    );
  }

  // SPEAKING
  function renderSpeakingPage() {
    return (
      <>
        {renderPageHeading(
          "Speaking Practice",
          "Choose an assignment and record your speaking answer."
        )}

        {PARTS.map((part) => {
          const list = assignments.filter(
            (item) => getPartId(item.speaking_part) === part.id
          );

          return (
            <section className="student-panel part-section" key={part.id}>
              <div className="part-section-heading">
                <div className="part-icon">
                  <i className={`fa-solid ${part.icon}`} />
                </div>

                <div>
                  <h3>{part.title}</h3>
                  <p>{part.subtitle}</p>
                </div>
              </div>

              {list.length ? (
                <div className="assignment-grid">
                  {list.map(renderAssignmentCard)}
                </div>
              ) : (
                renderEmpty("fa-folder-open", "No assignments for this part yet.")
              )}
            </section>
          );
        })}
      </>
    );
  }

  // FULL MOCK TEST
  function renderMockPage() {
    return (
      <>
        {renderPageHeading(
          "Full Speaking Mock Test",
          "Practise all four speaking parts in one session."
        )}

        <div className="student-panel mock-intro">
          <div className="mock-icon">
            <i className="fa-solid fa-microphone-lines" />
          </div>

          <div>
            <h2>Your Speaking Mock Test</h2>
            <p>
              Complete the available assignments for all four speaking parts.
              Each assignment has its own three-attempt limit.
            </p>
          </div>
        </div>

        {PARTS.map((part, index) => {
          const list = assignments.filter(
            (item) => getPartId(item.speaking_part) === part.id
          );

          const completed = submissions.some(
            (item) => getPartId(item.speaking_part) === part.id
          );

          return (
            <div className="mock-step" key={part.id}>
              <div className="mock-number">{index + 1}</div>

              <div className="mock-step-content">
                <strong>{part.title} — {part.subtitle}</strong>
                <small>
                  {list.length
                    ? `${list.length} assignment(s) available`
                    : "No assignment available yet"}
                </small>
              </div>

              {completed && (
                <span className="status-pill success">Attempted</span>
              )}

              <button
                className="outline-button"
                disabled={!list.length}
                onClick={() => openAssignment(list[0])}
              >
                Start
              </button>
            </div>
          );
        })}
      </>
    );
  }

  // HOMEWORK
  function renderHomeworkPage() {
    return (
      <>
        {renderPageHeading(
          "Homework",
          "View your teacher's tasks and submit your answers."
        )}

        <div className="student-panel">
          <input
            type="search"
            className="dashboard-search"
            placeholder="Search homework..."
            value={homeworkSearch}
            onChange={(e) => setHomeworkSearch(e.target.value)}
          />
        </div>

        {filteredHomework.length ? (
          <div className="homework-grid">
            {filteredHomework.map((item) => {
              const submitted = homeworkSubmissionFor(item.id);

              const attachments = Array.isArray(item.attachments)
                ? item.attachments
                : [];

              return (
                <article
                  className="student-panel homework-card"
                  key={item.id}
                >
                  <div className="homework-card-top">
                    <div className="homework-icon">
                      <i className="fa-solid fa-book-open" />
                    </div>

                    <span
                      className={`status-pill ${submitted ? "success" : "pending"}`}
                    >
                      {submitted?.status || "Not submitted"}
                    </span>
                  </div>

                  <h3>{item.title}</h3>
                  <p>{item.description}</p>

                  <div className="homework-deadline">
                    <i className="fa-regular fa-calendar" />
                    Deadline: {formatDate(item.due_at)}
                  </div>

                  {attachments.length > 0 && (
                    <div className="attachment-list">
                      {attachments.map((file, index) => {
                        const path = file.path || file.file_path;
                        const name =
                          file.name ||
                          file.file_name ||
                          `Attachment ${index + 1}`;

                        return (
                          <button
                            className="attachment-button"
                            key={path || index}
                            onClick={() => openAttachment(path)}
                          >
                            <i className="fa-solid fa-paperclip" />
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {submitted ? (
                    <p className="muted-text">
                      Your homework has been submitted.
                    </p>
                  ) : (
                    <div className="homework-submit-area">
                      <textarea
                        placeholder="Write your answer here..."
                        value={homeworkAnswers[item.id] || ""}
                        onChange={(e) =>
                          setHomeworkAnswers((old) => ({
                            ...old,
                            [item.id]: e.target.value,
                          }))
                        }
                      />

                      <label className="file-picker">
                        <i className="fa-solid fa-cloud-arrow-up" />
                        {getFileName(homeworkFiles[item.id])}

                        <input
                          type="file"
                          onChange={(e) =>
                            setHomeworkFiles((old) => ({
                              ...old,
                              [item.id]: e.target.files?.[0] || null,
                            }))
                          }
                        />
                      </label>

                      <button
                        className="primary-button"
                        disabled={saving}
                        onClick={() => submitHomework(item)}
                      >
                        {saving ? "Submitting..." : "Submit homework"}
                        <i className="fa-solid fa-paper-plane" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="student-panel">
            {renderEmpty(
              "fa-folder-open",
              homework.length
                ? "No homework matches your search."
                : "Your teacher has not assigned any homework yet."
            )}
          </div>
        )}
      </>
    );
  }

  // RESULTS
  function renderResultsPage() {
    return (
      <>
        {renderPageHeading(
          "My Results",
          "Your speaking submission history and AI analysis."
        )}

        <div className="student-panel">
          <div className="result-filters">
            <input
              type="search"
              className="dashboard-search"
              placeholder="Search speaking part..."
              value={resultSearch}
              onChange={(e) => setResultSearch(e.target.value)}
            />

            <select
              value={resultPart}
              onChange={(e) => setResultPart(e.target.value)}
            >
              <option value="all">All parts</option>
              {PARTS.map((part) => (
                <option key={part.id} value={part.id}>
                  {part.title}
                </option>
              ))}
            </select>
          </div>

          {filteredResults.length ? (
            <div className="result-table-wrap">
              <table className="result-table">
                <thead>
                  <tr>
                    <th>Speaking Part</th>
                    <th>Date</th>
                    <th>AI Score</th>
                    <th>CEFR</th>
                    <th>Status</th>
                    <th>Analysis</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredResults.map((item) => (
                    <tr key={item.id}>
                      <td>{getPartName(item.speaking_part)}</td>
                      <td>{formatDate(item.created_at)}</td>
                      <td>{item.ai_score ?? "Not analysed"}</td>
                      <td>{item.cefr_level || "—"}</td>
                      <td>
                        <span className="status-pill success">
                          Submitted
                        </span>
                      </td>
                      <td>
                        <button
                          className="outline-button"
                          disabled={!item.ai_analysis}
                          onClick={() => setSelectedAnalysis(item)}
                        >
                          <i className="fa-solid fa-chart-simple" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            renderEmpty("fa-folder-open", "No speaking results found.")
          )}
        </div>
      </>
    );
  }

  // PROGRESS
  function renderProgressPage() {
    return (
      <>
        {renderPageHeading(
          "My Progress",
          "See how much speaking practice you have completed."
        )}

        <div className="student-stats">
          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-list-check" />
            </div>
            <div>
              <small>Completed Parts</small>
              <strong>{completedParts}/4</strong>
            </div>
          </div>

          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-microphone" />
            </div>
            <div>
              <small>Total Attempts</small>
              <strong>{submissions.length}</strong>
            </div>
          </div>

          <div className="student-stat-card">
            <div className="stat-icon">
              <i className="fa-solid fa-book" />
            </div>
            <div>
              <small>Homework Completed</small>
              <strong>{homeworkDone}</strong>
            </div>
          </div>
        </div>

        <div className="student-panel">
          <div className="panel-heading">
            <div>
              <h2>Practice by speaking part</h2>
              <p>Your submitted assignments</p>
            </div>
            <div className="heading-decoration" />
          </div>

          <div className="progress-list">
            {PARTS.map((part) => {
              const total = assignments.filter(
                (a) => getPartId(a.speaking_part) === part.id
              ).length;

              const done = submissions.filter(
                (s) => getPartId(s.speaking_part) === part.id
              ).length;

              const percent = total
                ? Math.min(100, Math.round((done / total) * 100))
                : 0;

              return (
                <div key={part.id}>
                  <div className="progress-label">
                    <strong>{part.title}</strong>
                    <span>{done} submitted / {total} available</span>
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  // FEEDBACK
  function renderFeedbackPage() {
    return (
      <>
        {renderPageHeading(
          "Teacher Feedback",
          "Comments and scores from Miss Bibisora."
        )}

        {feedback.length ? (
          <div className="feedback-grid">
            {feedback.map((item) => (
              <article
                className="student-panel feedback-card"
                key={item.id}
              >
                <div className="feedback-card-top">
                  <div className="feedback-icon">
                    <i className="fa-solid fa-comment-dots" />
                  </div>

                  <div className="feedback-score">
                    {item.score ?? "—"} <small>/ score</small>
                  </div>
                </div>

                <p>
                  {item.comment || "Your teacher has not added a comment."}
                </p>

                <div className="feedback-card-bottom">
                  <span>{item.cefr_level || "CEFR not assigned"}</span>
                  <small>{formatDate(item.created_at)}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="student-panel">
            {renderEmpty(
              "fa-comments",
              "Your teacher's feedback will appear here."
            )}
          </div>
        )}
      </>
    );
  }

  // PROFILE
  function renderProfilePage() {
    return (
      <>
        {renderPageHeading(
          "My Profile",
          "Your student account information."
        )}

        <div className="student-panel profile-panel">
          <div className="profile-avatar">{initial}</div>
          <h2>{displayName}</h2>
          <p className="profile-role">Speaking Platform Student</p>

          <div className="profile-details">
            <div className="profile-row">
              <span>Full name</span>
              <strong>{student?.full_name || "—"}</strong>
            </div>

            <div className="profile-row">
              <span>Username</span>
              <strong>{student?.username || "—"}</strong>
            </div>

            <div className="profile-row">
              <span>Email</span>
              <strong>{student?.email || "—"}</strong>
            </div>

            <div className="profile-row">
              <span>Group</span>
              <strong>{student?.student_group || "—"}</strong>
            </div>

            <div className="profile-row">
              <span>Account status</span>
              <strong>{student?.approval_status || "—"}</strong>
            </div>
          </div>
        </div>
      </>
    );
  }

  // PAGE SWITCH
  function renderCurrentPage() {
    switch (page) {
      case "speaking":
        return renderSpeakingPage();
      case "mock":
        return renderMockPage();
      case "homework":
        return renderHomeworkPage();
      case "results":
        return renderResultsPage();
      case "progress":
        return renderProgressPage();
      case "feedback":
        return renderFeedbackPage();
      case "profile":
        return renderProfilePage();
      default:
        return renderOverview();
    }
  }

  // LOADING
  if (loading) {
    return (
      <div className="student-loading">
        <span className="loading-spinner" />
        Loading your dashboard...
      </div>
    );
  }

  // MAIN DASHBOARD
  return (
    <div className="student-dashboard">
      <aside className="student-sidebar">
        <div className="student-brand">
          <div className="brand-mark">MB</div>
          <div>
            <strong>Miss Bibisora</strong>
            <small>Speaking Platform</small>
          </div>
        </div>

        <div className="sidebar-caption">STUDENT MENU</div>

        <nav className="student-nav">
          {NAV.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <i className={`fa-solid ${icon}`} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-profile">
            <div className="mini-avatar">{initial}</div>
            <div>
              <strong>{displayName}</strong>
              <small>{student?.student_group || "Student"}</small>
            </div>
          </div>

          <button className="logout-button" onClick={onLogout}>
            <i className="fa-solid fa-right-from-bracket" />
            Log out
          </button>
        </div>
      </aside>

      <main className="student-main">
        <header className="student-topbar">
          <div>
            <span className="topbar-small">STUDENT PORTAL</span>
            <h2>
              {NAV.find((item) => item[0] === page)?.[1] || "Overview"}
            </h2>
          </div>

          <div className="topbar-right">
            <span className="group-badge">
              <i className="fa-solid fa-users" />
              {student?.student_group || "Student"}
            </span>

            <div className="topbar-avatar">{initial}</div>
          </div>
        </header>

        <div className="student-content">
          {notice && (
            <div className="student-toast">
              <i className="fa-solid fa-circle-info" />
              {notice}
            </div>
          )}

          {error && (
            <div className="student-error">
              <i className="fa-solid fa-circle-exclamation" />
              {error}
            </div>
          )}

          {renderCurrentPage()}
        </div>
      </main>

      {/* SPEAKING ASSIGNMENT MODAL */}
      {selectedAssignment && (
        <div
          className="speaking-modal-backdrop"
          onClick={closeAssignment}
        >
          <section
            className="speaking-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={closeAssignment}
              disabled={saving || recording}
            >
              <i className="fa-solid fa-xmark" />
            </button>

            <span className="eyebrow">
              {getPartName(selectedAssignment.speaking_part)}
            </span>

            <h2>{selectedAssignment.title}</h2>

            <p className="modal-description">
              {selectedAssignment.description}
            </p>

            {selectedAssignment.pdf_path && (
              <div className="question-box">
                <h3>
                  <i className="fa-solid fa-file-pdf" />
                  Speaking Assignment PDF
                </h3>

                <button
                  className="outline-button"
                  onClick={() => openSpeakingPdf(selectedAssignment)}
                >
                  <i className="fa-solid fa-file-pdf" />
                  Open assignment PDF
                </button>

                {selectedAssignment.pdf_name && (
                  <p>{selectedAssignment.pdf_name}</p>
                )}
              </div>
            )}

            <div className="recording-area">
              <div
                className={`recording-indicator ${
                  recording ? "is-recording" : ""
                }`}
              >
                <span />
                {recording ? "Recording in progress" : "Audio recorder"}
              </div>

              <div className="recording-time">
                {formatTime(seconds)}
              </div>

              {!recording ? (
                <button
                  className="record-button"
                  onClick={startRecording}
                  disabled={saving}
                >
                  <i className="fa-solid fa-microphone" />
                  Start recording
                </button>
              ) : (
                <button
                  className="stop-button"
                  onClick={stopRecording}
                >
                  <i className="fa-solid fa-stop" />
                  Stop recording
                </button>
              )}

              {recordedBlob && (
                <div className="file-success">
                  <i className="fa-solid fa-check-circle" />
                  Recording ready
                  <button
                    type="button"
                    className="clear-audio-button"
                    onClick={clearRecording}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="audio-divider">
              OR UPLOAD AN AUDIO FILE
            </div>

            <label className="file-picker audio-picker">
              <i className="fa-solid fa-cloud-arrow-up" />
              {audioFile?.name || "Choose audio file"}

              <input
                type="file"
                accept="audio/*"
                disabled={recording || saving}
                onChange={(e) => {
                  setAudioFile(e.target.files?.[0] || null);
                  setRecordedBlob(null);
                  setSeconds(0);
                }}
              />
            </label>

            {(audioFile || recordedBlob) && (
              <div className="audio-selected">
                <i className="fa-solid fa-file-audio" />
                <span>
                  {audioFile?.name || "Your recorded answer is ready"}
                </span>
              </div>
            )}

            <button
              className="primary-button modal-submit"
              disabled={saving || recording || (!audioFile && !recordedBlob)}
              onClick={submitSpeaking}
            >
              {saving ? "AI is analysing..." : "Submit speaking"}
              <i className="fa-solid fa-paper-plane" />
            </button>

            <p className="attempt-note">
              {remainingAttempts(selectedAssignment.id)} of 3 attempts remaining.
            </p>

            <p className="attempt-note">
              Your answer will be transcribed and evaluated by AI after submission.
            </p>
          </section>
        </div>
      )}

      {/* AI ANALYSIS MODAL */}
      {selectedAnalysis && (
        <div
          className="speaking-modal-backdrop"
          onClick={() => setSelectedAnalysis(null)}
        >
          <section
            className="speaking-modal ai-analysis-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelectedAnalysis(null)}
            >
              <i className="fa-solid fa-xmark" />
            </button>

            <span className="eyebrow">AI SPEAKING REPORT</span>

            <h2>{getPartName(selectedAnalysis.speaking_part)} Analysis</h2>

            <div className="student-stats">
              <div className="student-stat-card">
                <div className="stat-icon">
                  <i className="fa-solid fa-star" />
                </div>
                <div>
                  <small>AI Score</small>
                  <strong>{selectedAnalysis.ai_score ?? "—"}/100</strong>
                </div>
              </div>

              <div className="student-stat-card">
                <div className="stat-icon">
                  <i className="fa-solid fa-graduation-cap" />
                </div>
                <div>
                  <small>Estimated CEFR</small>
                  <strong>{selectedAnalysis.cefr_level || "—"}</strong>
                </div>
              </div>
            </div>

            {selectedAnalysis.transcript && (
              <div className="question-box">
                <h3>
                  <i className="fa-solid fa-file-lines" />
                  Transcript
                </h3>
                <p>{selectedAnalysis.transcript}</p>
              </div>
            )}

            {selectedAnalysis.ai_analysis && (
              <div className="ai-analysis-content">
                {Object.entries(selectedAnalysis.ai_analysis).map(
                  ([key, value]) => (
                    <div className="question-box" key={key}>
                      <h3>
                        {key.replace(/_/g, " ").replace(/\b\w/g, (letter) =>
                          letter.toUpperCase()
                        )}
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>
                        {formatAnalysisValue(value)}
                      </p>
                    </div>
                  )
                )}
              </div>
            )}

            <p className="attempt-note">
              AI scores and CEFR levels are estimates. Your teacher can review your result.
            </p>

            <button
              className="primary-button"
              onClick={() => setSelectedAnalysis(null)}
            >
              Close report
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
