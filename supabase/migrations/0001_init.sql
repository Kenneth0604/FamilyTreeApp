-- ============================================================================
-- FamilyTreeApp — 初始化 Schema
-- 在 Supabase Dashboard → SQL Editor 直接執行整份檔案(可重複執行)。
--
-- 資料模型:
--   families        家族群組(邀請碼)
--   family_members  「某個登入帳號在某個家族中的身分」(self / viewpoint / 進階模式)
--   people          家族樹上的每一個人(大多數沒有帳號)
--   parent_child    親子邊(有方向)
--   spouses         配偶邊(無方向;married / divorced / widowed)
-- 兄弟姊妹、叔伯、堂表…全部由前端的稱謂引擎以最短路徑推算,不另外儲存。
--
-- RLS:所有表都以「family_id 是否在該使用者所屬的 family_members 中」判斷讀寫。
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 資料表
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  invite_code  text not null unique,
  created_at   timestamptz not null default now()
);

create table if not exists public.family_members (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  auth_user_id         uuid not null references auth.users(id) on delete cascade,
  display_name         text not null,
  self_person_id       uuid,            -- FK 在 people 建好後補上
  viewpoint_person_id  uuid,
  advanced_terms       boolean not null default false,
  joined_at            timestamptz not null default now(),
  unique (family_id, auth_user_id)
);

create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  gender       text not null default 'unspecified' check (gender in ('male', 'female', 'unspecified')),
  -- 允許 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' 或 null
  birth_date   text check (birth_date is null or birth_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  is_deceased  boolean not null default false,
  avatar_url   text,
  note         text not null default '',
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.family_members
  drop constraint if exists family_members_self_person_id_fkey,
  drop constraint if exists family_members_viewpoint_person_id_fkey;
alter table public.family_members
  add constraint family_members_self_person_id_fkey
    foreign key (self_person_id) references public.people(id) on delete set null,
  add constraint family_members_viewpoint_person_id_fkey
    foreign key (viewpoint_person_id) references public.people(id) on delete set null;

create table if not exists public.parent_child (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  parent_id   uuid not null references public.people(id) on delete cascade,
  child_id    uuid not null references public.people(id) on delete cascade,
  created_by  uuid references public.family_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);

create table if not exists public.spouses (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  person_a_id  uuid not null references public.people(id) on delete cascade,
  person_b_id  uuid not null references public.people(id) on delete cascade,
  status       text not null default 'married' check (status in ('married', 'divorced', 'widowed')),
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);
-- 同一對人只能有一筆配偶紀錄(不論 a / b 順序)
create unique index if not exists spouses_pair_unique
  on public.spouses (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id));

create index if not exists people_family_idx        on public.people(family_id);
create index if not exists parent_child_family_idx  on public.parent_child(family_id);
create index if not exists parent_child_child_idx   on public.parent_child(child_id);
create index if not exists spouses_family_idx       on public.spouses(family_id);
create index if not exists family_members_user_idx  on public.family_members(auth_user_id);

-- ----------------------------------------------------------------------------
-- updated_at 觸發器
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.touch_updated_at();

drop trigger if exists spouses_touch on public.spouses;
create trigger spouses_touch before update on public.spouses
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 權限輔助函式(security definer 以避免 family_members 的 RLS 自我遞迴)
-- ----------------------------------------------------------------------------
create or replace function public.is_family_member(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.auth_user_id = auth.uid()
  );
$$;
grant execute on function public.is_family_member(uuid) to authenticated;

-- 6 碼邀請碼(去掉容易混淆的 0/O/1/I)
create or replace function public.gen_invite_code()
returns text language plpgsql volatile as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out   text := '';
  i     int;
begin
  for i in 1..6 loop
    out := out || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out;
end $$;

-- ----------------------------------------------------------------------------
-- RPC:建立家族 / 用邀請碼加入 / 重新產生邀請碼
-- ----------------------------------------------------------------------------
create or replace function public.create_family(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid  uuid;
  code text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception '請輸入家族名稱'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.families where invite_code = code);
  end loop;
  insert into public.families (name, invite_code) values (trim(p_name), code) returning id into fid;
  insert into public.family_members (family_id, auth_user_id, display_name)
    values (fid, auth.uid(), coalesce(nullif(trim(p_display_name), ''), '成員'));
  return fid;
end $$;
grant execute on function public.create_family(text, text) to authenticated;

create or replace function public.join_family(p_invite_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select id into fid from public.families where invite_code = upper(trim(p_invite_code));
  if fid is null then raise exception '找不到這個邀請碼'; end if;
  insert into public.family_members (family_id, auth_user_id, display_name)
    values (fid, auth.uid(), coalesce(nullif(trim(p_display_name), ''), '成員'))
    on conflict (family_id, auth_user_id) do nothing;
  return fid;
end $$;
grant execute on function public.join_family(text, text) to authenticated;

create or replace function public.regenerate_invite_code(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_family_member(p_family_id) then raise exception '你不是這個家族的成員'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.families where invite_code = code);
  end loop;
  update public.families set invite_code = code where id = p_family_id;
  return code;
end $$;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.families       enable row level security;
alter table public.family_members enable row level security;
alter table public.people         enable row level security;
alter table public.parent_child   enable row level security;
alter table public.spouses        enable row level security;

drop policy if exists "families member select" on public.families;
drop policy if exists "families member update" on public.families;
create policy "families member select" on public.families for select to authenticated
  using (public.is_family_member(id));
create policy "families member update" on public.families for update to authenticated
  using (public.is_family_member(id)) with check (public.is_family_member(id));
-- insert / 邀請碼查詢一律經由 RPC(security definer)

drop policy if exists "members select" on public.family_members;
drop policy if exists "members update own" on public.family_members;
drop policy if exists "members delete own" on public.family_members;
create policy "members select" on public.family_members for select to authenticated
  using (auth_user_id = auth.uid() or public.is_family_member(family_id));
create policy "members update own" on public.family_members for update to authenticated
  using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy "members delete own" on public.family_members for delete to authenticated
  using (auth_user_id = auth.uid());
-- insert 一律經由 create_family / join_family

drop policy if exists "people member all" on public.people;
create policy "people member all" on public.people for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

drop policy if exists "parent_child member all" on public.parent_child;
create policy "parent_child member all" on public.parent_child for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

drop policy if exists "spouses member all" on public.spouses;
create policy "spouses member all" on public.spouses for all to authenticated
  using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

-- ----------------------------------------------------------------------------
-- Storage:大頭照(公開讀取;路徑第一段為 family_id,只有該家族成員可上傳 / 刪除)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "avatars public read"   on storage.objects;
drop policy if exists "avatars member insert" on storage.objects;
drop policy if exists "avatars member update" on storage.objects;
drop policy if exists "avatars member delete" on storage.objects;
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars member insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "avatars member update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_family_member(((storage.foldername(name))[1])::uuid));
create policy "avatars member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_family_member(((storage.foldername(name))[1])::uuid));

-- ----------------------------------------------------------------------------
-- Keep-alive:免費方案 7 天無活動會暫停專案。
-- GitHub Actions(.github/workflows/keep-alive.yml)每 3 天以 anon key 呼叫 rpc/keep_alive。
-- ----------------------------------------------------------------------------
create table if not exists public.heartbeats (
  id         int primary key default 1 check (id = 1),
  last_ping  timestamptz not null default now(),
  source     text
);
insert into public.heartbeats (id) values (1) on conflict (id) do nothing;
alter table public.heartbeats enable row level security;

create or replace function public.keep_alive(p_source text default 'github-actions')
returns timestamptz language sql security definer set search_path = public as $$
  update public.heartbeats set last_ping = now(), source = p_source where id = 1 returning last_ping;
$$;
grant execute on function public.keep_alive(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Realtime:把資料表加進 supabase_realtime publication
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['families', 'family_members', 'people', 'parent_child', 'spouses'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- 已加入
    end;
  end loop;
end $$;
