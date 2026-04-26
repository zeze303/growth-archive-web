const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const { spawnSync } = require("child_process");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;
const DIMENSIONS = ["aesthetic", "finance", "psychology", "behavior"];

const TABLES = {
  users: "growth_admin_users",
  sessions: "growth_sessions",
  students: "growth_students",
  records: "growth_records",
  logs: "growth_audit_logs"
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);
const supabase = hasSupabase ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } }) : null;

function getDefaultAdmins() {
  const rawAccounts = process.env.ADMIN_ACCOUNTS;
  if (rawAccounts) {
    try {
      const parsed = JSON.parse(rawAccounts);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((item, index) => ({
          id: item.id || `admin-${index + 1}`,
          username: item.username,
          password: item.password,
          role: "admin",
          name: item.name || `管理员${index + 1}`
        })).filter((item) => item.username && item.password);
      }
    } catch (error) {
      console.error("ADMIN_ACCOUNTS 解析失败，将回退到单管理员配置");
    }
  }
  return [{
    id: "admin-1",
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "admin123",
    role: "admin",
    name: process.env.ADMIN_NAME || "管理员"
  }];
}

function buildLocalFallbackDb() {
  return {
    users: getDefaultAdmins(),
    sessions: [],
    auditLogs: [],
    students: [],
    records: []
  };
}

function generateId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name
  };
}

function maskPhone(phone = "") {
  if (!phone) return "";
  const text = String(phone);
  if (text.length < 7) return text;
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

function maskAddress(address = "") {
  if (!address) return "";
  const text = String(address).trim();
  if (text.length <= 6) return text;
  return `${text.slice(0, 6)}***`;
}

function calcLevel(totalScore) {
  if (totalScore >= 18) return "卓越";
  if (totalScore >= 14) return "优秀";
  if (totalScore >= 10) return "良好";
  if (totalScore >= 6) return "达标";
  return "关注";
}

function normalizeScores(scores = {}) {
  const normalized = {};
  DIMENSIONS.forEach((key) => {
    const value = Number(scores[key] || 0);
    normalized[key] = Math.min(5, Math.max(1, value || 1));
  });
  return normalized;
}

function computeRecordPayload(body, existing = {}) {
  const scores = normalizeScores(body.scores || existing.scores || {});
  const totalScore = DIMENSIONS.reduce((sum, key) => sum + Number(scores[key] || 0), 0);
  return {
    ...existing,
    student_id: body.studentId || existing.student_id || existing.studentId,
    period: body.period || existing.period || "未命名周期",
    aesthetic: scores.aesthetic,
    finance: scores.finance,
    psychology: scores.psychology,
    behavior: scores.behavior,
    total_score: totalScore,
    level: calcLevel(totalScore),
    comment_aesthetic: body.comments?.aesthetic || existing.comment_aesthetic || existing.comments?.aesthetic || "",
    comment_finance: body.comments?.finance || existing.comment_finance || existing.comments?.finance || "",
    comment_psychology: body.comments?.psychology || existing.comment_psychology || existing.comments?.psychology || "",
    comment_behavior: body.comments?.behavior || existing.comment_behavior || existing.comments?.behavior || "",
    comment_overall: body.comments?.overall || existing.comment_overall || existing.comments?.overall || "",
    updated_at: new Date().toISOString()
  };
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function buildStudentView(student, role = "public") {

  const isAdmin = role === "admin";
  return {
    id: student.id,
    name: student.name,
    gender: student.gender || "",
    age: student.age || 0,
    school: student.school || "",
    gradeClass: student.grade_class || student.gradeClass || "",
    guardian: isAdmin ? (student.guardian || "") : (student.guardian || ""),
    phone: isAdmin ? (student.phone || "") : maskPhone(student.phone || ""),
    address: isAdmin ? (student.address || "") : maskAddress(student.address || ""),
    publicNote: student.public_note || student.publicNote || "",
    note: isAdmin ? (student.note || "") : (student.public_note || student.publicNote || student.note || ""),
    createdAt: student.created_at || student.createdAt || "",
    createdBy: student.created_by || student.createdBy || "",
    updatedAt: student.updated_at || student.updatedAt || "",
    updatedBy: student.updated_by || student.updatedBy || ""
  };
}

function buildWarningInfo(record, averageScore = 0) {
  const warnings = [];
  if (!record) return warnings;
  const scoreLabelMap = {
    aesthetic: "美育",
    finance: "财商",
    psychology: "心理",
    behavior: "行为"
  };
  const scores = {
    aesthetic: record.aesthetic ?? record.scores?.aesthetic,
    finance: record.finance ?? record.scores?.finance,
    psychology: record.psychology ?? record.scores?.psychology,
    behavior: record.behavior ?? record.scores?.behavior
  };
  Object.entries(scores).forEach(([key, value]) => {
    if (Number(value) <= 2) warnings.push(`${scoreLabelMap[key] || key}维度偏低`);
  });
  const total = Number(record.total_score ?? record.totalScore ?? 0);
  if (total <= 8) warnings.push("总分偏低");
  if (averageScore && total < averageScore - 2) warnings.push("低于群体平均水平");
  return warnings;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(columns, rows) {
  const header = columns.map((item) => csvEscape(item.label)).join(",");
  const body = rows.map((row) => columns.map((item) => csvEscape(row[item.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

function sendCsv(res, filename, content) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(filename)}`);
  res.send(`\ufeff${content}`);
}

async function ensureSupabaseSeed() {
  if (!hasSupabase) return;
  const admins = getDefaultAdmins();
  for (const admin of admins) {
    const { data } = await supabase.from(TABLES.users).select("id").eq("username", admin.username).maybeSingle();
    if (!data) {
      await supabase.from(TABLES.users).insert(admin);
    }
  }
}

async function listUsers() {
  if (!hasSupabase) return buildLocalFallbackDb().users;
  const { data, error } = await supabase.from(TABLES.users).select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function findUserByUsernamePassword(username, password) {
  if (!hasSupabase) {
    return buildLocalFallbackDb().users.find((item) => item.username === username && item.password === password) || null;
  }
  const { data, error } = await supabase.from(TABLES.users).select("*").eq("username", username).eq("password", password).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertSession(session) {
  if (!hasSupabase) return session;
  const { error } = await supabase.from(TABLES.sessions).upsert(session);
  if (error) throw error;
  return session;
}

async function removeSessionByUserId(userId) {
  if (!hasSupabase) return;
  const { error } = await supabase.from(TABLES.sessions).delete().eq("user_id", userId);
  if (error) throw error;
}

async function removeSessionByToken(token) {
  if (!hasSupabase) return;
  const { error } = await supabase.from(TABLES.sessions).delete().eq("token", token);
  if (error) throw error;
}

async function findSessionByToken(token) {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.from(TABLES.sessions).select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertAuditLog(payload) {
  if (!hasSupabase) return;
  const log = {
    id: generateId("log"),
    time: new Date().toISOString(),
    actor_id: payload.actorId || null,
    actor_name: payload.actorName || null,
    actor_role: payload.actorRole || null,
    action: payload.action || null,
    target_type: payload.targetType || null,
    target_id: payload.targetId || null,
    detail: payload.detail || null
  };
  const { error } = await supabase.from(TABLES.logs).insert(log);
  if (error) throw error;
}


async function listAuditLogs() {
  if (!hasSupabase) return [];
  const { data, error } = await supabase.from(TABLES.logs).select("*").order("time", { ascending: false }).limit(3000);
  if (error) throw error;
  return (data || []).map((item) => ({
    ...item,
    actorName: item.actor_name,
    actorRole: item.actor_role,
    targetType: item.target_type,
    targetId: item.target_id
  }));
}


async function listStudents() {
  if (!hasSupabase) return [];
  const { data, error } = await supabase.from(TABLES.students).select("*").order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function findStudentById(id) {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.from(TABLES.students).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertStudent(student) {
  if (!hasSupabase) return student;
  const { data, error } = await supabase.from(TABLES.students).insert(student).select().single();
  if (error) throw error;
  return data;
}

async function updateStudent(id, payload) {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.from(TABLES.students).update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function deleteStudent(id) {
  if (!hasSupabase) return { removedRecordCount: 0 };
  const student = await findStudentById(id);
  const records = await listRecordsByStudentId(id);
  const { error } = await supabase.from(TABLES.students).delete().eq("id", id);
  if (error) throw error;
  return { student, removedRecordCount: records.length };
}

async function listRecords() {
  if (!hasSupabase) return [];
  const { data, error } = await supabase.from(TABLES.records).select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function listRecordsByStudentId(studentId) {
  if (!hasSupabase) return [];
  const { data, error } = await supabase.from(TABLES.records).select("*").eq("student_id", studentId).order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function findRecordById(id) {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.from(TABLES.records).select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertRecord(record) {
  if (!hasSupabase) return record;
  const { data, error } = await supabase.from(TABLES.records).insert(record).select().single();
  if (error) throw error;
  return data;
}

async function updateRecord(id, payload) {
  if (!hasSupabase) return null;
  const { data, error } = await supabase.from(TABLES.records).update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function deleteRecord(id) {
  if (!hasSupabase) return null;
  const record = await findRecordById(id);
  const { error } = await supabase.from(TABLES.records).delete().eq("id", id);
  if (error) throw error;
  return record;
}

function mapRecordToClient(record, averageScore = 0) {
  return {
    id: record.id,
    studentId: record.student_id,
    period: record.period,
    scores: {
      aesthetic: record.aesthetic,
      finance: record.finance,
      psychology: record.psychology,
      behavior: record.behavior
    },
    comments: {
      aesthetic: record.comment_aesthetic || "",
      finance: record.comment_finance || "",
      psychology: record.comment_psychology || "",
      behavior: record.comment_behavior || "",
      overall: record.comment_overall || ""
    },
    totalScore: record.total_score,
    level: record.level,
    createdAt: record.created_at,
    createdBy: record.created_by,
    updatedAt: record.updated_at,
    updatedBy: record.updated_by,
    warningTags: buildWarningInfo(record, averageScore)
  };
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), storage: hasSupabase ? "supabase" : "local-json" });
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await findUserByUsernamePassword(username, password);
    if (!user) return res.status(401).json({ message: "用户名或密码错误" });
    const token = crypto.randomBytes(24).toString("hex");
    await removeSessionByUserId(user.id);
    await insertSession({ token, user_id: user.id, created_at: new Date().toISOString() });
    await insertAuditLog({ actorId: user.id, actorName: user.name, actorRole: user.role, action: "login", targetType: "session", targetId: user.id, detail: "管理员登录后台" });
    res.json({ token, user: safeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message || "登录失败" });
  }
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ user: req.currentUser });
});

app.post("/api/logout", authRequired, async (req, res) => {
  try {
    await removeSessionByToken(req.token);
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "logout", targetType: "session", targetId: req.currentUser.id, detail: "管理员退出后台" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message || "退出失败" });
  }
});

async function authRequired(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: "未登录或登录已失效" });
    const session = await findSessionByToken(token);
    if (!session) return res.status(401).json({ message: "登录状态无效，请重新登录" });
    const users = await listUsers();
    const user = users.find((item) => item.id === session.user_id);
    if (!user) return res.status(401).json({ message: "用户不存在" });
    req.currentUser = safeUser(user);
    req.token = token;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message || "鉴权失败" });
  }
}

app.get("/api/public/students", async (req, res) => {
  try {
    const students = await listStudents();
    const records = await listRecords();
    const result = students.map((student) => {
      const studentRecords = records.filter((item) => item.student_id === student.id);
      const latest = studentRecords.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0] || null;
      const averageScore = studentRecords.length ? Number((studentRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / studentRecords.length).toFixed(1)) : 0;
      const globalAverage = records.length ? Number((records.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / records.length).toFixed(1)) : 0;
      return {
        ...buildStudentView(student, "public"),
        recordCount: studentRecords.length,
        latestRecord: latest ? { period: latest.period, totalScore: latest.total_score, level: latest.level, warningTags: buildWarningInfo(latest, globalAverage) } : null,
        averageScore
      };
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN"));
    res.json({ students: result });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取公开档案失败" });
  }
});

app.get("/api/public/students/:id", async (req, res) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) return res.status(404).json({ message: "学生不存在" });
    const records = await listRecordsByStudentId(student.id);
    const allRecords = await listRecords();
    const allStudents = await listStudents();
    const schoolRecords = allRecords.filter((item) => {
      const s = allStudents.find((studentItem) => studentItem.id === item.student_id);
      return s && s.school === student.school;
    });
    const schoolAverage = schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / schoolRecords.length).toFixed(1)) : 0;
    const mappedRecords = records.map((record) => mapRecordToClient(record, schoolAverage));
    const chart = mappedRecords.map((record) => ({ period: record.period, totalScore: record.totalScore, level: record.level, warningTags: record.warningTags, aesthetic: record.scores.aesthetic, finance: record.scores.finance, psychology: record.scores.psychology, behavior: record.scores.behavior }));
    res.json({ student: buildStudentView(student, "public"), records: chart, chart, comparison: { schoolAverage } });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取公开详情失败" });
  }
});

app.get("/api/students", authRequired, async (req, res) => {
  try {
    const students = await listStudents();
    const records = await listRecords();
    const globalAverage = records.length ? Number((records.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / records.length).toFixed(1)) : 0;
    const result = students.map((student) => {
      const studentRecords = records.filter((item) => item.student_id === student.id);
      const latest = studentRecords.slice().sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0] || null;
      const averageScore = studentRecords.length ? Number((studentRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / studentRecords.length).toFixed(1)) : 0;
      return {
        ...buildStudentView(student, req.currentUser.role),
        recordCount: studentRecords.length,
        latestRecord: latest ? { ...mapRecordToClient(latest, globalAverage) } : null,
        averageScore,
        globalAverage
      };
    }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN"));
    res.json({ students: result });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取学生档案失败" });
  }
});

app.get("/api/students/:id", authRequired, async (req, res) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) return res.status(404).json({ message: "学生不存在" });
    const records = await listRecordsByStudentId(student.id);
    const allRecords = await listRecords();
    const allStudents = await listStudents();
    const schoolRecords = allRecords.filter((item) => {
      const s = allStudents.find((studentItem) => studentItem.id === item.student_id);
      return s && s.school === student.school;
    });
    const classRecords = allRecords.filter((item) => {
      const s = allStudents.find((studentItem) => studentItem.id === item.student_id);
      return s && s.school === student.school && s.grade_class === student.grade_class;
    });
    const schoolAverage = schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / schoolRecords.length).toFixed(1)) : 0;
    const classAverage = classRecords.length ? Number((classRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / classRecords.length).toFixed(1)) : 0;
    const mappedRecords = records.map((record) => mapRecordToClient(record, schoolAverage));
    const chart = mappedRecords.map((record) => ({ period: record.period, totalScore: record.totalScore, level: record.level, warningTags: record.warningTags, aesthetic: record.scores.aesthetic, finance: record.scores.finance, psychology: record.scores.psychology, behavior: record.scores.behavior }));
    res.json({ student: buildStudentView(student, req.currentUser.role), records: mappedRecords, chart, comparison: { schoolAverage, classAverage } });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取学生详情失败" });
  }
});

app.post("/api/students", authRequired, async (req, res) => {
  try {
    const { name, gender, age, school, gradeClass, guardian, note, phone, address, publicNote } = req.body || {};
    if (!name) return res.status(400).json({ message: "学生姓名不能为空" });
    const students = await listStudents();
    const duplicated = students.find((item) => item.name === name && (item.school || "") === (school || "") && (item.grade_class || item.gradeClass || "") === (gradeClass || ""));
    if (duplicated) return res.status(409).json({ message: "已存在同名且学校班级相同的学生档案，请先搜索确认" });
    const student = await insertStudent({
      id: generateId("stu"),
      name,
      gender: gender || "",
      age: Number(age || 0),
      school: school || "",
      grade_class: gradeClass || "",
      guardian: guardian || "",
      note: note || "",
      public_note: publicNote || note || "",
      phone: phone || "",
      address: address || "",
      created_at: new Date().toISOString(),
      created_by: req.currentUser.id,
      updated_at: new Date().toISOString(),
      updated_by: req.currentUser.id
    });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "create", targetType: "student", targetId: student.id, detail: `创建学生档案：${student.name}` });
    res.status(201).json({ student: buildStudentView(student, req.currentUser.role) });
  } catch (error) {
    res.status(500).json({ message: error.message || "创建学生失败" });
  }
});

app.put("/api/students/:id", authRequired, async (req, res) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) return res.status(404).json({ message: "学生不存在" });
    const updated = await updateStudent(req.params.id, {
      ...req.body,
      grade_class: req.body.gradeClass ?? student.grade_class,
      public_note: req.body.publicNote || req.body.note || student.public_note || "",
      age: Number(req.body.age || student.age || 0),
      updated_at: new Date().toISOString(),
      updated_by: req.currentUser.id
    });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "update", targetType: "student", targetId: updated.id, detail: `修改学生档案：${student.name}` });
    res.json({ student: buildStudentView(updated, req.currentUser.role) });
  } catch (error) {
    res.status(500).json({ message: error.message || "更新学生失败" });
  }
});

app.delete("/api/students/:id", authRequired, async (req, res) => {
  try {
    const result = await deleteStudent(req.params.id);
    if (!result.student) return res.status(404).json({ message: "学生不存在" });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "delete", targetType: "student", targetId: result.student.id, detail: `删除学生档案：${result.student.name}，并联动删除 ${result.removedRecordCount} 条成长记录` });
    res.json({ success: true, removedRecordCount: result.removedRecordCount });
  } catch (error) {
    res.status(500).json({ message: error.message || "删除学生失败" });
  }
});

app.get("/api/audit-logs", authRequired, async (req, res) => {
  try {
    const logs = await listAuditLogs();
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取日志失败" });
  }
});

app.get("/api/export/students.csv", authRequired, async (req, res) => {
  try {
    const students = await listStudents();
    const records = await listRecords();
    const rows = students.map((student) => {
      const studentRecords = records.filter((item) => item.student_id === student.id);
      const latestRecord = studentRecords.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0] || null;
      return {
        name: student.name || "",
        gender: student.gender || "",
        age: student.age || "",
        school: student.school || "",
        gradeClass: student.grade_class || "",
        guardian: student.guardian || "",
        phone: student.phone || "",
        address: student.address || "",
        latestPeriod: latestRecord?.period || "",
        latestScore: latestRecord?.total_score || "",
        latestLevel: latestRecord?.level || "",
        latestWarnings: (latestRecord ? buildWarningInfo(latestRecord, 0) : []).join("；"),
        recordCount: studentRecords.length,
        publicNote: student.public_note || "",
        note: student.note || ""
      };
    });
    const csv = toCsv([
      { key: "name", label: "学生姓名" },
      { key: "gender", label: "性别" },
      { key: "age", label: "年龄" },
      { key: "school", label: "学校" },
      { key: "gradeClass", label: "班级" },
      { key: "guardian", label: "监护人" },
      { key: "phone", label: "联系电话" },
      { key: "address", label: "联系地址" },
      { key: "latestPeriod", label: "最新周期" },
      { key: "latestScore", label: "最新总分" },
      { key: "latestLevel", label: "最新等级" },
      { key: "latestWarnings", label: "预警标签" },
      { key: "recordCount", label: "记录条数" },
      { key: "publicNote", label: "公开备注" },
      { key: "note", label: "内部备注" }
    ], rows);
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "students", targetId: "all", detail: "导出学生档案汇总 CSV" });
    sendCsv(res, "students-summary.csv", csv);
  } catch (error) {
    res.status(500).json({ message: error.message || "导出学生汇总失败" });
  }
});

app.get("/api/export/records.csv", authRequired, async (req, res) => {
  try {
    const records = await listRecords();
    const students = await listStudents();
    const rows = records.map((record) => {
      const student = students.find((item) => item.id === record.student_id);
      return {
        studentName: student?.name || "",
        school: student?.school || "",
        gradeClass: student?.grade_class || "",
        period: record.period || "",
        aesthetic: record.aesthetic || "",
        finance: record.finance || "",
        psychology: record.psychology || "",
        behavior: record.behavior || "",
        totalScore: record.total_score || "",
        level: record.level || "",
        warnings: buildWarningInfo(record, 0).join("；"),
        overall: record.comment_overall || "",
        updatedAt: record.updated_at || ""
      };
    });
    const csv = toCsv([
      { key: "studentName", label: "学生姓名" },
      { key: "school", label: "学校" },
      { key: "gradeClass", label: "班级" },
      { key: "period", label: "记录周期" },
      { key: "aesthetic", label: "美育分数" },
      { key: "finance", label: "财商分数" },
      { key: "psychology", label: "心理分数" },
      { key: "behavior", label: "行为分数" },
      { key: "totalScore", label: "总分" },
      { key: "level", label: "等级" },
      { key: "warnings", label: "预警标签" },
      { key: "overall", label: "综合评语" },
      { key: "updatedAt", label: "更新时间" }
    ], rows);
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "records", targetId: "all", detail: "导出成长记录汇总 CSV" });
    sendCsv(res, "growth-records.csv", csv);
  } catch (error) {
    res.status(500).json({ message: error.message || "导出成长记录失败" });
  }
});

app.get("/api/export/students/:id.csv", authRequired, async (req, res) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) return res.status(404).json({ message: "学生不存在" });
    const records = await listRecordsByStudentId(student.id);
    const rows = records.map((record) => ({
      period: record.period || "",
      aesthetic: record.aesthetic || "",
      finance: record.finance || "",
      psychology: record.psychology || "",
      behavior: record.behavior || "",
      totalScore: record.total_score || "",
      level: record.level || "",
      warnings: buildWarningInfo(record, 0).join("；"),
      overall: record.comment_overall || "",
      updatedAt: record.updated_at || ""
    }));
    const csv = toCsv([
      { key: "period", label: "记录周期" },
      { key: "aesthetic", label: "美育分数" },
      { key: "finance", label: "财商分数" },
      { key: "psychology", label: "心理分数" },
      { key: "behavior", label: "行为分数" },
      { key: "totalScore", label: "总分" },
      { key: "level", label: "等级" },
      { key: "warnings", label: "预警标签" },
      { key: "overall", label: "综合评语" },
      { key: "updatedAt", label: "更新时间" }
    ], rows);
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "student-records", targetId: student.id, detail: `导出单个学生 CSV：${student.name}` });
    sendCsv(res, `${student.name}-records.csv`, csv);
  } catch (error) {
    res.status(500).json({ message: error.message || "导出单个学生 CSV 失败" });
  }
});

app.post("/api/export/students/:id/pdf", authRequired, async (req, res) => {
  try {
    const student = await findStudentById(req.params.id);
    if (!student) return res.status(404).json({ message: "学生不存在" });
    const records = await listRecordsByStudentId(student.id);
    const allRecords = await listRecords();
    const allStudents = await listStudents();
    const schoolRecords = allRecords.filter((item) => {
      const s = allStudents.find((studentItem) => studentItem.id === item.student_id);
      return s && s.school === student.school;
    });
    const classRecords = allRecords.filter((item) => {
      const s = allStudents.find((studentItem) => studentItem.id === item.student_id);
      return s && s.school === student.school && s.grade_class === student.grade_class;
    });
    const payload = {
      student: buildStudentView(student, "admin"),
      records: records.map((record) => mapRecordToClient(record, 0)),
      comparison: {
        schoolAverage: schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / schoolRecords.length).toFixed(1)) : 0,
        classAverage: classRecords.length ? Number((classRecords.reduce((sum, item) => sum + Number(item.total_score || 0), 0) / classRecords.length).toFixed(1)) : 0
      }
    };
    const tempDir = path.join(os.tmpdir(), "nla-student-pdf");
    fs.mkdirSync(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, `${student.id}.json`);
    const outputPath = path.join(tempDir, `${student.id}.pdf`);
    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), "utf-8");
    const result = spawnSync("python", [path.join(__dirname, "export_student_pdf.py"), inputPath, outputPath], { encoding: "utf-8" });
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      return res.status(500).json({ message: `PDF 生成失败：${(result.stderr || result.stdout || "未知错误").trim()}` });
    }
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "student-pdf", targetId: student.id, detail: `导出单个学生 PDF：${student.name}` });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(`${student.name}-成长档案报告.pdf`)}`);
    res.send(fs.readFileSync(outputPath));
  } catch (error) {
    res.status(500).json({ message: error.message || "导出单个学生 PDF 失败" });
  }
});

app.post("/api/records", authRequired, async (req, res) => {
  try {
    const student = await findStudentById(req.body.studentId);
    if (!student) return res.status(400).json({ message: "请选择有效的学生档案" });
    if (!req.body.period) return res.status(400).json({ message: "请填写记录周期" });
    const record = await insertRecord({
      id: generateId("rec"),
      ...computeRecordPayload(req.body),
      created_at: new Date().toISOString(),
      created_by: req.currentUser.id,
      updated_by: req.currentUser.id
    });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "create", targetType: "record", targetId: record.id, detail: `新增成长记录：${student.name} / ${record.period}` });
    res.status(201).json({ record: mapRecordToClient(record) });
  } catch (error) {
    res.status(500).json({ message: error.message || "创建成长记录失败" });
  }
});

app.put("/api/records/:id", authRequired, async (req, res) => {
  try {
    const before = await findRecordById(req.params.id);
    if (!before) return res.status(404).json({ message: "成长记录不存在" });
    const record = await updateRecord(req.params.id, { ...computeRecordPayload(req.body, before), updated_by: req.currentUser.id });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "update", targetType: "record", targetId: before.id, detail: `修改成长记录：${before.period}` });
    res.json({ record: mapRecordToClient(record) });
  } catch (error) {
    res.status(500).json({ message: error.message || "更新成长记录失败" });
  }
});

app.get("/api/records/:id", authRequired, async (req, res) => {
  try {
    const record = await findRecordById(req.params.id);
    if (!record) return res.status(404).json({ message: "成长记录不存在" });
    res.json({ record: mapRecordToClient(record) });
  } catch (error) {
    res.status(500).json({ message: error.message || "获取成长记录失败" });
  }
});

app.delete("/api/records/:id", authRequired, async (req, res) => {
  try {
    const record = await deleteRecord(req.params.id);
    if (!record) return res.status(404).json({ message: "成长记录不存在" });
    await insertAuditLog({ actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "delete", targetType: "record", targetId: record.id, detail: `删除成长记录：${record.period}` });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message || "删除成长记录失败" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureSupabaseSeed().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT} (${hasSupabase ? "supabase" : "local-json"})`);
  });
}).catch((error) => {
  console.error("Supabase 初始化失败：", error);
  process.exit(1);
});
