-- ChemAI: the AI keys of the Supabase functions (iris-chat, iris-vision) kept in the Vault, for
-- when they are not set as function secrets. Only the service role (the functions themselves) may
-- read them; the app and signed-in users cannot. The keys themselves are stored separately, never
-- in this repository:
--   select vault.create_secret('<key>', 'GROQ_API_KEY');
--   select vault.update_secret(id, '<new key>') from vault.secrets where name = 'GROQ_API_KEY';

create or replace function public.iris_ai_keys()
returns table (name text, secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.decrypted_secret
  from vault.decrypted_secrets as s
  where s.name in ('NVIDIA_API_KEY', 'GROQ_API_KEY', 'GEMINI_API_KEY');
$$;

revoke all on function public.iris_ai_keys() from public, anon, authenticated;
grant execute on function public.iris_ai_keys() to service_role;
