-- ============================================================
-- 1. sessions
-- ============================================================
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  patient_name  text,
  status        text not null default 'pending_consent'
                  check (status in ('pending_consent', 'active', 'summarizing', 'completed', 'approved')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table  public.sessions                is 'One row per patient intake session.';
comment on column public.sessions.patient_name   is 'Optional name provided by the patient at the start.';
comment on column public.sessions.status         is 'pending_consent → active → summarizing → completed → approved.';

-- ============================================================
-- 2. messages
-- ============================================================
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  role        text not null check (role in ('patient', 'assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);

comment on table  public.messages            is 'Chronological chat turns within a session.';
comment on column public.messages.role       is 'patient = human input, assistant = Claude response.';
comment on column public.messages.session_id is 'Parent session; deleted automatically when session is deleted.';

create index idx_messages_session_id on public.messages (session_id);
create index idx_messages_session_created on public.messages (session_id, created_at);

-- ============================================================
-- 3. clinical_summaries
-- ============================================================
create table public.clinical_summaries (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null unique references public.sessions (id) on delete cascade,
  chief_complaint  text,
  medical_history  text,
  dental_history   text,
  medications      text,
  allergies        text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table  public.clinical_summaries                 is 'Claude-generated intake summary; one per completed session.';
comment on column public.clinical_summaries.chief_complaint is 'Primary complaint in the patient''s own words.';
comment on column public.clinical_summaries.medical_history is 'Conditions, surgeries, significant health history.';
comment on column public.clinical_summaries.dental_history  is 'Previous dental work, anxiety, last visit date.';
comment on column public.clinical_summaries.medications     is 'Current medications including OTC and supplements.';
comment on column public.clinical_summaries.allergies       is 'Allergies (especially lidocaine, penicillin, latex, NSAIDs).';
comment on column public.clinical_summaries.notes           is 'Any other clinically relevant flags.';

create index idx_clinical_summaries_session_id on public.clinical_summaries (session_id);

-- ============================================================
-- 4. consent_logs
-- ============================================================
create table public.consent_logs (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null unique references public.sessions (id) on delete cascade,
  consent_shown_at  timestamptz not null,
  q1_answer         text,
  q1_passed         boolean,
  q1_retries        int not null default 0,
  q2_answer         text,
  q2_passed         boolean,
  q2_retries        int not null default 0,
  q3_answer         text,
  q3_passed         boolean,
  q3_retries        int not null default 0,
  intake_started_at timestamptz,
  created_at        timestamptz not null default now()
);

comment on table  public.consent_logs                      is 'Audit log for consent screen and verification Q&A before clinical intake.';
comment on column public.consent_logs.consent_shown_at     is 'When the patient was shown the consent screen.';
comment on column public.consent_logs.intake_started_at    is 'When all verification questions passed and clinical intake began.';

create index idx_consent_logs_session_id on public.consent_logs (session_id);

-- ============================================================
-- 5. Auto-update updated_at columns
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create trigger trg_clinical_summaries_updated_at
  before update on public.clinical_summaries
  for each row execute function public.set_updated_at();

-- ============================================================
-- 6. Useful views
-- ============================================================

-- Session list view (mirrors GET /sessions — no messages/summary)
create view public.sessions_list as
select
  s.id,
  s.patient_name,
  s.status,
  s.started_at,
  s.ended_at,
  count(m.id)::int as message_count
from public.sessions s
left join public.messages m on m.session_id = s.id
group by s.id
order by s.started_at desc;

-- Stats view (mirrors GET /sessions/stats)
create view public.session_stats as
select
  count(*)                                               as total,
  count(*) filter (where status = 'active')              as active,
  count(*) filter (where status = 'completed')           as completed,
  count(*) filter (where status = 'approved')            as approved,
  count(*) filter (where started_at::date = current_date) as today_count
from public.sessions;

-- ============================================================
-- 7. Row Level Security (RLS)
-- ============================================================
-- Enable RLS on all tables
alter table public.sessions            enable row level security;
alter table public.messages            enable row level security;
alter table public.clinical_summaries  enable row level security;
alter table public.consent_logs        enable row level security;

-- ---- Policies for the API server (service role) ----
-- The backend uses the Supabase service-role key, which bypasses RLS.
-- These policies are for any future direct browser/anon access.

-- Patients: allow inserting their own session via anon key (optional)
-- Managers: read-only via a "manager" role (optional — wire up Supabase Auth later)

-- For now, allow full access to authenticated users and service role
create policy "service role full access — sessions"
  on public.sessions for all
  using (true)
  with check (true);

create policy "service role full access — messages"
  on public.messages for all
  using (true)
  with check (true);

create policy "service role full access — clinical_summaries"
  on public.clinical_summaries for all
  using (true)
  with check (true);

create policy "service role full access — consent_logs"
  on public.consent_logs for all
  using (true)
  with check (true);

-- ============================================================
-- 8. Migration for existing databases (run manually if needed)
-- ============================================================
-- alter table public.sessions drop constraint if exists sessions_status_check;
-- alter table public.sessions add constraint sessions_status_check
--   check (status in ('pending_consent', 'active', 'summarizing', 'completed', 'approved'));
-- alter table public.sessions alter column status set default 'pending_consent';