# 心迹成诗 - 成长档案采集后台

一个适合学生团队使用的轻量级后台网站，用于统一录入和查看留守儿童成长档案。

> 当前部署模式：普通用户可直接访问公开展示页，无需登录；管理员登录后进入后台进行档案维护、日志审计与导出。


## 已实现功能

1. 管理员 / 审核人登录
2. 学生档案列表与搜索
3. 新增 / 编辑学生档案
4. 新增 / 编辑 / 删除成长记录
5. 自动计算四维总分与等级
6. 查看学生历史成长记录
7. 简单图表可视化（总分趋势 + 四维雷达图）
8. 在成长记录页内直接新增学生档案，再继续提交成长记录
9. 普通公开展示页 + 管理后台双模式访问
10. 审计日志查看
11. 学生汇总 CSV / 成长记录 CSV 导出
12. 单个学生 CSV 导出与 PDF 报告导出




## 技术方案

- 前端：HTML + CSS + JavaScript
- 前端：HTML + CSS + JavaScript
- 后端：Node.js + Express
- 数据存储：Supabase（推荐）/ 本地 JSON（兜底）
- PDF：服务端使用 Python + ReportLab 生成中文 PDF 报告
- 部署：可直接部署到 Render



## 本地运行

```bash
cd E:/WorkSpace/Competition/NLA/web
npm install
npm start
```

启动后访问：

```text
http://localhost:3000
```

如果提示 3000 端口被占用，可临时换端口启动：

```powershell
$env:PORT=3001; npm start
```

然后访问：

```text
http://localhost:3001
```


## 默认账号

- 管理员：`admin / admin123`

可通过 `.env` 自定义：

```env
PORT=3000
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_NAME=管理员
```

## 多个管理员账号配置

推荐使用一个 JSON 环境变量：

```env
ADMIN_ACCOUNTS=[{"username":"admin1","password":"pass1","name":"管理员A"},{"username":"admin2","password":"pass2","name":"管理员B"}]
```

说明：
- 如果配置了 `ADMIN_ACCOUNTS`，系统会优先读取它
- 如果没有配置，则回退到单管理员模式（`ADMIN_USERNAME` / `ADMIN_PASSWORD`）
- 每个管理员对象建议至少包含：`username`、`password`、`name`


## 数据说明

网站会在首次启动时自动生成：

- `data/db.json`

其中包含：

- 用户账号
- 会话信息
- 审计日志
- 学生档案
- 成长记录

当配置了 Supabase 后，网站会优先使用 Supabase 中的 `growth_*` 数据表；只有未配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 时，才会回退到本地 JSON 兜底模式。



## Render 部署建议

### 方式一：使用 `render.yaml`
直接将仓库连接到 Render，选择使用仓库中的 `render.yaml`。

注意：如果你是把整个 `NLA` 仓库上传到 GitHub，而不是只上传 `web` 子目录，那么 Render 仍然可以正常识别，因为当前配置里已经写了：

- `rootDir: web`


### 方式二：手动配置
- Root Directory: `web`
- Build Command: `npm install`
- Start Command: `npm start`

说明：部署时 `npm install` 后会自动执行 `postinstall`，补装 `reportlab` 和 `pypdf`，用于单个学生 PDF 报告导出。


建议在 Render 后台设置环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_ACCOUNTS`（推荐）或 `ADMIN_USERNAME` / `ADMIN_PASSWORD`

上线前建议把默认账号密码改成你们团队自己的，并避免继续使用示例口令。



## 上线前建议检查

- 将默认管理员与审核人账号改为团队正式账号
- 首次部署后先手动新增/编辑/删除一条记录做冒烟测试
- 确认 Render 环境变量是否已正确配置
- 检查普通公开页与管理后台是否都能正常访问
- 检查学生汇总 CSV、成长记录 CSV 是否可正常导出
- 检查单个学生 CSV 与 PDF 报告是否可正常导出

- 如果要给评委演示，建议先准备好 2-3 个完整学生样例数据


## Supabase 初始化步骤

1. 打开 Supabase SQL Editor。
2. 执行仓库中的：
   - `web/supabase_schema.sql`
3. 在 Render 或本地环境变量中配置：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. 首次启动服务时，系统会自动把环境变量中的管理员账号写入 `growth_admin_users`（如不存在）。
5. 配完后，网站数据将优先写入 Supabase，不再依赖本地 `db.json`。
6. 如果你暂时没有配 Supabase 环境变量，项目仍可继续以本地 JSON 方式运行，便于本地调试。


## 后续可扩展



- 增加按学期筛选
- 导出 Excel / PDF
- 增加更多学生信息字段
- 增加审核状态
- 接入数据库（如 SQLite / PostgreSQL）

