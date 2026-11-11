import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import "./teacher-homework.css";

const GROUPS = ["13:30", "15:00"];
const BUCKET = "homework-files";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 10;

const ACCEPTED_FILES =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.gif,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.mp4,.mov,.avi";

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();

  if (["pdf"].includes(ext)) return "fa-file-pdf";
  if (["doc", "docx"].includes(ext)) return "fa-file-word";
  if (["ppt", "pptx"].includes(ext)) return "fa-file-powerpoint";
  if (["xls", "xlsx", "csv"].includes(ext)) return "fa-file-excel";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(ext))
    return "fa-file-audio";
  if (["mp4", "webm", "mov", "avi"].includes(ext))
    return "fa-file-video";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext))
    return "fa-file-image";

  return "fa-file";
}

function safeFileName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]/g, "_")
    .replace(/_+/g, "_");
}

export default function TeacherHomework() {
  const fileInputRef = useRef(null);

  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [homework, setHomework] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedHomework, setSelectedHomework] = useState(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [group, setGroup] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [files, setFiles] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openingFile, setOpeningFile] = useState("");

 async function loadData() {
  setLoading(true);
  setError("");

  try {
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!authData.user) {
      throw new Error("Teacher login topilmadi.");
    }

    // AUTH ID ni tekshirish
    console.log("CURRENT AUTH ID:", authData.user.id);

    const { data: teacherData, error: teacherError } =
      await supabase
        .from("students")
        .select("id, full_name, auth_user_id")
        .eq("auth_user_id", authData.user.id)
        .eq("user_role", "teacher")
        .eq("approval_status", "approved")
        .single();

    console.log("TEACHER DATA:", teacherData);
    console.log("TEACHER ERROR:", teacherError);

    if (teacherError) throw teacherError;

    setTeacher(teacherData);

    const { data: studentData, error: studentError } =
      await supabase
        .from("students")
        .select("id, full_name, username, student_group")
        .eq("user_role", "student")
        .eq("approval_status", "approved")
        .order("full_name");

    if (studentError) throw studentError;
    setStudents(studentData || []);

    const { data: homeworkData, error: homeworkError } =
      await supabase
        .from("homework_assignments")
        .select("*")
        .order("created_at", { ascending: false });

    if (homeworkError) throw homeworkError;
    setHomework(homeworkData || []);

    const { data: submissionData, error: submissionError } =
      await supabase
        .from("homework_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });

    if (submissionError) throw submissionError;
    setSubmissions(submissionData || []);

  } catch (err) {
    console.error("LOAD DATA ERROR:", err);
    setError(err.message || "Ma'lumotlarni yuklashda xatolik.");
  } finally {
    setLoading(false);
  }
}

  useEffect(() => {
    loadData();
  }, []);

  function handleFileChange(e) {
    setError("");
    setSuccess("");

    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    const remainingSlots = MAX_FILES - files.length;

    if (remainingSlots <= 0) {
      setError(`Bitta vazifaga ko'pi bilan ${MAX_FILES} ta fayl biriktirish mumkin.`);
      e.target.value = "";
      return;
    }

    const validFiles = [];

    for (const file of selectedFiles) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: fayl hajmi 50 MB dan oshmasligi kerak.`);
        continue;
      }

      const alreadyAdded = files.some(
        (item) =>
          item.name === file.name &&
          item.size === file.size &&
          item.lastModified === file.lastModified
      );

      if (alreadyAdded) continue;

      validFiles.push(file);
    }

    setFiles((previous) => [
      ...previous,
      ...validFiles.slice(0, remainingSlots),
    ]);

    if (selectedFiles.length > remainingSlots) {
      setError(`Faqat yana ${remainingSlots} ta fayl qo'shish mumkin edi.`);
    }

    e.target.value = "";
  }

  function removeFile(index) {
    setFiles((previous) =>
      previous.filter((_, fileIndex) => fileIndex !== index)
    );
  }

  async function uploadHomeworkFiles(homeworkId) {
    const uploadedFiles = [];

    for (const file of files) {
      const uniquePart =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const path = `${teacher.id}/${homeworkId}/${uniquePart}-${safeFileName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        throw new Error(`${file.name} yuklanmadi: ${uploadError.message}`);
      }

      uploadedFiles.push({
        name: file.name,
        path,
        type: file.type || "application/octet-stream",
        size: file.size,
      });
    }

    return uploadedFiles;
  }

  async function createHomework(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!title.trim() || !group) {
      setError("Vazifa nomi va guruhni tanlang.");
      return;
    }

    if (!teacher) {
      setError("Teacher ma'lumotlari topilmadi.");
      return;
    }

    setSaving(true);
    let createdHomeworkId = null;
    let uploadedPaths = [];

    try {
      const { data: homeworkData, error: insertError } =
        await supabase
          .from("homework_assignments")
          .insert({
            title: title.trim(),
            description: description.trim(),
            student_group: group,
            due_at: dueAt ? new Date(dueAt).toISOString() : null,
            created_by: teacher.id,
            attachments: [],
          })
          .select()
          .single();

      if (insertError) throw insertError;

      createdHomeworkId = homeworkData.id;

      if (files.length > 0) {
        const uploadedFiles = await uploadHomeworkFiles(createdHomeworkId);
        uploadedPaths = uploadedFiles.map((file) => file.path);

        const { error: updateError } = await supabase
          .from("homework_assignments")
          .update({ attachments: uploadedFiles })
          .eq("id", createdHomeworkId);

        if (updateError) throw updateError;
      }

      setTitle("");
      setDescription("");
      setGroup("");
      setDueAt("");
      setFiles([]);

      setSuccess("Homework muvaffaqiyatli yaratildi!");
      await loadData();
    } catch (err) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths);
      }

      if (createdHomeworkId) {
        await supabase
          .from("homework_assignments")
          .delete()
          .eq("id", createdHomeworkId);
      }

      setError(err.message || "Vazifa yaratilmadi.");
    } finally {
      setSaving(false);
    }
  }

  async function openAttachment(attachment) {
    if (!attachment?.path) return;

    setOpeningFile(attachment.path);
    setError("");

    try {
      const { data, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachment.path, 3600, {
          download: attachment.name,
        });

      if (signedError) throw signedError;
      if (!data?.signedUrl) {
        throw new Error("Fayl havolasi yaratilmadi.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(`Faylni ochib bo'lmadi: ${err.message}`);
    } finally {
      setOpeningFile("");
    }
  }

  async function deleteHomework(id) {
    const confirmed = window.confirm(
      "Bu vazifani va unga biriktirilgan fayllarni o'chirmoqchimisiz?"
    );

    if (!confirmed) return;

    setError("");
    setSuccess("");

    try {
      const target = homework.find((item) => item.id === id);
      const attachments = Array.isArray(target?.attachments)
        ? target.attachments
        : [];

      const { error: deleteError } = await supabase
        .from("homework_assignments")
        .delete()
        .eq("id", id);

      if (deleteError) throw deleteError;

      const paths = attachments
        .map((file) => file.path)
        .filter(Boolean);

      if (paths.length) {
        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .remove(paths);

        if (storageError) {
          setError(
            "Vazifa o'chirildi, ammo ayrim fayllarni Storage'dan o'chirishda xatolik yuz berdi."
          );
        }
      }

      setSelectedHomework(null);
      setSuccess("Homework o'chirildi.");
      await loadData();
    } catch (err) {
      setError(err.message || "Vazifani o'chirib bo'lmadi.");
    }
  }

  function getHomeworkSubmissions(homeworkId) {
    return submissions.filter((item) => item.homework_id === homeworkId);
  }

  function formatDate(date) {
    if (!date) return "Deadline belgilanmagan";

    return new Date(date).toLocaleString("uz-UZ", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderAttachments(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return null;
    }

    return (
      <div className="teacher-homework-attachments">
        <strong>
          <i className="fa-solid fa-paperclip"></i>
          Biriktirilgan fayllar ({attachments.length})
        </strong>

        <div className="teacher-homework-attachment-list">
          {attachments.map((file, index) => (
            <button
              type="button"
              className="teacher-homework-attachment"
              key={`${file.path || file.name}-${index}`}
              onClick={() => openAttachment(file)}
              disabled={openingFile === file.path}
            >
              <i className={`fa-solid ${getFileIcon(file.name)}`}></i>

              <span className="teacher-homework-attachment-name">
                {file.name}
                <small>{formatFileSize(file.size)}</small>
              </span>

              {openingFile === file.path ? (
                <i className="fa-solid fa-spinner fa-spin"></i>
              ) : (
                <i className="fa-solid fa-download"></i>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="teacher-homework-loading">
        <i className="fa-solid fa-spinner fa-spin"></i>
        <p>Homework yuklanmoqda...</p>
      </div>
    );
  }

  return (
    <div className="teacher-homework">
      <div className="teacher-homework-heading">
        <div>
          <h1>Homework Management</h1>
          <p>Create assignments, attach files and track student submissions.</p>
        </div>

        <div className="teacher-homework-count">
          <i className="fa-solid fa-book-open"></i>
          <span>{homework.length} Assignments</span>
        </div>
      </div>

      {error && (
        <div className="teacher-homework-alert error">
          <i className="fa-solid fa-circle-exclamation"></i>
          {error}
        </div>
      )}

      {success && (
        <div className="teacher-homework-alert success">
          <i className="fa-solid fa-circle-check"></i>
          {success}
        </div>
      )}

      <div className="teacher-homework-layout">
        <section className="teacher-homework-form-card">
          <div className="teacher-homework-card-title">
            <i className="fa-solid fa-plus-circle"></i>
            <h2>Create New Homework</h2>
          </div>

          <form onSubmit={createHomework}>
            <label>Homework Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="For example: Speaking Part 2"
              required
            />

            <label>Description / Instructions</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write homework instructions..."
              rows="5"
            />

            <label>Assign to Group</label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              required
            >
              <option value="">Select a group</option>
              {GROUPS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <label>Deadline</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />

            <div className="teacher-homework-upload-area">
              <div className="teacher-homework-upload-heading">
                <i className="fa-solid fa-cloud-arrow-up"></i>
                <div>
                  <h3>Attach Files</h3>
                  <p>PDF, Word, Excel, audio, video and images</p>
                </div>
              </div>

              <input
                ref={fileInputRef}
                className="teacher-homework-hidden-input"
                type="file"
                multiple
                accept={ACCEPTED_FILES}
                onChange={handleFileChange}
              />

              <button
                type="button"
                className="teacher-homework-choose-files"
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= MAX_FILES}
              >
                <i className="fa-solid fa-folder-open"></i>
                Choose Files
              </button>

              <p className="teacher-homework-upload-note">
                Maximum {MAX_FILES} files · 50 MB per file
              </p>

              {files.length > 0 && (
                <div className="teacher-homework-selected-files">
                  {files.map((file, index) => (
                    <div
                      className="teacher-homework-selected-file"
                      key={`${file.name}-${file.lastModified}-${index}`}
                    >
                      <i className={`fa-solid ${getFileIcon(file.name)}`}></i>

                      <div>
                        <strong>{file.name}</strong>
                        <small>{formatFileSize(file.size)}</small>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        aria-label="Remove file"
                      >
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  Creating and uploading...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane"></i>
                  Publish Homework
                </>
              )}
            </button>
          </form>
        </section>

        <section className="teacher-homework-list-card">
          <div className="teacher-homework-card-title">
            <i className="fa-solid fa-list-check"></i>
            <h2>Created Homework</h2>
          </div>

          {homework.length === 0 ? (
            <div className="teacher-homework-empty">
              <i className="fa-regular fa-folder-open"></i>
              <h3>No homework yet</h3>
              <p>Create your first assignment using the form.</p>
            </div>
          ) : (
            <div className="teacher-homework-items">
              {homework.map((item) => {
                const responses = getHomeworkSubmissions(item.id);

                const submitted = new Set(
                  responses.map((response) => response.student_id)
                ).size;

                const total = students.filter(
                  (student) =>
                    student.student_group === item.student_group
                ).length;

                const attachmentCount = Array.isArray(item.attachments)
                  ? item.attachments.length
                  : 0;

                return (
                  <div
                    className={`teacher-homework-item ${
                      selectedHomework?.id === item.id ? "active" : ""
                    }`}
                    key={item.id}
                  >
                    <div className="teacher-homework-item-top">
                      <span className="teacher-homework-group">
                        {item.student_group}
                      </span>

                      <button
                        className="teacher-homework-delete"
                        type="button"
                        onClick={() => deleteHomework(item.id)}
                        title="Delete homework"
                      >
                        <i className="fa-regular fa-trash-can"></i>
                      </button>
                    </div>

                    <h3>{item.title}</h3>

                    <p>
                      {item.description || "No description provided."}
                    </p>

                    {attachmentCount > 0 && (
                      <div className="teacher-homework-file-count">
                        <i className="fa-solid fa-paperclip"></i>
                        {attachmentCount} attached file(s)
                      </div>
                    )}

                    <div className="teacher-homework-meta">
                      <span>
                        <i className="fa-regular fa-clock"></i>
                        {formatDate(item.due_at)}
                      </span>

                      <span>
                        <i className="fa-solid fa-users"></i>
                        {submitted}/{total} submitted
                      </span>
                    </div>

                    <button
                      type="button"
                      className="teacher-homework-view"
                      onClick={() =>
                        setSelectedHomework(
                          selectedHomework?.id === item.id ? null : item
                        )
                      }
                    >
                      {selectedHomework?.id === item.id
                        ? "Close Details"
                        : "View Submissions"}
                      <i className="fa-solid fa-arrow-right"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedHomework && (
        <section className="teacher-homework-details">
          <div className="teacher-homework-card-title">
            <i className="fa-solid fa-users"></i>
            <h2>{selectedHomework.title} — Student Progress</h2>
          </div>

          {renderAttachments(selectedHomework.attachments)}

          {(() => {
            const groupStudents = students.filter(
              (student) =>
                student.student_group === selectedHomework.student_group
            );

            const homeworkResponses = getHomeworkSubmissions(
              selectedHomework.id
            );

            const submittedStudents = new Set(
              homeworkResponses.map((response) => response.student_id)
            );

            return (
              <>
                <div className="teacher-homework-progress">
                  <div>
                    <strong>{submittedStudents.size}</strong>
                    <span>Submitted</span>
                  </div>

                  <div>
                    <strong>
                      {Math.max(
                        0,
                        groupStudents.length - submittedStudents.size
                      )}
                    </strong>
                    <span>Not submitted</span>
                  </div>

                  <div>
                    <strong>{groupStudents.length}</strong>
                    <span>Total students</span>
                  </div>
                </div>

                <div className="teacher-homework-student-list">
                  {groupStudents.map((student) => {
                    const response = homeworkResponses.find(
                      (item) => item.student_id === student.id
                    );

                    return (
                      <div
                        className="teacher-homework-student"
                        key={student.id}
                      >
                        <div className="teacher-homework-student-info">
                          <div className="teacher-homework-avatar">
                            {student.full_name?.charAt(0)?.toUpperCase() ||
                              "S"}
                          </div>

                          <div>
                            <h3>{student.full_name}</h3>
                            <p>
                              {response
                                ? `Submitted: ${formatDate(response.submitted_at)}`
                                : "Homework not submitted"}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`teacher-homework-status ${
                            response ? "submitted" : "missing"
                          }`}
                        >
                          {response ? "Submitted" : "Not submitted"}
                        </span>

                        {response && (
                          <div className="teacher-homework-response">
                            <strong>Student's answer</strong>
                            <p>
                              {response.submission_text ||
                                "No written response."}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {groupStudents.length === 0 && (
                    <div className="teacher-homework-empty">
                      <i className="fa-solid fa-users"></i>
                      <h3>No students in this group</h3>
                      <p>
                        Students assigned to this group will appear here.
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </section>
      )}
    </div>
  );
}