-- growth_ 前缀表结构（心迹成诗网站）

create table if not exists growth_admin_users (
  id text primary key,
  username text not null unique,
  password text not null,
  role text not null default 'admin',
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists growth_sessions (
  token text primary key,
  user_id text not null references growth_admin_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists growth_students (
  id text primary key,
  name text not null,
  gender text,
  age integer,
  school text,
  grade_class text,
  guardian text,
  phone text,
  address text,
  public_note text,
  note text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists growth_records (
  id text primary key,
  student_id text not null references growth_students(id) on delete cascade,
  period text not null,
  aesthetic integer not null,
  finance integer not null,
  psychology integer not null,
  behavior integer not null,
  total_score integer not null,
  level text not null,
  comment_aesthetic text,
  comment_finance text,
  comment_psychology text,
  comment_behavior text,
  comment_overall text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists growth_audit_logs (
  id text primary key,
  time timestamptz not null default now(),
  actor_id text,
  actor_name text,
  actor_role text,
  action text,
  target_type text,
  target_id text,
  detail text
);

create index if not exists idx_growth_records_student_id on growth_records(student_id);
create index if not exists idx_growth_records_period on growth_records(period);
create index if not exists idx_growth_students_school on growth_students(school);
create index if not exists idx_growth_students_grade_class on growth_students(grade_class);
create index if not exists idx_growth_audit_logs_time on growth_audit_logs(time desc);
