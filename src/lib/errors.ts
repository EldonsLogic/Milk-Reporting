// Supabase's client throws PostgrestError/AuthError - plain objects with a
// `.message` string, but NOT `instanceof Error` - so `err instanceof Error`
// checks silently fall through to a generic fallback and hide the actual
// database/auth error every time a Supabase call fails. Use this instead
// anywhere an unknown caught value needs to become a display string.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  return fallback;
}
