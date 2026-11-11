
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import "./teacher-speaking-assignments.css";

const BUCKET = "homework-files";
const GROUPS = ["13:30", "15:00"];

const PARTS = [
  "Part 1.1",
  "Part 1.2",
  "Part 2",
  "Part 3",
];

export default function TeacherSpeakingAssignments({ teacher, onChanged }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState("13:30");
  const [part, setPart] = useState("Part 1.1");
  const [pdf, setPdf] = useState(null);

  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("");

  async function loadAssignments() {
    if (!teacher?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data, error: fetchError } = await supabase
      .from("speaking_assignments")
      .select(
        "id, title, description, student_group, speaking_part, pdf_path, pdf_name, created_at, created_by"
      )
      .eq("created_by", teacher.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAssignments(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAssignments();
  }, [teacher?.id]);

  async function publishAssignment(e) {
    e.preventDefault();

    if (saving) return;

    setError("");
    setMessage("");

    if (!teacher?.id) {
      setError("Teacher ma'lumotlari topilmadi.");
      return;
    }

    if (!title.trim()) {
      setError("Topshiriq nomini kiriting.");
      return;
    }

    // PDF ixtiyoriy. Faqat tanlangan bo'lsa tekshiriladi.
    if (pdf) {
      if (
        pdf.type !== "application/pdf" &&
        !pdf.name.toLowerCase().endsWith(".pdf")
      ) {
        setError("Faqat PDF formatidagi fayl yuklash mumkin.");
        return;
      }

      if (pdf.size > 50 * 1024 * 1024) {
        setError("PDF hajmi 50 MB dan oshmasligi kerak.");
        return;
      }
    }

    setSaving(true);

    let assignmentId = null;
    let uploadedPath = "";

    try {
      // 1. Avval topshiriqni bazaga saqlaymiz.
      const { data: assignment, error: insertError } = await supabase
        .from("speaking_assignments")
        .insert({
          title: title.trim(),
          description: description.trim(),
          student_group: group,
          speaking_part: part,
          created_by: teacher.id,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      assignmentId = assignment.id;

      // 2. PDF tanlangan bo'lsa, uni yuklaymiz.
      if (pdf) {
        const uniqueName =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}`;

        uploadedPath = `${teacher.id}/${assignmentId}/${uniqueName}-${pdf.name.replace(/[^\w.-]/g, "_")}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(uploadedPath, pdf, {
            upsert: false,
            contentType: "application/pdf",
          });

        if (uploadError) throw uploadError;

        const { error: updateError } = await supabase
          .from("speaking_assignments")
          .update({
            pdf_path: uploadedPath,
            pdf_name: pdf.name,
          })
          .eq("id", assignmentId);

        if (updateError) throw updateError;
      }

      // 3. Formani tozalaymiz.
      setTitle("");
      setDescription("");
      setGroup("13:30");
      setPart("Part 1.1");
      setPdf(null);

      const input = document.getElementById("speaking-pdf-input");
      if (input) input.value = "";

      setMessage(
        pdf
          ? "Speaking topshirig'i va PDF muvaffaqiyatli joylandi!"
          : "Speaking topshirig'i muvaffaqiyatli joylandi!"
      );

      await loadAssignments();

      if (onChanged) {
        await onChanged();
      }
    } catch (err) {
      // Xatolik bo'lsa, yarim qolgan fayl va topshiriqni tozalaymiz.
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]);
      }

      if (assignmentId) {
        await supabase
          .from("speaking_assignments")
          .delete()
          .eq("id", assignmentId);
      }

      setError(err.message || "Topshiriqni joylashda xatolik yuz berdi.");
    } finally {
      setSaving(false);
    }
  }

  async function openPdf(item) {
    if (!item.pdf_path) {
      setError("Bu topshiriqda PDF fayl mavjud emas.");
      return;
    }

    setOpening(item.id);
    setError("");

    try {
      const { data, error: urlError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(item.pdf_path, 3600);

      if (urlError) throw urlError;

      if (!data?.signedUrl) {
        throw new Error("PDF havolasi yaratilmadi.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err.message || "PDF faylni ochib bo'lmadi.");
    } finally {
      setOpening("");
    }
  }

  async function deleteAssignment(item) {
    const confirmed = window.confirm(
      `"${item.title}" topshirig'ini o'chirmoqchimisiz?`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("speaking_assignments")
        .delete()
        .eq("id", item.id)
        .eq("created_by", teacher.id);

      if (deleteError) throw deleteError;

      if (item.pdf_path) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove([item.pdf_path]);

        if (storageError) {
          setError(
            "Topshiriq o'chirildi, ammo PDF faylni o'chirishda xatolik yuz berdi."
          );
        }
      }

      setMessage("Speaking topshirig'i o'chirildi.");

      await loadAssignments();

      if (onChanged) {
        await onChanged();
      }
    } catch (err) {
      setError(err.message || "Topshiriqni o'chirib bo'lmadi.");
    }
  }

  return (
    <div className="speaking-assignment-page">
      <div className="speaking-assignment-heading">
        <div>
          <span>SPEAKING PRACTICE</span>
          <h1>Speaking Assignments</h1>
          <p>Create speaking tasks for your student groups.</p>
        </div>

        <div className="speaking-assignment-total">
          <i className="fa-solid fa-file-pdf" />
          <strong>{assignments.length}</strong>
          <span>Tasks</span>
        </div>
      </div>

      {error && (
        <div className="speaking-assignment-alert error">
          <i className="fa-solid fa-circle-exclamation" />
          {error}
        </div>
      )}

      {message && (
        <div className="speaking-assignment-alert success">
          <i className="fa-solid fa-circle-check" />
          {message}
        </div>
      )}

      <div className="speaking-assignment-grid">
        <form
          className="speaking-assignment-form"
          onSubmit={publishAssignment}
        >
          <div className="speaking-assignment-form-title">
            <i className="fa-solid fa-cloud-arrow-up" />
            <div>
              <h2>Upload New Task</h2>
              <p>Create a speaking assignment. PDF is optional.</p>
            </div>
          </div>

          <label>Assignment title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Example: Daily Life Speaking Practice"
            required
          />

          <label>Speaking part</label>
          <select value={part} onChange={(e) => setPart(e.target.value)}>
            {PARTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <label>Student group</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUPS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <label>Instructions</label>
          <textarea
            rows="4"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Write instructions for your students..."
          />

          <label className="speaking-pdf-label">
            <i className="fa-solid fa-file-pdf" />
            Choose PDF file (optional)
            <input
              id="speaking-pdf-input"
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setPdf(e.target.files?.[0] || null)}
            />
          </label>

          {pdf && (
            <div className="speaking-pdf-selected">
              <i className="fa-solid fa-file-pdf" />
              <span>{pdf.name}</span>
              <button
                type="button"
                onClick={() => {
                  setPdf(null);
                  const input = document.getElementById("speaking-pdf-input");
                  if (input) input.value = "";
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          )}

          <small className="speaking-pdf-note">
            PDF optional · Maximum file size: 50 MB
          </small>

          <button
            className="speaking-assignment-publish"
            type="submit"
            disabled={saving}
          >
            <i
              className={`fa-solid ${
                saving ? "fa-spinner fa-spin" : "fa-paper-plane"
              }`}
            />
            {saving ? "Publishing..." : "Publish Speaking Task"}
          </button>
        </form>

        <section className="speaking-assignment-list">
          <div className="speaking-assignment-list-title">
            <div>
              <h2>Published Tasks</h2>
              <p>Tasks assigned to your groups.</p>
            </div>

            <button type="button" onClick={loadAssignments}>
              <i className="fa-solid fa-rotate" />
            </button>
          </div>

          {loading ? (
            <div className="speaking-assignment-empty">
              <i className="fa-solid fa-spinner fa-spin" />
              <p>Loading assignments...</p>
            </div>
          ) : assignments.length === 0 ? (
            <div className="speaking-assignment-empty">
              <i className="fa-regular fa-folder-open" />
              <h3>No tasks yet</h3>
              <p>Your published speaking tasks will appear here.</p>
            </div>
          ) : (
            <div className="speaking-assignment-items">
              {assignments.map((item) => (
                <article className="speaking-assignment-item" key={item.id}>
                  <div className="speaking-assignment-item-top">
                    <span>{item.speaking_part}</span>
                    <span>Group {item.student_group}</span>
                  </div>

                  <h3>{item.title}</h3>
                  <p>{item.description || "No instructions added."}</p>

                  <div className="speaking-assignment-pdf-name">
                    <i className="fa-solid fa-file-pdf" />
                    {item.pdf_name || "No PDF attached"}
                  </div>

                  <div className="speaking-assignment-actions">
                    {item.pdf_path && (
                      <button
                        type="button"
                        onClick={() => openPdf(item)}
                        disabled={opening === item.id}
                      >
                        <i
                          className={`fa-solid ${
                            opening === item.id
                              ? "fa-spinner fa-spin"
                              : "fa-eye"
                          }`}
                        />
                        Open PDF
                      </button>
                    )}

                    <button
                      type="button"
                      className="delete"
                      onClick={() => deleteAssignment(item)}
                    >
                      <i className="fa-solid fa-trash" />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
