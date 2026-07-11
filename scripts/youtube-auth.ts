import "dotenv/config";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";
import { google } from "googleapis";

type AuthSlot = "english" | "german" | "spanish" | "french" | "portuguese";

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
  portuguese: {
    refreshTokenEnvVar: "YOUTUBE_REFRESH_TOKEN_PORTUGUESE",
    channelIdEnvVar: "YOUTUBE_CHANNEL_ID_PORTUGUESE",
    label: "Portuguese",
  },
};

const LOCALHOST_HOSTS = new Set(["localhost", "127.0.0.1"]);

function printUsageAndExit(): never {
  console.log(
    [
      "Usage: tsx scripts/youtube-auth.ts [--slot <english|german|spanish|french|portuguese>]",
      "",
      "Examples:",
      "  pnpm youtube:auth:english",
      "  pnpm youtube:auth:german",
      "  pnpm youtube:auth:portuguese",
      "  pnpm youtube:auth -- --slot spanish",
    ].join("\n"),
  );
  process.exit(0);
}

export function parseSlot(
  argv: readonly string[],
): {
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
    `Invalid --slot value: ${rawSlot}. Expected one of english, german, spanish, french, portuguese.`,
  );
}

function escapeDotEnvValue(value: string): string {
  return JSON.stringify(value);
}

export async function updateDotEnvFile(args: {
  readonly dotenvPath: string;
  readonly updates: Readonly<Record<string, string>>;
}): Promise<void> {
  let current = "";
  try {
    current = await fs.readFile(args.dotenvPath, "utf8");
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const lines = current.length > 0 ? current.split(/\r?\n/u) : [];
  const nextLines = [...lines];
  const pending = new Map(
    Object.entries(args.updates).map(([key, value]) => [key, `${key}=${escapeDotEnvValue(value)}`]),
  );

  for (let index = 0; index < nextLines.length; index += 1) {
    const line = nextLines[index];
    if (!line || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/u.exec(line);
    if (!match) {
      continue;
    }
    const key = match[1];
    const replacement = pending.get(key);
    if (!replacement) {
      continue;
    }
    nextLines[index] = replacement;
    pending.delete(key);
  }

  if (pending.size > 0) {
    const additions = [...pending.values()];
    const hasVisibleContent = nextLines.some((line) => line.trim().length > 0);
    if (hasVisibleContent) {
      while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
        nextLines.pop();
      }
      nextLines.push("");
    }
    nextLines.push(...additions);
  }

  const output = `${nextLines.join("\n").replace(/\n*$/u, "")}\n`;
  await fs.writeFile(args.dotenvPath, output, "utf8");
}

function openBrowser(url: string): boolean {
  const command =
    process.platform === "darwin"
      ? { bin: "open", args: [url] }
      : process.platform === "win32"
        ? { bin: "cmd", args: ["/c", "start", "", url] }
        : { bin: "xdg-open", args: [url] };

  try {
    const child = spawn(command.bin, command.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function validateRedirectUri(rawRedirectUri: string): {
  readonly redirectUri: string;
  readonly redirectUrl: URL;
  readonly port: number;
} {
  const redirectUrl = new URL(rawRedirectUri);
  if (
    redirectUrl.protocol !== "http:" ||
    !LOCALHOST_HOSTS.has(redirectUrl.hostname)
  ) {
    throw new Error(
      "This local authorization script requires a localhost HTTP redirect URI.",
    );
  }

  const port = redirectUrl.port ? Number.parseInt(redirectUrl.port, 10) : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`Invalid redirect URI port: ${redirectUrl.port}`);
  }

  return {
    redirectUri: rawRedirectUri,
    redirectUrl,
    port,
  };
}

async function run(): Promise<void> {
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

  const { redirectUrl, port } = validateRedirectUri(redirectUri);

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri,
  );

  const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
  });

  const dotenvPath = path.join(process.cwd(), ".env");

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
        "YouTube authorization succeeded. Credentials were written to .env. You may close this window.",
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
        return;
      }

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

      const updates: Record<string, string> = {
        [slotConfig.refreshTokenEnvVar]: tokens.refresh_token,
      };
      if (channel?.id) {
        updates[slotConfig.channelIdEnvVar] = channel.id;
      }

      await updateDotEnvFile({
        dotenvPath,
        updates,
      });

      console.log(`Updated ${path.relative(process.cwd(), dotenvPath) || ".env"}:`);
      console.log(`- ${slotConfig.refreshTokenEnvVar}`);
      if (channel?.id) {
        console.log(`- ${slotConfig.channelIdEnvVar}`);
      }
      if (channel?.snippet?.title) {
        console.log(`Authorized channel (${slot}): ${channel.snippet.title}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
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
    const opened = openBrowser(authorizationUrl);
    if (opened) {
      console.log("Opened browser for Google OAuth.");
    } else {
      console.log("\nOpen this URL in your browser:\n");
      console.log(authorizationUrl);
    }
    console.log(`\nWaiting for OAuth callback at ${redirectUri}`);
  });
}

const entryArg = process.argv[1];
const isEntrypoint =
  typeof entryArg === "string" &&
  import.meta.url === pathToFileURL(path.resolve(entryArg)).href;

if (isEntrypoint) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
