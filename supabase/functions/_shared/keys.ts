// ChemAI: the AI keys of the Supabase functions - from the function's secrets (supabase secrets
// set …) or, when a key is not there, from the project's Vault (stored with SQL, e.g. through the
// Supabase connector: select vault.create_secret('<key>', 'GROQ_API_KEY')). The Vault is read
// through iris_ai_keys() (supabase/migrations), which only the service role may call; the keys
// never reach the app.

const NAMES = ["NVIDIA_API_KEY", "GROQ_API_KEY", "GEMINI_API_KEY"] as const;
export type KeyName = (typeof NAMES)[number];
export type AiKeys = Partial<Record<KeyName, string>>;

/** The Vault is read again after this long, so a key changed there is picked up. */
const TTL_MS = 5 * 60_000;
let vault: { at: number; keys: AiKeys } | null = null;

async function readVault(): Promise<AiKeys> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return {};
  const keys: AiKeys = {};
  try {
    const res = await fetch(`${url}/rest/v1/rpc/iris_ai_keys`, {
      method: "POST",
      // A legacy service-role JWT also goes as the bearer; a new secret key (sb_secret_…) only as apikey.
      headers: { apikey: service, ...(service.startsWith("ey") ? { Authorization: `Bearer ${service}` } : {}), "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("vault keys", res.status, (await res.text()).slice(0, 200));
      return {};
    }
    for (const row of (await res.json()) as { name?: string; secret?: string }[]) {
      if (NAMES.includes(row.name as KeyName) && row.secret) keys[row.name as KeyName] = row.secret;
    }
  } catch (error) {
    console.error("vault keys", error);
  }
  return keys;
}

/** The keys this function can use: its own secrets first, the Vault for the rest. */
export async function aiKeys(): Promise<AiKeys> {
  const env: AiKeys = {};
  for (const name of NAMES) {
    const value = Deno.env.get(name);
    if (value) env[name] = value;
  }
  if (NAMES.every((name) => env[name])) return env;
  if (!vault || Date.now() - vault.at > TTL_MS) vault = { at: Date.now(), keys: await readVault() };
  return { ...vault.keys, ...env };
}
