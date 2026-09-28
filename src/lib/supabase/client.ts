import { createBrowserClient } from "@supabase/ssr";

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// One client per page. Separate instances keep their own auth state and each writes the session
// cookies on its own, so a sign-in made through one of them (the app's native Google flow) never
// reached the AuthProvider listening on another, and the screen stayed where it was.
let client: ReturnType<typeof makeClient> | null = null;

export function createClient() {
  if (!client) client = makeClient();
  return client;
}
