-- Add contact fields to profiles (run in Supabase SQL editor if schema already deployed)
alter table profiles add column if not exists email text;
alter table profiles add column if not exists phone text;
