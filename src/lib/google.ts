import { google } from "googleapis";
import { loadTokens, saveTokens } from "./store";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
];

export async function getOAuthClient() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const tokens = await loadTokens();
  if (tokens) client.setCredentials(tokens);

  client.on("tokens", (newTokens) => {
    // persist refreshed access tokens as they come in. This callback isn't
    // async-aware, so we fire-and-forget the save rather than blocking the
    // googleapis internals on it.
    loadTokens()
      .then((existing) => saveTokens({ ...(existing || {}), ...newTokens }))
      .catch((err) => console.error("Failed to persist refreshed tokens:", err));
  });

  return client;
}

export async function getAuthUrl() {
  const client = await getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = await getOAuthClient();
  const { tokens } = await client.getToken(code);
  await saveTokens(tokens);
  return tokens;
}

export async function isConnected() {
  return !!(await loadTokens());
}
