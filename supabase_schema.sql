-- Enable RLS
alter table if exists public.titles enable row level security;
alter table if exists public.logs enable row level security;
alter table if exists public.sites enable row level security;

-- Create reading_sessions table
create table if not exists public.reading_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  title_id text not null, -- Using text to match existing title.id which is string
  chapter numeric not null,
  site text,
  opened_url text,
  created_at timestamptz default now()
);

alter table public.reading_sessions enable row level security;

create policy "Users can insert their own reading sessions"
  on public.reading_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own reading sessions"
  on public.reading_sessions for select
  using (auth.uid() = user_id);

-- Create chapter_sources table
create table if not exists public.chapter_sources (
  id uuid default gen_random_uuid() primary key,
  series_id text not null,
  chapter numeric not null,
  source_name text not null,
  source_url text not null,
  release_time timestamptz,
  created_at timestamptz default now()
);

-- Allow public read access to chapter sources (or authenticated)
alter table public.chapter_sources enable row level security;

create policy "Authenticated users can view chapter sources"
  on public.chapter_sources for select
  using (auth.role() = 'authenticated');

-- Create site_domains table
create table if not exists public.site_domains (
  id uuid default gen_random_uuid() primary key,
  site_name text not null unique,
  primary_domain text not null,
  alternate_domains text[],
  created_at timestamptz default now()
);

alter table public.site_domains enable row level security;

create policy "Authenticated users can view site domains"
  on public.site_domains for select
  using (auth.role() = 'authenticated');

-- Update titles table
alter table public.titles add column if not exists latest_chapter numeric default 0;
alter table public.titles add column if not exists preferred_source text;
alter table public.titles add column if not exists rating numeric default 0;

-- Create recommendations table
create table if not exists public.recommendations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) not null,
  title text not null,
  cover text,
  tags text[],
  source_title text, -- "Because you liked..."
  score numeric,
  created_at timestamptz default now()
);

alter table public.recommendations enable row level security;

create policy "Users can view their own recommendations"
  on public.recommendations for select
  using (auth.uid() = user_id);

-- Storage bucket for covers
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "Cover images are publicly accessible"
  on storage.objects for select
  using ( bucket_id = 'covers' );

create policy "Authenticated users can upload covers"
  on storage.objects for insert
  with check ( bucket_id = 'covers' and auth.role() = 'authenticated' );
