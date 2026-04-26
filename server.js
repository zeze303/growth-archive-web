const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const DIMENSIONS = ["aesthetic", "finance", "psychology", "behavior"];

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

const defaultDb = {
  users: getDefaultAdmins(),

  sessions: [],
  auditLogs: [],
  students: [

    {
      id: "stu-001",
      name: "李小雨",
      gender: "女",
      age: 10,
      school: "星光小学",
      gradeClass: "四年级1班",
      guardian: "奶奶",
      phone: "13800138001",
      address: "河北省廊坊市安次区星光村1号",
      publicNote: "开朗，喜欢画画和手工。",
      note: "开朗，喜欢画画和手工。",
      createdAt: new Date().toISOString(),
      createdBy: "admin-1",
      updatedAt: new Date().toISOString(),
      updatedBy: "admin-1"
    },
    {
      id: "stu-002",
      name: "王子轩",
      gender: "男",
      age: 11,
      school: "星光小学",
      gradeClass: "五年级2班",
      guardian: "爷爷",
      phone: "13800138002",
      address: "河北省廊坊市安次区星光村2号",
      publicNote: "动手能力强，责任感较好。",
      note: "动手能力强，责任感较好。",
      createdAt: new Date().toISOString(),
      createdBy: "admin-1",
      updatedAt: new Date().toISOString(),
      updatedBy: "admin-1"
    }

  ],
  records: [
    {
      id: "rec-001",
      studentId: "stu-001",
      period: "2026春季学期期中",
      scores: {
        aesthetic: 4,
        finance: 3,
        psychology: 4,
        behavior: 5
      },
      comments: {
        aesthetic: "积极参加绘画活动，作品完成度高。",
        finance: "能理解简单消费与储蓄概念。",
        psychology: "情绪整体稳定，愿意表达想法。",
        behavior: "日常习惯较好，集体参与积极。",
        overall: "整体状态良好，行为维度表现突出。"
      },
      totalScore: 16,
      level: "优秀",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "admin-1"
    },
    {
      id: "rec-002",
      studentId: "stu-002",
      period: "2026春季学期期中",
      scores: {
        aesthetic: 3,
        finance: 4,
        psychology: 3,
        behavior: 4
      },
      comments: {
        aesthetic: "能按要求完成活动任务。",
        finance: "理性消费意识较强。",
        psychology: "面对新环境时略显拘谨。",
        behavior: "遵守规则，愿意帮助同学。",
        overall: "整体稳定，后续可加强心理维度关注。"
      },
      totalScore: 14,
      level: "良好",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: "reviewer-1"
    }
  ]
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultDb, null, 2), "utf-8");
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}

function sortStudentsByName(students = []) {
  return [...students].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-Hans-CN"));
}


function writeDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf-8");
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

function generateId(prefix) {

  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
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
    studentId: body.studentId || existing.studentId,
    period: body.period || existing.period || "未命名周期",
    scores,
    comments: {
      aesthetic: body.comments?.aesthetic || existing.comments?.aesthetic || "",
      finance: body.comments?.finance || existing.comments?.finance || "",
      psychology: body.comments?.psychology || existing.comments?.psychology || "",
      behavior: body.comments?.behavior || existing.comments?.behavior || "",
      overall: body.comments?.overall || existing.comments?.overall || ""
    },
    totalScore,
    level: calcLevel(totalScore),
    updatedAt: new Date().toISOString()
  };
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function authRequired(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "未登录或登录已失效" });
  }
  const db = readDb();
  const session = db.sessions.find((item) => item.token === token);
  if (!session) {
    return res.status(401).json({ message: "登录状态无效，请重新登录" });
  }
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    return res.status(401).json({ message: "用户不存在" });
  }
  req.currentUser = safeUser(user);
  req.token = token;
  next();
}

function addAuditLog(db, payload) {
  db.auditLogs = db.auditLogs || [];
  db.auditLogs.unshift({
    id: generateId("log"),
    time: new Date().toISOString(),
    ...payload
  });
  db.auditLogs = db.auditLogs.slice(0, 3000);
}

function buildStudentView(student, role = "public") {
  const isAdmin = role === "admin";
  return {
    ...student,
    guardian: isAdmin ? student.guardian : student.guardian ? `${student.guardian}` : "",
    phone: isAdmin ? (student.phone || "") : maskPhone(student.phone || ""),
    address: isAdmin ? (student.address || "") : maskAddress(student.address || ""),
    note: isAdmin ? (student.note || "") : (student.publicNote || student.note || "")
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
  const scores = record.scores || {};
  Object.entries(scores).forEach(([key, value]) => {
    if (Number(value) <= 2) warnings.push(`${scoreLabelMap[key] || key}维度偏低`);
  });
  if (Number(record.totalScore || 0) <= 8) warnings.push("总分偏低");
  if (averageScore && Number(record.totalScore || 0) < averageScore - 2) warnings.push("低于群体平均水平");
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

app.use(express.json({ limit: "1mb" }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const db = readDb();
  const user = db.users.find((item) => item.username === username && item.password === password);
  if (!user) {
    return res.status(401).json({ message: "用户名或密码错误" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  db.sessions = db.sessions.filter((item) => item.userId !== user.id);
  db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  addAuditLog(db, { actorId: user.id, actorName: user.name, actorRole: user.role, action: "login", targetType: "session", targetId: user.id, detail: "管理员登录后台" });
  writeDb(db);
  res.json({ token, user: safeUser(user) });
});

app.get("/api/me", authRequired, (req, res) => {
  res.json({ user: req.currentUser });
});

app.post("/api/logout", authRequired, (req, res) => {
  const db = readDb();
  db.sessions = db.sessions.filter((item) => item.token !== req.token);
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "logout", targetType: "session", targetId: req.currentUser.id, detail: "管理员退出后台" });
  writeDb(db);
  res.json({ success: true });
});

app.get("/api/public/students", (req, res) => {
  const db = readDb();
  const students = sortStudentsByName(db.students).map((student) => {
    const records = db.records.filter((item) => item.studentId === student.id);
    const latestRecord = records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
    const groupAverage = records.length ? Number((db.records.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / Math.max(db.records.length, 1)).toFixed(1)) : 0;
    return {
      ...buildStudentView(student, "public"),
      recordCount: records.length,
      latestRecord: latestRecord ? {
        period: latestRecord.period,
        totalScore: latestRecord.totalScore,
        level: latestRecord.level,
        warningTags: buildWarningInfo(latestRecord, groupAverage)
      } : null,
      averageScore: records.length ? Number((records.reduce((sum, item) => sum + item.totalScore, 0) / records.length).toFixed(1)) : 0
    };
  });
  res.json({ students });
});

app.get("/api/students", authRequired, (req, res) => {
  const db = readDb();
  const globalAverage = db.records.length ? Number((db.records.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / db.records.length).toFixed(1)) : 0;
  const students = sortStudentsByName(db.students).map((student) => {
    const records = db.records.filter((item) => item.studentId === student.id);
    const latestRecord = records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
    const averageScore = records.length ? Number((records.reduce((sum, item) => sum + item.totalScore, 0) / records.length).toFixed(1)) : 0;
    return {
      ...buildStudentView(student, req.currentUser.role),
      recordCount: records.length,
      latestRecord: latestRecord ? { ...latestRecord, warningTags: buildWarningInfo(latestRecord, globalAverage) } : null,
      averageScore,
      globalAverage
    };
  });
  res.json({ students });
});

app.get("/api/public/students/:id", (req, res) => {
  const db = readDb();
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const records = db.records.filter((item) => item.studentId === student.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const schoolRecords = db.records.filter((item) => {
    const s = db.students.find((studentItem) => studentItem.id === item.studentId);
    return s && s.school === student.school;
  });
  const schoolAverage = schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / schoolRecords.length).toFixed(1)) : 0;
  const chart = records.map((record) => ({ period: record.period, totalScore: record.totalScore, level: record.level, warningTags: buildWarningInfo(record, schoolAverage), ...record.scores }));
  res.json({ student: buildStudentView(student, "public"), records: chart, chart, comparison: { schoolAverage } });
});

app.get("/api/students/:id", authRequired, (req, res) => {
  const db = readDb();
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const records = db.records.filter((item) => item.studentId === student.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const schoolRecords = db.records.filter((item) => {
    const s = db.students.find((studentItem) => studentItem.id === item.studentId);
    return s && s.school === student.school;
  });
  const classRecords = db.records.filter((item) => {
    const s = db.students.find((studentItem) => studentItem.id === item.studentId);
    return s && s.school === student.school && s.gradeClass === student.gradeClass;
  });
  const schoolAverage = schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / schoolRecords.length).toFixed(1)) : 0;
  const classAverage = classRecords.length ? Number((classRecords.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / classRecords.length).toFixed(1)) : 0;
  const chart = records.map((record) => ({ period: record.period, totalScore: record.totalScore, level: record.level, warningTags: buildWarningInfo(record, schoolAverage), ...record.scores }));
  res.json({ student: buildStudentView(student, req.currentUser.role), records: records.map((record) => ({ ...record, warningTags: buildWarningInfo(record, schoolAverage) })), chart, comparison: { schoolAverage, classAverage } });
});


app.post("/api/students", authRequired, (req, res) => {
  const { name, gender, age, school, gradeClass, guardian, note, phone, address, publicNote } = req.body || {};
  if (!name) {
    return res.status(400).json({ message: "学生姓名不能为空" });
  }
  const db = readDb();
  const duplicated = db.students.find((item) => item.name === name && (item.school || "") === (school || "") && (item.gradeClass || "") === (gradeClass || ""));
  if (duplicated) {
    return res.status(409).json({ message: "已存在同名且学校班级相同的学生档案，请先搜索确认" });
  }
  const student = {
    id: generateId("stu"),
    name,
    gender: gender || "",
    age: Number(age || 0),
    school: school || "",
    gradeClass: gradeClass || "",
    guardian: guardian || "",
    note: note || "",
    publicNote: publicNote || note || "",
    phone: phone || "",
    address: address || "",
    createdAt: new Date().toISOString(),
    createdBy: req.currentUser.id,
    updatedAt: new Date().toISOString(),
    updatedBy: req.currentUser.id
  };
  db.students.push(student);
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "create", targetType: "student", targetId: student.id, detail: `创建学生档案：${student.name}` });
  writeDb(db);
  res.status(201).json({ student: buildStudentView(student, req.currentUser.role) });
});

app.put("/api/students/:id", authRequired, (req, res) => {
  const db = readDb();
  const index = db.students.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const before = db.students[index];
  db.students[index] = {
    ...db.students[index],
    ...req.body,
    publicNote: req.body.publicNote || req.body.note || db.students[index].publicNote || "",
    age: Number(req.body.age || db.students[index].age || 0),
    updatedAt: new Date().toISOString(),
    updatedBy: req.currentUser.id
  };
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "update", targetType: "student", targetId: db.students[index].id, detail: `修改学生档案：${before.name}` });
  writeDb(db);
  res.json({ student: buildStudentView(db.students[index], req.currentUser.role) });
});

app.delete("/api/students/:id", authRequired, (req, res) => {
  const db = readDb();
  const index = db.students.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const student = db.students[index];
  const removedRecords = db.records.filter((item) => item.studentId === student.id);
  db.students.splice(index, 1);
  db.records = db.records.filter((item) => item.studentId !== student.id);
  addAuditLog(db, {
    actorId: req.currentUser.id,
    actorName: req.currentUser.name,
    actorRole: req.currentUser.role,
    action: "delete",
    targetType: "student",
    targetId: student.id,
    detail: `删除学生档案：${student.name}，并联动删除 ${removedRecords.length} 条成长记录`
  });
  writeDb(db);
  res.json({ success: true, removedRecordCount: removedRecords.length });
});

app.get("/api/audit-logs", authRequired, (req, res) => {

  const db = readDb();
  res.json({ logs: db.auditLogs || [] });
});

app.get("/api/export/students.csv", authRequired, (req, res) => {
  const db = readDb();
  const rows = sortStudentsByName(db.students).map((student) => {
    const records = db.records.filter((item) => item.studentId === student.id);
    const latestRecord = records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
    return {
      name: student.name || "",
      gender: student.gender || "",
      age: student.age || "",
      school: student.school || "",
      gradeClass: student.gradeClass || "",
      guardian: student.guardian || "",
      phone: student.phone || "",
      address: student.address || "",
      latestPeriod: latestRecord?.period || "",
      latestScore: latestRecord?.totalScore || "",
      latestLevel: latestRecord?.level || "",
      latestWarnings: (latestRecord?.warningTags || buildWarningInfo(latestRecord, 0)).join("；"),
      recordCount: records.length,
      publicNote: student.publicNote || "",
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
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "students", targetId: "all", detail: "导出学生档案汇总 CSV" });
  writeDb(db);
  sendCsv(res, "students-summary.csv", csv);
});

app.get("/api/export/records.csv", authRequired, (req, res) => {
  const db = readDb();
  const rows = db.records.map((record) => {
    const student = db.students.find((item) => item.id === record.studentId);
    return {
      studentName: student?.name || "",
      school: student?.school || "",
      gradeClass: student?.gradeClass || "",
      period: record.period || "",
      aesthetic: record.scores?.aesthetic || "",
      finance: record.scores?.finance || "",
      psychology: record.scores?.psychology || "",
      behavior: record.scores?.behavior || "",
      totalScore: record.totalScore || "",
      level: record.level || "",
      warnings: buildWarningInfo(record, 0).join("；"),
      overall: record.comments?.overall || "",
      updatedAt: record.updatedAt || ""
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
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "records", targetId: "all", detail: "导出成长记录汇总 CSV" });
  writeDb(db);
  sendCsv(res, "growth-records.csv", csv);
});

app.get("/api/export/students/:id.csv", authRequired, (req, res) => {
  const db = readDb();
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const records = db.records.filter((item) => item.studentId === student.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const rows = records.map((record) => ({
    period: record.period || "",
    aesthetic: record.scores?.aesthetic || "",
    finance: record.scores?.finance || "",
    psychology: record.scores?.psychology || "",
    behavior: record.scores?.behavior || "",
    totalScore: record.totalScore || "",
    level: record.level || "",
    warnings: buildWarningInfo(record, 0).join("；"),
    overall: record.comments?.overall || "",
    updatedAt: record.updatedAt || ""
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
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "student-records", targetId: student.id, detail: `导出单个学生 CSV：${student.name}` });
  writeDb(db);
  sendCsv(res, `${student.name}-records.csv`, csv);
});

app.post("/api/export/students/:id/pdf", authRequired, (req, res) => {
  const { spawnSync } = require("child_process");
  const os = require("os");
  const db = readDb();
  const student = db.students.find((item) => item.id === req.params.id);
  if (!student) {
    return res.status(404).json({ message: "学生不存在" });
  }
  const records = db.records.filter((item) => item.studentId === student.id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const schoolRecords = db.records.filter((item) => {
    const s = db.students.find((studentItem) => studentItem.id === item.studentId);
    return s && s.school === student.school;
  });
  const classRecords = db.records.filter((item) => {
    const s = db.students.find((studentItem) => studentItem.id === item.studentId);
    return s && s.school === student.school && s.gradeClass === student.gradeClass;
  });
  const payload = {
    student,
    records: records.map((record) => ({ ...record, warningTags: buildWarningInfo(record, 0) })),
    comparison: {
      schoolAverage: schoolRecords.length ? Number((schoolRecords.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / schoolRecords.length).toFixed(1)) : 0,
      classAverage: classRecords.length ? Number((classRecords.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) / classRecords.length).toFixed(1)) : 0
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
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "export", targetType: "student-pdf", targetId: student.id, detail: `导出单个学生 PDF：${student.name}` });
  writeDb(db);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=${encodeURIComponent(`${student.name}-成长档案报告.pdf`)}`);
  res.send(fs.readFileSync(outputPath));
});



app.post("/api/records", authRequired, (req, res) => {


  const db = readDb();
  const student = db.students.find((item) => item.id === req.body.studentId);
  if (!student) {
    return res.status(400).json({ message: "请选择有效的学生档案" });
  }
  if (!req.body.period) {
    return res.status(400).json({ message: "请填写记录周期" });
  }

  const record = {
    id: generateId("rec"),
    ...computeRecordPayload(req.body),
    createdAt: new Date().toISOString(),
    createdBy: req.currentUser.id,
    updatedBy: req.currentUser.id
  };
  db.records.push(record);
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "create", targetType: "record", targetId: record.id, detail: `新增成长记录：${student.name} / ${record.period}` });
  writeDb(db);
  res.status(201).json({ record });
});

app.put("/api/records/:id", authRequired, (req, res) => {
  const db = readDb();
  const index = db.records.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: "成长记录不存在" });
  }
  const before = db.records[index];
  db.records[index] = { ...computeRecordPayload(req.body, db.records[index]), updatedBy: req.currentUser.id };
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "update", targetType: "record", targetId: before.id, detail: `修改成长记录：${before.period}` });
  writeDb(db);
  res.json({ record: db.records[index] });
});

app.get("/api/records/:id", authRequired, (req, res) => {
  const db = readDb();
  const record = db.records.find((item) => item.id === req.params.id);
  if (!record) {
    return res.status(404).json({ message: "成长记录不存在" });
  }
  res.json({ record });
});

app.delete("/api/records/:id", authRequired, (req, res) => {
  const db = readDb();
  const index = db.records.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ message: "成长记录不存在" });
  }
  const removed = db.records[index];
  db.records.splice(index, 1);
  addAuditLog(db, { actorId: req.currentUser.id, actorName: req.currentUser.name, actorRole: req.currentUser.role, action: "delete", targetType: "record", targetId: removed.id, detail: `删除成长记录：${removed.period}` });
  writeDb(db);
  res.json({ success: true });
});


app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureDb();
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
