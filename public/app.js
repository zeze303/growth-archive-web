const state = {
  mode: "public",
  token: localStorage.getItem("growth-token") || "",
  user: JSON.parse(localStorage.getItem("growth-user") || "null"),
  students: [],
  studentDetails: null,
  view: "public-home",
  message: null,
  studentSearch: "",
  editingStudent: null,
  editingRecord: null,
  chart: null,
  inlineNewStudentOpen: false,
  selectedStudentId: "",
  auditLogs: []
};


const app = document.getElementById("app");
const dimensionMap = {
  aesthetic: "美育维度",
  finance: "财商维度",
  psychology: "心理维度",
  behavior: "行为维度"
};

function setMessage(type, text) {
  state.message = text ? { type, text } : null;
}

function persistAuth() {
  localStorage.setItem("growth-token", state.token || "");
  if (state.user) {
    localStorage.setItem("growth-user", JSON.stringify(state.user));
  } else {
    localStorage.removeItem("growth-user");
  }
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    let error = { message: "请求失败" };
    try {
      error = await response.json();
    } catch (e) {}

    if (response.status === 401) {
      state.token = "";
      state.user = null;
      persistAuth();
      setPublicMode();
    }

    throw new Error(error.message || "请求失败");
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

function levelBadge(level) {
  if (level === "卓越") return "primary";
  if (level === "优秀") return "success";
  if (level === "良好") return "warning";
  if (level === "达标") return "primary";
  return "danger";
}

function createAlert() {
  if (!state.message) return "";
  return `<div class="alert ${state.message.type}">${state.message.text}</div>`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function warningTags(tags = []) {
  if (!tags.length) return `<span class="badge success">状态稳定</span>`;
  return tags.map((tag) => `<span class="badge danger">${tag}</span>`).join("");
}

function safeMetricValue(record, key) {
  if (!record) return 0;
  if (record[key] !== undefined && record[key] !== null) return record[key];
  if (record.scores && record.scores[key] !== undefined && record.scores[key] !== null) return record.scores[key];
  return 0;
}

function normalizeRecord(record = {}) {
  return {
    ...record,
    scores: record.scores || {
      aesthetic: safeMetricValue(record, "aesthetic"),
      finance: safeMetricValue(record, "finance"),
      psychology: safeMetricValue(record, "psychology"),
      behavior: safeMetricValue(record, "behavior")
    },
    aesthetic: safeMetricValue(record, "aesthetic"),
    finance: safeMetricValue(record, "finance"),
    psychology: safeMetricValue(record, "psychology"),
    behavior: safeMetricValue(record, "behavior"),
    warningTags: record.warningTags || []
  };
}

function normalizeStudentDetailPayload(detail) {
  if (!detail) return null;
  const records = (detail.records || []).map(normalizeRecord);
  const chart = (detail.chart || detail.records || []).map(normalizeRecord);
  return {
    ...detail,
    records,
    chart
  };
}

function setPublicMode() {

  state.mode = "public";
  state.view = "public-home";
  state.studentDetails = null;
  state.editingStudent = null;
  state.editingRecord = null;
  state.inlineNewStudentOpen = false;
  state.selectedStudentId = "";
  state.auditLogs = [];
}


function setAdminMode() {
  state.mode = "admin";
  state.view = "dashboard";
}

async function syncAuditLogs() {
  if (state.mode !== "admin" || !state.token) return;
  try {
    const logsResult = await api("/api/audit-logs");
    state.auditLogs = logsResult.logs || [];
  } catch (error) {}
}

function resetEditingState() {

  state.studentDetails = null;
  state.editingStudent = null;
  state.editingRecord = null;
  state.inlineNewStudentOpen = false;
  state.selectedStudentId = "";
}


function filteredStudents() {
  const keyword = state.studentSearch.trim();
  if (!keyword) return state.students;
  return state.students.filter((student) => {
    return [student.name, student.school, student.gradeClass]
      .some((text) => (text || "").includes(keyword));
  });
}

function calcStats() {
  const totalStudents = state.students.length;
  const totalRecords = state.students.reduce((sum, item) => sum + (item.recordCount || 0), 0);
  const averageScore = totalStudents
    ? (state.students.reduce((sum, item) => sum + Number(item.averageScore || 0), 0) / totalStudents).toFixed(1)
    : "0.0";
  const needAttention = state.students.filter((item) => (item.latestRecord?.warningTags || []).length > 0).length;
  const excellentCount = state.students.filter((item) => ["优秀", "卓越"].includes(item.latestRecord?.level)).length;
  return { totalStudents, totalRecords, averageScore, needAttention, excellentCount };
}

async function loadPublicBootstrap() {
  const result = await api("/api/public/students");
  state.students = result.students || [];
}

async function loadPublicStudentDetails(studentId) {
  const result = await api(`/api/public/students/${studentId}`);
  state.studentDetails = normalizeStudentDetailPayload(result);
  render();
  renderChart();
  document.getElementById("publicStudentDetailAnchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
}



async function loadAdminBootstrap() {
  const [studentsResult, logsResult] = await Promise.all([
    api("/api/students"),
    api("/api/audit-logs")
  ]);
  state.students = studentsResult.students || [];
  state.auditLogs = logsResult.logs || [];
}

async function loadAdminStudentDetails(studentId) {
  const result = await api(`/api/students/${studentId}`);
  state.studentDetails = normalizeStudentDetailPayload(result);
  state.view = "students";
  render();
  renderChart();
}


function logout() {
  api("/api/logout", { method: "POST" }).catch(() => null);
  state.token = "";
  state.user = null;
  persistAuth();
  setMessage("success", "已安全退出登录");
  setPublicMode();
  loadPublicBootstrap().then(render);
}

function render() {

  if (state.mode === "public") {
    renderPublicApp();
    return;
  }

  if (!state.token || !state.user) {
    renderLogin();
    return;
  }

  renderAdminApp();
}

function renderPublicApp() {
  const stats = calcStats();
  const activeStudents = filteredStudents();

  app.innerHTML = `
    <div class="public-layout">
      <header class="public-hero">
        <div class="public-hero-inner">
          <div>
            <div class="hero-tag">心迹成诗 · 多维成长档案公开展示</div>
            <h1>乡村儿童数字化成长档案展示平台</h1>
            <p>普通用户可直接查看项目样例档案、成长趋势与群体统计信息；管理端需登录后进行档案维护、记录录入与日志审计。</p>
            <div class="public-actions">
              <button class="btn" id="enterAdminBtn">进入管理后台</button>
              <button class="btn secondary" id="scrollStudentBtn">查看成长档案</button>
            </div>
          </div>
          <div class="public-stat-board">
            <div><strong>${stats.totalStudents}</strong><span>公开档案数</span></div>
            <div><strong>${stats.averageScore}</strong><span>平均总分</span></div>
            <div><strong>${stats.needAttention}</strong><span>重点关注</span></div>
          </div>
        </div>
      </header>

      <main class="public-main">
        ${createAlert()}

        <section class="grid cards public-cards">
          <div class="card stat-card accent-blue"><h3>四大成长维度</h3><strong>4维</strong><span>围绕美育、财商、心理、行为持续记录成长变化</span></div>
          <div class="card stat-card accent-purple"><h3>成长记录总量</h3><strong>${stats.totalRecords}</strong><span>支持多周期持续积累</span></div>
          <div class="card stat-card accent-green"><h3>群体均值参考</h3><strong>${stats.averageScore}</strong><span>帮助判断个体所处的相对水平</span></div>
        </section>



        <section class="card public-student-panel" id="studentArchivePanel">
          <div class="toolbar">
            <div>
              <h3 class="section-title">成长档案公开列表</h3>
              <div class="note">普通访问仅查看公开字段，管理端登录后可查看完整信息和进行编辑。</div>
            </div>
            <input class="search-input" id="publicStudentSearch" placeholder="搜索学生姓名、学校、班级" value="${state.studentSearch}" />
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>学生</th><th>学校/班级</th><th>成长概览</th><th>预警状态</th><th>操作</th></tr>
              </thead>
              <tbody>
                ${activeStudents.length ? activeStudents.map((student) => `
                  <tr>
                    <td><strong>${student.name}</strong><br /><span class="note">${student.gender || ""} ${student.age ? `· ${student.age}岁` : ""}</span></td>
                    <td>${student.school || "-"}<br /><span class="note">${student.gradeClass || ""}</span></td>
                    <td>${student.latestRecord?.period || "暂无记录"}<br /><span class="note">平均总分：${student.averageScore || 0}</span></td>
                    <td>${warningTags(student.latestRecord?.warningTags || [])}</td>
                    <td><button class="btn secondary public-detail-btn" data-id="${student.id}">查看详情</button></td>
                  </tr>
                `).join("") : `<tr><td colspan="5"><div class="empty">暂无可展示档案</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </section>

        ${state.studentDetails ? renderPublicStudentDetail() : ""}
      </main>
    </div>
  `;

  document.getElementById("enterAdminBtn").addEventListener("click", () => {
    state.mode = "admin";
    render();
  });

  document.getElementById("scrollStudentBtn").addEventListener("click", () => {
    document.getElementById("studentArchivePanel")?.scrollIntoView({ behavior: "smooth" });
  });

  const search = document.getElementById("publicStudentSearch");
  if (search) {
    let composing = false;
    const applyPublicSearch = () => {
      state.studentSearch = search.value;
      renderPublicApp();
      const nextInput = document.getElementById("publicStudentSearch");
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(state.studentSearch.length, state.studentSearch.length);
      }
    };
    search.addEventListener("compositionstart", () => {
      composing = true;
    });
    search.addEventListener("compositionend", () => {
      composing = false;
      applyPublicSearch();
    });
    search.addEventListener("input", () => {
      if (composing) return;
      applyPublicSearch();
    });
  }



  document.querySelectorAll(".public-detail-btn").forEach((button) => {
    button.addEventListener("click", () => loadPublicStudentDetails(button.dataset.id));
  });

  if (state.studentDetails) renderChart();
}

function renderPublicStudentDetail() {
  const { student, records, comparison } = state.studentDetails;
  const latestRecord = records[records.length - 1] || null;

  return `
    <section class="student-overview card" id="publicStudentDetailAnchor">

      <div>
        <div class="panel-label">公开档案详情</div>
        <h3 class="section-title" style="margin-bottom:8px;">${student.name} 的成长概览</h3>
        <div class="note">${student.school || "-"} / ${student.gradeClass || "-"} / 监护人：${student.guardian || "未填写"}</div>
      </div>
      <div class="overview-grid">
        <div><span>档案创建</span><strong>${formatDate(student.createdAt)}</strong></div>
        <div><span>记录条数</span><strong>${records.length}</strong></div>
        <div><span>最新等级</span><strong>${latestRecord ? latestRecord.level : "暂无"}</strong></div>
        <div><span>同校平均</span><strong>${comparison?.schoolAverage || 0}</strong></div>
      </div>
    </section>

    <div class="detail-layout">
      <section class="card chart-card compact-chart-card">
        <div class="toolbar"><div><h3 class="section-title">成长趋势</h3><div class="note">展示多周期总分变化与四维表现。</div></div></div>
        <div class="chart-stack">
          <div class="chart-box small-chart-box"><div class="chart-title">总分趋势图</div><canvas id="trendChart"></canvas></div>
          <div class="chart-box small-chart-box radar-box"><div class="chart-title">最新四维雷达图</div><canvas id="radarChart"></canvas></div>
        </div>
      </section>
      <section class="card record-card">
        <div class="toolbar"><div><h3 class="section-title">成长记录与预警</h3><div class="note">仅展示公开内容与预警标签。</div></div></div>
        <div class="record-list">
          ${records.length ? records.slice().reverse().map((record) => `
            <article class="record-item timeline-item">
              <header>
                <div><strong>${record.period}</strong><div class="note">总分 ${record.totalScore} / 等级 ${record.level}</div></div>
                <div class="actions-inline">${warningTags(record.warningTags || [])}</div>
              </header>
              <div class="score-pills"><span>美育 ${safeMetricValue(record, "aesthetic")}</span><span>财商 ${safeMetricValue(record, "finance")}</span><span>心理 ${safeMetricValue(record, "psychology")}</span><span>行为 ${safeMetricValue(record, "behavior")}</span></div>

            </article>
          `).join("") : `<div class="empty">暂无成长记录</div>`}
        </div>
      </section>
    </div>
  `;
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-shell">
      <div class="login-card">
        <section class="login-hero">
          <div class="hero-tag">管理后台入口</div>
          <h1>心迹成诗</h1>
          <p>管理员登录后可进行学生建档、成长记录录入、日志审计与后续导出。普通用户可直接返回公开展示页查看脱敏后的档案内容。</p>
          <div class="hero-badges">
            <span>管理员强制登录</span>
            <span>所有管理操作留痕</span>
            <span>敏感信息分级展示</span>
          </div>
        </section>
        <section class="login-form">
          <h2>后台登录</h2>
          <p class="muted">本页仅面向管理端使用，所有增删改操作均会被记录。</p>
          ${createAlert()}
          <form id="loginForm">
            <div class="field"><label>用户名</label><input name="username" placeholder="请输入账号" required /></div>
            <div class="field"><label>密码</label><input name="password" type="password" placeholder="请输入密码" required /></div>
            <button class="btn" type="submit">登录管理后台</button>
          </form>
          <div class="form-actions" style="margin-top:18px;"><button class="btn ghost" id="backPublicBtn" type="button">返回公开展示页</button></div>

        </section>
      </div>
    </div>
  `;

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    try {
      const result = await api("/api/login", { method: "POST", body: JSON.stringify({ username: formData.get("username"), password: formData.get("password") }) });
      state.token = result.token;
      state.user = result.user;
      persistAuth();
      setMessage(null, null);
      setAdminMode();
      await loadAdminBootstrap();
      render();
    } catch (error) {
      setMessage("error", error.message);
      renderLogin();
    }
  });

  document.getElementById("backPublicBtn").addEventListener("click", async () => {
    setPublicMode();
    await loadPublicBootstrap();
    render();
  });
}

function adminTitle() {
  if (state.view === "dashboard") return "管理概览";
  if (state.view === "students") return "学生档案与成长记录";
  if (state.view === "record-form") return "成长记录录入";
  if (state.view === "student-form") return "学生档案录入";
  if (state.view === "audit") return "审计日志";
  return "管理后台";
}

function renderAdminApp() {
  const stats = calcStats();
  const activeStudents = filteredStudents();

  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">管</div><div><h1>管理后台</h1><p>管理员登录后可维护档案、查看审计日志和执行管理操作。</p></div></div>
        <div class="nav-group">
          <button class="nav-button ${state.view === "dashboard" ? "active" : ""}" data-view="dashboard">管理概览</button>
          <button class="nav-button ${state.view === "students" ? "active" : ""}" data-view="students">学生档案</button>
          <button class="nav-button ${state.view === "record-form" ? "active" : ""}" data-view="record-form">新增成长记录</button>
          <button class="nav-button ${state.view === "student-form" ? "active" : ""}" data-view="student-form">新增学生档案</button>
          <button class="nav-button ${state.view === "audit" ? "active" : ""}" data-view="audit">审计日志</button>
        </div>

        <div class="user-box"><p>当前登录</p><strong>${state.user.name}</strong><div class="note note-light">角色：管理员</div><div style="margin-top: 12px;"><button class="btn ghost" id="logoutBtn">退出登录</button></div></div>
      </aside>
      <main class="main">
        <div class="topbar"><div><h2>${adminTitle()}</h2><p>管理端可以查看完整信息、维护记录并保留所有关键操作日志。</p></div><div class="topbar-actions"><div class="badge primary">普通用户公开访问 / 管理端强制登录</div><button class="btn secondary" id="exportStudentsBtn">导出学生汇总</button><button class="btn secondary" id="exportRecordsBtn">导出成长记录</button><button class="btn secondary" id="exportStudentPdfBtn">导出单个学生PDF</button><button class="btn secondary" id="backPublicEntryBtn">查看公开展示页</button></div></div>


        ${createAlert()}
        ${renderAdminView(stats, activeStudents)}
      </main>
    </div>
  `;

  document.querySelectorAll(".nav-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      if (!["students", "audit"].includes(state.view)) state.studentDetails = null;
      state.editingStudent = null;
      state.editingRecord = null;
      state.inlineNewStudentOpen = false;
      setMessage(null, null);
      renderAdminApp();
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", logout);
  document.getElementById("backPublicEntryBtn").addEventListener("click", async () => {
    setPublicMode();
    await loadPublicBootstrap();
    render();
  });
  document.getElementById("exportStudentsBtn").addEventListener("click", async () => {
    try {
      await downloadWithAuth("/api/export/students.csv", "students-summary.csv");
      setMessage("success", "学生汇总 CSV 已开始下载");
      renderAdminApp();
    } catch (error) {
      setMessage("error", error.message);
      renderAdminApp();
    }
  });
  document.getElementById("exportRecordsBtn").addEventListener("click", async () => {
    try {
      await downloadWithAuth("/api/export/records.csv", "growth-records.csv");
      setMessage("success", "成长记录 CSV 已开始下载");
      renderAdminApp();
    } catch (error) {
      setMessage("error", error.message);
      renderAdminApp();
    }
  });

  document.getElementById("exportStudentPdfBtn").addEventListener("click", async () => {
    if (!state.studentDetails?.student?.id) {
      setMessage("error", "请先进入某个学生详情页后再导出单个学生 PDF");
      renderAdminApp();
      return;
    }
    try {
      await exportStudentPdf(state.studentDetails.student.id);
      setMessage("success", "单个学生 PDF 已生成并开始下载");
      renderAdminApp();
      if (state.view === "students" && state.studentDetails) renderChart();
    } catch (error) {
      setMessage("error", error.message);
      renderAdminApp();
      if (state.view === "students" && state.studentDetails) renderChart();
    }
  });

  bindDashboardEvents();


  bindStudentEvents();
  bindStudentFormEvents();
  bindRecordFormEvents();
  bindAuditEvents();

  if (state.view === "students" && state.studentDetails) renderChart();
}

function renderAdminView(stats, activeStudents) {
  if (state.view === "dashboard") return renderDashboard(stats);
  if (state.view === "student-form") return renderStudentForm();
  if (state.view === "record-form") return renderRecordForm();
  if (state.view === "audit") return renderAuditView();
  return renderStudentsView(activeStudents);
}

function renderDashboard(stats) {
  return `
    <section class="grid cards">
      <div class="card stat-card accent-blue"><h3>学生档案数</h3><strong>${stats.totalStudents}</strong><span>已建立的儿童成长档案</span></div>
      <div class="card stat-card accent-purple"><h3>成长记录数</h3><strong>${stats.totalRecords}</strong><span>累计录入的观察与评分记录</span></div>
      <div class="card stat-card accent-green"><h3>平均总分</h3><strong>${stats.averageScore}</strong><span>当前全体样本的平均水平</span></div>
      <div class="card stat-card accent-orange"><h3>预警学生</h3><strong>${stats.needAttention}</strong><span>当前被预警规则标记的学生数</span></div>
    </section>
    <div class="panel-grid dashboard-grid" style="margin-top:18px;">
      <section class="card">
        <div class="toolbar"><div><h3 class="section-title">最近档案情况</h3><div class="note">预警标签会直接显示在最新记录中。</div></div><button class="btn secondary" id="quickAddRecord">快速新增记录</button></div>
        <div class="table-wrap compact-table"><table><thead><tr><th>学生</th><th>学校/班级</th><th>最新周期</th><th>总分</th><th>预警</th></tr></thead><tbody>${state.students.map((student) => `<tr><td><button class="link-btn student-link" data-id="${student.id}">${student.name}</button></td><td>${student.school || "-"}<br /><span class="note">${student.gradeClass || ""}</span></td><td>${student.latestRecord?.period || "暂无"}</td><td>${student.latestRecord?.totalScore || "-"}</td><td>${warningTags(student.latestRecord?.warningTags || [])}</td></tr>`).join("")}</tbody></table></div>
      </section>

    </div>
  `;
}

function renderStudentsView(activeStudents) {
  return `
    <section class="card archive-panel">
      <div class="toolbar"><div><h3 class="section-title">学生档案列表</h3><div class="note">管理端显示完整字段，支持查看详情与编辑。</div></div><div class="actions-inline actions-search"><input class="search-input field-input" id="studentSearch" placeholder="搜索姓名、学校、班级" value="${state.studentSearch}" /><button class="btn secondary" id="gotoStudentForm">新增学生</button><button class="btn" id="gotoRecordForm">新增记录</button></div></div>
      <div class="table-wrap"><table><thead><tr><th>学生</th><th>监护/联系方式</th><th>记录情况</th><th>群体对比</th><th>操作</th></tr></thead><tbody>${activeStudents.length ? activeStudents.map((student) => `<tr><td><strong>${student.name}</strong><br /><span class="note">${student.school || "-"} / ${student.gradeClass || ""}</span></td><td>${student.guardian || "-"}<br /><span class="note">${student.phone || "未填写"}</span></td><td>${student.recordCount} 条<br /><span class="note">最新：${student.latestRecord?.period || "暂无"}</span></td><td>个人均分 ${student.averageScore || 0}<br /><span class="note">群体均值 ${student.globalAverage || 0}</span></td><td><div class="actions-inline"><button class="btn secondary detail-btn" data-id="${student.id}">查看详情</button><button class="btn ghost edit-student-btn" data-id="${student.id}">编辑档案</button><button class="btn danger delete-student-btn" data-id="${student.id}" data-name="${student.name}">删除档案</button></div></td></tr>`).join("") : `<tr><td colspan="5"><div class="empty">暂无匹配的学生档案</div></td></tr>`}</tbody></table></div>

    </section>
    ${state.studentDetails ? renderAdminStudentDetail() : ""}
  `;
}

function renderAdminStudentDetail() {
  const { student, records, comparison } = state.studentDetails;
  return `
    <section class="student-overview card"><div><div class="panel-label">管理档案详情</div><h3 class="section-title" style="margin-bottom:8px;">${student.name} 的完整成长档案</h3><div class="note">${student.school || "-"} / ${student.gradeClass || "-"} / 监护人：${student.guardian || "未填写"}</div></div><div class="overview-grid"><div><span>联系电话</span><strong>${student.phone || "未填写"}</strong></div><div><span>联系地址</span><strong>${student.address || "未填写"}</strong></div><div><span>同校平均</span><strong>${comparison?.schoolAverage || 0}</strong></div><div><span>同班平均</span><strong>${comparison?.classAverage || 0}</strong></div></div></section>
    <div class="detail-layout"><section class="card chart-card compact-chart-card"><div class="toolbar"><div><h3 class="section-title">成长趋势与对比</h3><div class="note">可结合群体均值和预警标签判断个体状态。</div></div></div><div class="chart-stack"><div class="chart-box small-chart-box"><div class="chart-title">总分趋势图</div><canvas id="trendChart"></canvas></div><div class="chart-box small-chart-box radar-box"><div class="chart-title">最新四维雷达图</div><canvas id="radarChart"></canvas></div></div></section><section class="card record-card"><div class="toolbar"><div><h3 class="section-title">成长记录列表</h3><div class="note">管理端可查看完整评语、预警标签与修改时间。</div></div><button class="btn secondary" id="createRecordForStudent" data-id="${student.id}">为该学生新增记录</button></div><div class="record-list">${records.length ? records.slice().reverse().map((record) => `<article class="record-item timeline-item"><header><div><strong>${record.period}</strong><div class="note">更新时间：${formatDate(record.updatedAt)} / 修改人：${record.updatedBy || "-"}</div></div><div class="record-score-box"><span class="badge ${levelBadge(record.level)}">${record.level}</span><strong>总分 ${record.totalScore}</strong></div></header><div class="actions-inline">${warningTags(record.warningTags || [])}</div><div class="score-pills"><span>美育 ${record.scores.aesthetic}</span><span>财商 ${record.scores.finance}</span><span>心理 ${record.scores.psychology}</span><span>行为 ${record.scores.behavior}</span></div><p>总评：${record.comments.overall || "暂无总评"}</p><div class="actions-inline"><button class="btn ghost edit-record-btn" data-id="${record.id}">编辑记录</button><button class="btn danger delete-record-btn" data-id="${record.id}">删除记录</button></div></article>`).join("") : `<div class="empty">当前还没有成长记录，点击右上角按钮开始录入。</div>`}</div></section></div>
  `;
}

function renderStudentForm() {
  const student = state.editingStudent || { name: "", gender: "", age: "", school: "", gradeClass: "", guardian: "", phone: "", address: "", note: "", publicNote: "" };
  return `
    <section class="card form-shell"><div class="form-head"><div><div class="panel-label">学生基础信息</div><h3 class="section-title">${state.editingStudent ? "编辑学生档案" : "新增学生档案"}</h3><div class="note">管理端可填写完整信息，并区分公开备注与内部备注。</div></div></div><form id="studentForm"><div class="form-grid"><div class="field"><label>学生姓名</label><input name="name" value="${student.name || ""}" required /></div><div class="field"><label>性别</label><select name="gender"><option value="">请选择</option><option value="男" ${student.gender === "男" ? "selected" : ""}>男</option><option value="女" ${student.gender === "女" ? "selected" : ""}>女</option></select></div><div class="field"><label>年龄</label><input name="age" type="number" min="1" max="18" value="${student.age || ""}" /></div><div class="field"><label>学校</label><input name="school" value="${student.school || ""}" /></div><div class="field"><label>班级</label><input name="gradeClass" value="${student.gradeClass || ""}" /></div><div class="field"><label>监护人</label><input name="guardian" value="${student.guardian || ""}" /></div><div class="field"><label>联系电话</label><input name="phone" value="${student.phone || ""}" /></div><div class="field"><label>联系地址</label><input name="address" value="${student.address || ""}" /></div><div class="field full"><label>公开备注</label><textarea name="publicNote">${student.publicNote || ""}</textarea></div><div class="field full"><label>内部备注</label><textarea name="note">${student.note || ""}</textarea></div></div><div class="form-actions"><button class="btn" type="submit">${state.editingStudent ? "保存修改" : "创建档案"}</button><button class="btn ghost" type="button" id="cancelStudentForm">取消</button></div></form></section>
  `;
}

function renderRecordForm() {
  const record = state.editingRecord || { studentId: state.studentDetails?.student?.id || "", period: "", scores: { aesthetic: 3, finance: 3, psychology: 3, behavior: 3 }, comments: { aesthetic: "", finance: "", psychology: "", behavior: "", overall: "" } };
  const currentStudentValue = state.selectedStudentId || record.studentId || "";
  return `
    <section class="card form-shell"><div class="form-head"><div><div class="panel-label">成长过程录入</div><h3 class="section-title">${state.editingRecord ? "编辑成长记录" : "新增成长记录"}</h3><div class="note">管理端录入的所有新增、修改行为都会写入审计日志。</div></div><div class="score-summary-box"><span>系统自动统计</span><strong>满分 20 分</strong></div></div><form id="recordForm"><div class="form-grid"><div class="field full"><label>选择学生</label><div class="inline-select-row"><select name="studentId" id="recordStudentSelect" required><option value="">请选择学生档案</option><option value="__new__" ${currentStudentValue === "__new__" ? "selected" : ""}>+ 新增学生档案</option>${state.students.map((student) => `<option value="${student.id}" ${currentStudentValue === student.id ? "selected" : ""}>${student.name} - ${student.gradeClass || student.school || "未分班"}</option>`).join("")}</select><button class="btn secondary" type="button" id="toggleInlineStudentBtn">${state.inlineNewStudentOpen ? "收起新增学生" : "新增学生"}</button></div><div class="note">如果列表里还没有该学生，可以直接在当前页面完成建档。</div></div>${state.inlineNewStudentOpen ? `<div class="inline-student-box full"><div class="inline-student-head"><strong>快速新增学生</strong><span>创建后会自动选中该学生，继续填写成长记录</span></div><div class="form-grid"><div class="field"><label>学生姓名</label><input name="inline-name" placeholder="请输入学生姓名" /></div><div class="field"><label>性别</label><select name="inline-gender"><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select></div><div class="field"><label>年龄</label><input name="inline-age" type="number" min="1" max="18" /></div><div class="field"><label>学校</label><input name="inline-school" placeholder="学校名称" /></div><div class="field"><label>班级</label><input name="inline-gradeClass" placeholder="如：四年级1班" /></div><div class="field"><label>监护人</label><input name="inline-guardian" placeholder="如：奶奶" /></div><div class="field full"><label>公开备注</label><textarea name="inline-publicNote" placeholder="普通用户可见的基础说明"></textarea></div><div class="field full"><label>内部备注</label><textarea name="inline-note" placeholder="管理端可见的内部情况说明"></textarea></div></div></div>` : ""}<div class="field"><label>记录周期</label><input name="period" value="${record.period || ""}" placeholder="如：2026春季学期期末" required /></div></div><div class="metrics-grid compact-metrics-grid">${Object.entries(dimensionMap).map(([key, label]) => `<div class="metric-box polished-box"><h4>${label}</h4><div class="metric-score"><input type="range" name="score-${key}" min="1" max="5" value="${record.scores[key]}" /><strong id="value-${key}">${record.scores[key]}</strong></div><textarea name="comment-${key}" placeholder="请输入该维度评语">${record.comments[key] || ""}</textarea></div>`).join("")}</div><div class="field" style="margin-top:16px;"><label>综合评语</label><textarea name="overall">${record.comments.overall || ""}</textarea></div><div class="note">系统会自动根据四维分数计算总分与等级，并在低分或低于群体均值时标记预警。</div><div class="form-actions"><button class="btn" type="submit">${state.editingRecord ? "保存记录" : "创建记录"}</button><button class="btn ghost" type="button" id="cancelRecordForm">取消</button></div></form></section>
  `;
}


function renderAuditView() {
  return `
    <section class="card archive-panel">
      <div class="toolbar">
        <div><h3 class="section-title">操作日志 / 审计日志</h3><div class="note">用于追踪后台登录、建档、修改、删除、导出等关键管理动作。</div></div>
        <div class="actions-inline"><button class="btn secondary" id="refreshAuditBtn">刷新日志</button></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>时间</th><th>操作人</th><th>角色</th><th>动作</th><th>对象</th><th>详情</th></tr></thead><tbody>${state.auditLogs.length ? state.auditLogs.map((log) => `<tr><td>${formatDate(log.time)}</td><td>${log.actorName || "-"}</td><td>${log.actorRole || "-"}</td><td>${log.action || "-"}</td><td>${log.targetType || "-"}</td><td>${log.detail || "-"}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty">暂无审计日志</div></td></tr>`}</tbody></table></div>
    </section>
  `;
}


function bindDashboardEvents() {
  document.querySelectorAll(".student-link").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.mode === "admin") loadAdminStudentDetails(button.dataset.id);
      else loadPublicStudentDetails(button.dataset.id);
    });
  });

  const quickAdd = document.getElementById("quickAddRecord");
  if (quickAdd) {
    quickAdd.addEventListener("click", () => {
      state.view = "record-form";
      state.editingRecord = null;
      state.inlineNewStudentOpen = false;
      state.selectedStudentId = "";
      renderAdminApp();
    });
  }

}

function bindStudentEvents() {
  const studentSearch = document.getElementById("studentSearch");
  if (studentSearch) {
    studentSearch.addEventListener("input", (event) => {
      state.studentSearch = event.target.value;
      renderAdminApp();
    });
  }

  const gotoStudentForm = document.getElementById("gotoStudentForm");
  if (gotoStudentForm) {
    gotoStudentForm.addEventListener("click", () => {
      state.view = "student-form";
      state.editingStudent = null;
      renderAdminApp();
    });
  }

  const gotoRecordForm = document.getElementById("gotoRecordForm");
  if (gotoRecordForm) {
    gotoRecordForm.addEventListener("click", () => {
      state.view = "record-form";
      state.editingRecord = null;
      state.inlineNewStudentOpen = false;
      state.selectedStudentId = "";
      renderAdminApp();
    });
  }


  document.querySelectorAll(".detail-btn").forEach((button) => {
    button.addEventListener("click", () => loadAdminStudentDetails(button.dataset.id));
  });

  document.querySelectorAll(".edit-student-btn").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingStudent = state.students.find((item) => item.id === button.dataset.id);
      state.view = "student-form";
      renderAdminApp();
    });
  });

  document.querySelectorAll(".delete-student-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = window.confirm(`确定删除学生档案“${button.dataset.name}”吗？该学生的所有成长记录也会一并删除，且无法恢复。`);
      if (!ok) return;
      try {
        const result = await api(`/api/students/${button.dataset.id}`, { method: "DELETE" });
        setMessage("success", `学生档案已删除，并联动删除 ${result.removedRecordCount || 0} 条成长记录`);
        state.studentDetails = null;
        await loadAdminBootstrap();
        await syncAuditLogs();
        state.view = "students";
        renderAdminApp();
      } catch (error) {
        setMessage("error", error.message);
        renderAdminApp();
      }
    });
  });

  const createRecordForStudent = document.getElementById("createRecordForStudent");

  if (createRecordForStudent) {
    createRecordForStudent.addEventListener("click", () => {
      state.editingRecord = {
        studentId: createRecordForStudent.dataset.id,
        period: "",
        scores: { aesthetic: 3, finance: 3, psychology: 3, behavior: 3 },
        comments: { aesthetic: "", finance: "", psychology: "", behavior: "", overall: "" }
      };
      state.selectedStudentId = createRecordForStudent.dataset.id;
      state.inlineNewStudentOpen = false;
      state.view = "record-form";
      renderAdminApp();
    });
  }


  document.querySelectorAll(".edit-record-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await api(`/api/records/${button.dataset.id}`);
        state.editingRecord = result.record;
        state.view = "record-form";
        renderAdminApp();
      } catch (error) {
        setMessage("error", error.message);
        renderAdminApp();
      }
    });
  });

  document.querySelectorAll(".delete-record-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = window.confirm("确定删除这条成长记录吗？删除后无法恢复。");
      if (!ok) return;
      try {
        await api(`/api/records/${button.dataset.id}`, { method: "DELETE" });
        setMessage("success", "成长记录已删除");
        await loadAdminBootstrap();
        await syncAuditLogs();
        if (state.studentDetails?.student?.id) {
          await loadAdminStudentDetails(state.studentDetails.student.id);
        } else {
          state.view = "students";
          renderAdminApp();
        }


      } catch (error) {
        setMessage("error", error.message);
        renderAdminApp();
      }
    });
  });
}

function bindStudentFormEvents() {
  const form = document.getElementById("studentForm");
  if (!form) return;

  document.getElementById("cancelStudentForm").addEventListener("click", () => {
    state.view = "students";
    state.editingStudent = null;
    renderAdminApp();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    try {
      if (state.editingStudent?.id) {
        await api(`/api/students/${state.editingStudent.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage("success", "学生档案已更新");
      } else {
        await api("/api/students", { method: "POST", body: JSON.stringify(payload) });
        setMessage("success", "学生档案已创建");
      }
      state.editingStudent = null;
      state.view = "students";
      await loadAdminBootstrap();
      await syncAuditLogs();
      renderAdminApp();


    } catch (error) {
      setMessage("error", error.message);
      renderAdminApp();
    }
  });
}

function bindRecordFormEvents() {
  const form = document.getElementById("recordForm");
  if (!form) return;

  Object.keys(dimensionMap).forEach((key) => {
    const input = form.querySelector(`[name="score-${key}"]`);
    const output = form.querySelector(`#value-${key}`);
    if (input && output) {
      input.addEventListener("input", () => {
        output.textContent = input.value;
      });
    }
  });

  const studentSelect = document.getElementById("recordStudentSelect");
  const toggleInlineStudentBtn = document.getElementById("toggleInlineStudentBtn");

  if (studentSelect) {
    studentSelect.addEventListener("change", () => {
      state.selectedStudentId = studentSelect.value;
      if (studentSelect.value === "__new__") {
        state.inlineNewStudentOpen = true;
        renderAdminApp();
      }
    });
  }


  if (toggleInlineStudentBtn) {
    toggleInlineStudentBtn.addEventListener("click", () => {
      state.inlineNewStudentOpen = !state.inlineNewStudentOpen;
      if (state.inlineNewStudentOpen && !state.selectedStudentId) {
        state.selectedStudentId = "__new__";
      }
      renderAdminApp();
    });
  }


  document.getElementById("cancelRecordForm").addEventListener("click", () => {
    state.view = state.studentDetails ? "students" : "dashboard";
    state.editingRecord = null;
    state.inlineNewStudentOpen = false;
    renderAdminApp();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    let selectedStudentId = formData.get("studentId");

    try {
      if (selectedStudentId === "__new__" || state.inlineNewStudentOpen) {
        const inlineName = (formData.get("inline-name") || "").toString().trim();
        if (selectedStudentId === "__new__" || state.inlineNewStudentOpen) {
          if (!inlineName) throw new Error("请先填写新增学生姓名");
        }
        const newStudentPayload = {
          name: inlineName,
          gender: formData.get("inline-gender"),
          age: formData.get("inline-age"),
          school: formData.get("inline-school"),
          gradeClass: formData.get("inline-gradeClass"),
          guardian: formData.get("inline-guardian"),
          publicNote: formData.get("inline-publicNote"),
          note: formData.get("inline-note")
        };
        const studentResult = await api("/api/students", { method: "POST", body: JSON.stringify(newStudentPayload) });
        selectedStudentId = studentResult.student.id;
        state.selectedStudentId = studentResult.student.id;
        state.inlineNewStudentOpen = false;
        setMessage("success", "学生档案已创建，并已继续录入成长记录");
      }


      const payload = {
        studentId: selectedStudentId,
        period: formData.get("period"),
        scores: {
          aesthetic: Number(formData.get("score-aesthetic")),
          finance: Number(formData.get("score-finance")),
          psychology: Number(formData.get("score-psychology")),
          behavior: Number(formData.get("score-behavior"))
        },
        comments: {
          aesthetic: formData.get("comment-aesthetic"),
          finance: formData.get("comment-finance"),
          psychology: formData.get("comment-psychology"),
          behavior: formData.get("comment-behavior"),
          overall: formData.get("overall")
        }
      };

      if (!payload.studentId) throw new Error("请选择学生或先新增学生档案");

      if (state.editingRecord?.id) {
        await api(`/api/records/${state.editingRecord.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setMessage("success", "成长记录已更新");
      } else {
        await api("/api/records", { method: "POST", body: JSON.stringify(payload) });
        if (!state.inlineNewStudentOpen) setMessage("success", "成长记录已创建");
      }

      const studentId = payload.studentId;
      state.editingRecord = null;
      state.inlineNewStudentOpen = false;
      state.selectedStudentId = "";
      await loadAdminBootstrap();

      await syncAuditLogs();
      if (studentId) {
        await loadAdminStudentDetails(studentId);
      } else {
        state.view = "students";
        renderAdminApp();
      }


    } catch (error) {
      setMessage("error", error.message);
      renderAdminApp();
    }
  });
}

function bindAuditEvents() {
  const refreshAuditBtn = document.getElementById("refreshAuditBtn");
  if (refreshAuditBtn) {
    refreshAuditBtn.addEventListener("click", async () => {
      await loadAdminBootstrap();
      state.view = "audit";
      renderAdminApp();
    });
  }
}

async function downloadWithAuth(url, fileName) {
  const response = await fetch(url, {
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });
  if (!response.ok) {
    let message = "下载失败";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (e) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

async function exportStudentPdf(studentId) {
  const response = await fetch(`/api/export/students/${studentId}/pdf`, {
    method: "POST",
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {}
  });
  if (!response.ok) {
    let message = "PDF 导出失败";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (e) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `${state.studentDetails?.student?.name || "学生"}-成长档案报告.pdf`;
  link.click();
  URL.revokeObjectURL(objectUrl);
}


function renderChart() {

  if (!state.studentDetails || !window.Chart) return;

  const chartData = state.studentDetails.chart || state.studentDetails.records || [];
  const trendCanvas = document.getElementById("trendChart");
  const radarCanvas = document.getElementById("radarChart");
  if (!trendCanvas || !radarCanvas) return;

  if (state.chart?.trend) state.chart.trend.destroy();
  if (state.chart?.radar) state.chart.radar.destroy();

  const latest = chartData[chartData.length - 1] || { aesthetic: 0, finance: 0, psychology: 0, behavior: 0 };

  state.chart = {
    trend: new Chart(trendCanvas, {
      type: "line",
      data: {
        labels: chartData.map((item) => item.period),
        datasets: [{
          label: "总分",
          data: chartData.map((item) => item.totalScore),
          borderColor: "#3d6ae8",
          backgroundColor: "rgba(61,106,232,0.12)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, max: 20, grid: { color: "rgba(0,0,0,0.06)" } },
          x: { grid: { display: false } }
        }
      }
    }),
    radar: new Chart(radarCanvas, {
      type: "radar",
      data: {
        labels: ["美育", "财商", "心理", "行为"],
        datasets: [{
          label: "最新四维表现",
          data: [safeMetricValue(latest, "aesthetic"), safeMetricValue(latest, "finance"), safeMetricValue(latest, "psychology"), safeMetricValue(latest, "behavior")],
          borderColor: "#1f9d63",
          backgroundColor: "rgba(31,157,99,0.14)",
          pointBackgroundColor: "#1f9d63"
        }]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          r: {
            min: 0,
            max: 5,
            ticks: { stepSize: 1, backdropColor: "transparent" },
            grid: { color: "rgba(0,0,0,0.08)" },
            pointLabels: { font: { size: 11 } }
          }
        }
      }
    })
  };
}

async function init() {
  if (state.token && state.user) {
    try {
      await api("/api/me");
      setAdminMode();
      await loadAdminBootstrap();
      render();
      return;
    } catch (error) {
      state.token = "";
      state.user = null;
      persistAuth();
    }
  }

  setPublicMode();
  await loadPublicBootstrap();
  render();
}

init();
