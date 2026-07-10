import "dotenv/config";

import { createServer } from "node:http";
import { URL } from "node:url";
import { google } from "googleapis";

type AuthSlot = "english" | "german" | "spanish" | "french";

interface SlotConfig {
  readonly refreshTokenEnvVar: string;
  readonly channelIdEnvVar: string;
  readonly label: string;
}

const SLOT_CONFIG: Record<AuthSlot, SlotConfig> = {
  english: {
    refreshTokenEnvVar: "YOUTUBE_REFRESH_TOKEN",
    channelIdEnvVar: "YOUTUBE_CHANNEL_ID",
    label: "English/default",
  },
  german: {
    refreshTokenEnvVar: "YOUTUBE_REFRESH_TOKEN_GERMAN",
    channelIdEnvVar: "YOUTUBE_CHANNEL_ID_GERMAN",
    label: "German",
  },
  spanish: {
    refreshTokenEnvVar: "YOUTUBE_REFRESH_TOKEN_SPANISH",
    channelIdEnvVar: "YOUTUBE_CHANNEL_ID_SPANISH",
    label: "Spanish",
  },
  french: {
    refreshTokenEnvVar: "YOUTUBE_REFRESH_TOKEN_FRENCH",
    channelIdEnvVar: "YOUTUBE_CHANNEL_ID_FRENCH",
    label: "French",
  },
};

function printUsageAndExit(): never {
  console.log(
    [
      "Usage: tsx scripts/youtube-auth.ts [--slot <english|german|spanish|french>]",
      "",
      "Examples:",
      "  pnpm youtube:auth:english",
      "  pnpm youtube:auth:german",
      "  pnpm youtube:auth -- --slot german",
    ].join("\n"),
  );
  process.exit(0);
}

function parseSlot(argv: readonly string[]): {
  readonly slot: AuthSlot;
  readonly config: SlotConfig;
} {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsageAndExit();
  }

  let rawSlot: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--slot") {
      rawSlot = argv[index + 1];
      break;
    }
    if (value.startsWith("--slot=")) {
      rawSlot = value.slice("--slot=".length);
      break;
    }
  }

  const normalized = (rawSlot ?? "english").trim().toLowerCase();

  if (normalized in SLOT_CONFIG) {
    const slot = normalized as AuthSlot;
    return { slot, config: SLOT_CONFIG[slot] };
  }

  throw new Error(
    `Invalid --slot value: ${rawSlot}. Expected one of english, german, spanish, french.`,
  );
}

const { slot, config: slotConfig } = parseSlot(process.argv.slice(2));

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

    console.log(`\nAuthorization succeeded for ${slotConfig.label}.`);

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
      oauth2Client.setCredentials(tokens);
      const youtube = google.youtube({
        version: "v3",
        auth: oauth2Client,
      });
      const channelResponse = await youtube.channels.list({
        part: ["id", "snippet"],
        mine: true,
      });
      const channel = channelResponse.data.items?.[0];

      console.log("\nAdd these values to your local .env file:\n");
      console.log(`${slotConfig.refreshTokenEnvVar}=${tokens.refresh_token}`);
      if (channel?.id) {
        console.log(`${slotConfig.channelIdEnvVar}=${channel.id}`);
      }
      if (channel?.snippet?.title) {
        console.log(
          `# Authorized channel (${slot}): ${channel.snippet.title}`,
        );
      }
      console.log("\nDo not commit or share this value.");
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
  console.log(`\nAuthorizing YouTube slot: ${slotConfig.label}`);
  console.log("\nOpen this URL in your browser:\n");
  console.log(authorizationUrl);
  console.log(
    `\nWaiting for OAuth callback at ${redirectUri}`,
  );
});
