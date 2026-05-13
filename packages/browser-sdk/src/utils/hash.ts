/**
 * Compute a SHA-256 hex digest of a string using the Web Crypto API.
 *
 * Used to derive stable, non-reversible identifiers (for example, channel
 * names) from the publishable key. Not for security-sensitive purposes.
 *
 * @throws if the Web Crypto API is not available in the current environment.
 */
export async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis?.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error("Web Crypto API (crypto.subtle) is not available");
  }

  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
