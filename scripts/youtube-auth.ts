import "dotenv/config";

import { createServer } from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
const redirectUri =
  process.env.YOUTUBE_REDIRECT_URI ??
  "http://localhost:3000/oauth2callback";

if (!clientId || !clientSecret) {
  throw new Error(
    "Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in .env",
  );
}

const redirectUrl = new URL(redirectUri);

if (
  redirectUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(redirectUrl.hostname)
) {
  throw new Error(
    "This local authorization script requires a localhost HTTP redirect URI.",
  );
}

const port = redirectUrl.port
  ? Number.parseInt(redirectUrl.port, 10)
  : 80;

if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid redirect URI port: ${redirectUrl.port}`);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  redirectUri,
);

const authorizationUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",

  /*
   * Google may only return a refresh token during the first consent.
   * "consent" forces the consent screen so a new token can be issued.
   */
  prompt: "consent",

  scope: [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
  ],
});

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      response.writeHead(400);
      response.end("Missing callback URL.");
      return;
    }

    const callbackUrl = new URL(
      request.url,
      `http://${request.headers.host}`,
    );

    if (callbackUrl.pathname !== redirectUrl.pathname) {
      response.writeHead(404);
      response.end("Not found.");
      return;
    }

    const oauthError = callbackUrl.searchParams.get("error");

    if (oauthError) {
      response.writeHead(400, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(`Authorization failed: ${oauthError}`);
      server.close();
      return;
    }

    const code = callbackUrl.searchParams.get("code");

    if (!code) {
      response.writeHead(400, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Authorization code was not returned.");
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end(
      "YouTube authorization succeeded. You may close this window.",
    );

    console.log("\nAuthorization succeeded.");

    if (!tokens.refresh_token) {
      console.error(
        [
          "",
          "Google did not return a refresh token.",
          "Remove the application's existing access from your Google Account",
          "and run this command again with prompt=consent.",
        ].join("\n"),
      );
    } else {
      console.log("\nAdd this value to your local .env file:\n");
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log(
        "\nDo not commit or share this value.",
      );
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error(`Token exchange failed: ${message}`);

    if (!response.headersSent) {
      response.writeHead(500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Token exchange failed.");
    }
  } finally {
    server.close();
  }
});

server.listen(port, redirectUrl.hostname, () => {
  console.log("\nOpen this URL in your browser:\n");
  console.log(authorizationUrl);
  console.log(
    `\nWaiting for OAuth callback at ${redirectUri}`,
  );
});
