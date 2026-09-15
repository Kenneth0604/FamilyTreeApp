-- ============================================================================
-- FamilyTreeApp — 初始化 Schema
-- 在 Supabase Dashboard → SQL Editor 直接執行整份檔案(可重複執行)。
--
-- 資料模型:
--   families        家族群組
--   family_codes    每個家族兩種邀請碼:invite_code 加入後可編輯、view_code 加入後只能查看(只有 editor 讀得到)
--   family_members  「某個登入帳號在某個家族中的身分」(role editor / viewer、self / viewpoint / 進階模式)
--   people          家族樹上的每一個人(大多數沒有帳號;nicknames 小名、tags 自訂標籤、birth_order 排行、stats 遊戲式屬性分數、power 戰力 / 家庭地位)
--   person_entries  生平紀事:每人多筆履歷式條列(職業 / 學歷 / 事蹟 / 健康疾病 / 居住地 / 榮譽 / 其他),含起迄時間
--   pets            寵物(名字、品種、主人、評分)
--   households      小家庭:一群人的 id 陣列 + 名稱 / 顏色,樹狀圖用虛線圈起來
--   parent_child    親子邊(有方向)
--   spouses         配偶 / 伴侶邊(無方向;married / widowed / partner 未婚伴侶 / divorced / ex_partner 前伴侶)
-- 兄弟姊妹、叔伯、堂表…全部由前端的稱謂引擎以最短路徑推算,不另外儲存。
--
-- RLS:所有表都以「family_id 是否在該使用者所屬的 family_members 中」判斷讀取;寫入另需 role = editor。
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 資料表
-- ----------------------------------------------------------------------------
create table if not exists public.families (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_at   timestamptz not null default now()
);

-- 邀請碼獨立成表,RLS 只讓 editor 讀(viewer 若讀得到編輯邀請碼就能自行升級)
drop function if exists public.family_codes(uuid); -- 舊版曾用同名 RPC
create table if not exists public.family_codes (
  family_id    uuid primary key references public.families(id) on delete cascade,
  invite_code  text not null unique,   -- 加入後可編輯
  view_code    text not null unique    -- 加入後只能查看
);

create table if not exists public.family_members (
  id                   uuid primary key default gen_random_uuid(),
  family_id            uuid not null references public.families(id) on delete cascade,
  auth_user_id         uuid not null references auth.users(id) on delete cascade,
  display_name         text not null,
  role                 text not null default 'editor' check (role in ('editor', 'viewer')),
  self_person_id       uuid,            -- FK 在 people 建好後補上
  viewpoint_person_id  uuid,
  advanced_terms       boolean not null default false,
  joined_at            timestamptz not null default now(),
  unique (family_id, auth_user_id)
);
alter table public.family_members add column if not exists role text not null default 'editor';
alter table public.family_members drop constraint if exists family_members_role_check;
alter table public.family_members add constraint family_members_role_check check (role in ('editor', 'viewer'));

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
  status       text not null default 'married' check (status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner')),
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (person_a_id <> person_b_id)
);
-- 既有資料庫補上新的關係狀態(partner 未婚伴侶 / ex_partner 前伴侶)
alter table public.spouses drop constraint if exists spouses_status_check;
alter table public.spouses add constraint spouses_status_check check (status in ('married', 'widowed', 'partner', 'divorced', 'ex_partner'));
-- 同一對人只能有一筆配偶紀錄(不論 a / b 順序)
create unique index if not exists spouses_pair_unique
  on public.spouses (least(person_a_id, person_b_id), greatest(person_a_id, person_b_id));

-- 小名 / 別名(可多個),顯示在姓名旁
alter table public.people add column if not exists nicknames text[] not null default '{}';
-- 自訂標籤(例如 ADHD、左撇子)
alter table public.people add column if not exists tags text[] not null default '{}';
-- 遊戲角色式屬性:{ 屬性 id: 0..10 },沒評的不放
alter table public.people add column if not exists stats jsonb not null default '{}'::jsonb;
-- 政治立場:blue / green / white,null = 不標示
alter table public.people add column if not exists politics text check (politics is null or politics in ('blue', 'green', 'white'));
-- 兄弟姊妹排行(1 = 老大);不知道實際年齡時用來判斷長幼
alter table public.people add column if not exists birth_order smallint check (birth_order is null or birth_order between 1 and 99);
-- 戰力(家庭地位)0..10,預設 5;數字越大樹狀圖卡片越大
alter table public.people add column if not exists power smallint not null default 5 check (power between 0 and 10);

-- 生平紀事:履歷式條列。每人依類別(職業 / 學歷 / 事蹟 / 居住地 / 榮譽 / 其他)列出多筆,每筆可填起迄時間
create table if not exists public.person_entries (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  person_id   uuid not null references public.people(id) on delete cascade,
  category    text not null check (category in ('career', 'education', 'event', 'health', 'residence', 'award', 'other')),
  title       text not null check (length(trim(title)) > 0),
  detail      text not null default '',
  -- 與 birth_date 相同:'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD' 或 null
  start_date  text check (start_date is null or start_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  end_date    text check (end_date is null or end_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  ongoing     boolean not null default false,   -- 至今
  sort_order  int not null default 0,
  created_by  uuid references public.family_members(id) on delete set null,
  updated_by  uuid references public.family_members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- 既有資料庫補上新的類別(health 健康 / 疾病)
alter table public.person_entries drop constraint if exists person_entries_category_check;
alter table public.person_entries add constraint person_entries_category_check check (category in ('career', 'education', 'event', 'health', 'residence', 'award', 'other'));
create index if not exists person_entries_family_idx on public.person_entries(family_id);
create index if not exists person_entries_person_idx on public.person_entries(person_id);

-- 寵物:名字、品種、主人(可不指定)、生日、照片、遊戲式評分
create table if not exists public.pets (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families(id) on delete cascade,
  owner_person_id  uuid references public.people(id) on delete set null,
  name             text not null check (length(trim(name)) > 0),
  species          text not null default 'other' check (species in ('dog', 'cat', 'rabbit', 'bird', 'fish', 'hamster', 'turtle', 'reptile', 'other')),
  breed            text not null default '',
  gender           text not null default 'unspecified' check (gender in ('male', 'female', 'unspecified')),
  birth_date       text check (birth_date is null or birth_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'),
  is_deceased      boolean not null default false,
  avatar_url       text,
  note             text not null default '',
  stats            jsonb not null default '{}'::jsonb,
  created_by       uuid references public.family_members(id) on delete set null,
  updated_by       uuid references public.family_members(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists pets_family_idx on public.pets(family_id);
create index if not exists pets_owner_idx  on public.pets(owner_person_id);

-- 小家庭:圈選一群同住 / 同一戶的人,樹狀圖用虛線框起來
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  color        text not null default 'primary',
  person_ids   uuid[] not null default '{}',
  created_by   uuid references public.family_members(id) on delete set null,
  updated_by   uuid references public.family_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists households_family_idx on public.households(family_id);

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

drop trigger if exists person_entries_touch on public.person_entries;
create trigger person_entries_touch before update on public.person_entries
  for each row execute function public.touch_updated_at();

drop trigger if exists pets_touch on public.pets;
create trigger pets_touch before update on public.pets
  for each row execute function public.touch_updated_at();

drop trigger if exists households_touch on public.households;
create trigger households_touch before update on public.households
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

-- 可編輯的成員(role = editor);viewer 只能讀
create or replace function public.is_family_editor(p_family_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = p_family_id and m.auth_user_id = auth.uid() and m.role = 'editor'
  );
$$;
grant execute on function public.is_family_editor(uuid) to authenticated;

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

-- 產生一個兩種邀請碼都沒用過的新碼
create or replace function public.gen_unique_family_code()
returns text language plpgsql volatile as $$
declare
  code text;
begin
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.family_codes where invite_code = code or view_code = code);
  end loop;
  return code;
end $$;

-- 舊版把邀請碼放在 families 欄位:搬進 family_codes 後移除欄位
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'families' and column_name = 'invite_code') then
    insert into public.family_codes (family_id, invite_code, view_code)
      select id, invite_code, public.gen_unique_family_code() from public.families
      on conflict (family_id) do nothing;
    alter table public.families drop column invite_code;
  end if;
  alter table public.families drop column if exists view_code;
end $$;
-- 尚無邀請碼的家族補上
insert into public.family_codes (family_id, invite_code, view_code)
  select id, public.gen_unique_family_code(), public.gen_unique_family_code() from public.families
  on conflict (family_id) do nothing;
-- 舊版曾把 families 的欄位讀取權限收掉,還原成整表可讀(RLS 仍限制只有成員看得到)
grant select on public.families to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC:建立家族 / 用邀請碼加入 / 重新產生邀請碼
-- ----------------------------------------------------------------------------
create or replace function public.create_family(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  fid  uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception '請輸入家族名稱'; end if;
  insert into public.families (name) values (trim(p_name)) returning id into fid;
  insert into public.family_codes (family_id, invite_code, view_code)
    values (fid, public.gen_unique_family_code(), public.gen_unique_family_code());
  insert into public.family_members (family_id, auth_user_id, display_name, role)
    values (fid, auth.uid(), coalesce(nullif(trim(p_display_name), ''), '成員'), 'editor');
  return fid;
end $$;
grant execute on function public.create_family(text, text) to authenticated;

-- 一個入口吃兩種邀請碼:編輯邀請碼 → editor(原本是 viewer 的會升級);查看邀請碼 → viewer(已是成員的不會被降級)
drop function if exists public.join_family(text, text);          -- 參數改名,create or replace 不允許
drop function if exists public.join_family_as_viewer(text, text); -- 舊版
create or replace function public.join_family(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c    text := upper(trim(p_code));
  fid  uuid;
  nm   text := coalesce(nullif(trim(p_display_name), ''), '成員');
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select family_id into fid from public.family_codes where invite_code = c;
  if fid is not null then
    insert into public.family_members (family_id, auth_user_id, display_name, role)
      values (fid, auth.uid(), nm, 'editor')
      on conflict (family_id, auth_user_id) do update set role = 'editor';
    return fid;
  end if;
  select family_id into fid from public.family_codes where view_code = c;
  if fid is not null then
    insert into public.family_members (family_id, auth_user_id, display_name, role)
      values (fid, auth.uid(), nm, 'viewer')
      on conflict (family_id, auth_user_id) do nothing;
    return fid;
  end if;
  raise exception '找不到這個邀請碼';
end $$;
grant execute on function public.join_family(text, text) to authenticated;

create or replace function public.regenerate_invite_code(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_family_editor(p_family_id) then raise exception '只有可編輯的成員才能重新產生邀請碼'; end if;
  code := public.gen_unique_family_code();
  update public.family_codes set invite_code = code where family_id = p_family_id;
  return code;
end $$;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;

create or replace function public.regenerate_view_code(p_family_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  code text;
begin
  if not public.is_family_editor(p_family_id) then raise exception '只有可編輯的成員才能重新產生邀請碼'; end if;
  code := public.gen_unique_family_code();
  update public.family_codes set view_code = code where family_id = p_family_id;
  return code;
end $$;
grant execute on function public.regenerate_view_code(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.families       enable row level security;
alter table public.family_codes   enable row level security;
alter table public.family_members enable row level security;
alter table public.people         enable row level security;
alter table public.parent_child   enable row level security;
alter table public.spouses        enable row level security;
alter table public.person_entries enable row level security;
alter table public.pets           enable row level security;
alter table public.households     enable row level security;

drop policy if exists "families member select" on public.families;
drop policy if exists "families member update" on public.families;
create policy "families member select" on public.families for select to authenticated
  using (public.is_family_member(id));
create policy "families member update" on public.families for update to authenticated
  using (public.is_family_editor(id)) with check (public.is_family_editor(id));
-- insert 一律經由 RPC(security definer)

-- 兩種邀請碼只有 editor 看得到;寫入一律經由 RPC
drop policy if exists "family_codes editor select" on public.family_codes;
create policy "family_codes editor select" on public.family_codes for select to authenticated
  using (public.is_family_editor(family_id));

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

-- 家族樹資料:所有成員可讀,只有 editor 可寫
do $$
declare t text;
begin
  foreach t in array array['people', 'parent_child', 'spouses', 'person_entries', 'pets', 'households'] loop
    execute format('drop policy if exists %I on public.%I', t || ' member all', t);
    execute format('drop policy if exists %I on public.%I', t || ' member select', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor insert', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor update', t);
    execute format('drop policy if exists %I on public.%I', t || ' editor delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_family_member(family_id))', t || ' member select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_family_editor(family_id))', t || ' editor insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_family_editor(family_id)) with check (public.is_family_editor(family_id))', t || ' editor update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_family_editor(family_id))', t || ' editor delete', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Storage:大頭照(公開讀取;路徑第一段為 family_id,只有該家族的 editor 可上傳 / 刪除)
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
  with check (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));
create policy "avatars member update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));
create policy "avatars member delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_family_editor(((storage.foldername(name))[1])::uuid));

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
  foreach t in array array['families', 'family_codes', 'family_members', 'people', 'parent_child', 'spouses', 'person_entries', 'pets', 'households'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then
      null; -- 已加入
    end;
  end loop;
end $$;
