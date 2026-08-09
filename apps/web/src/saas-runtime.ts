import crypto from "node:crypto";
import http from "node:http";
import { OidcBff, type OidcBffOptions } from "./oidc-bff.js";
import {
  ApiProblemError,
  type CapabilityRegistry,
  type EpisodeInput,
  type ProjectSummary,
} from "@mediaforge/api-sdk";
import { renderGenreSpeechSettings } from "./speech-administration.js";
import type { SaasJourneyGateway } from "./saas-api-bff.js";
import type { RecentAuthConfirmationConsumer } from "./recent-auth-step-up.js";

export type SaasProfile =
  | "mathematics_education"
  | "history"
  | "dark_truth"
  | "strategic_reinvention";

export interface SaasSession {
  /** Stable tenant boundary used only by the BFF's server-side API client. */
  readonly workspaceId: string;
  /** Stable directory principal ID; never infer this from the display name. */
  readonly principalId: string;
  readonly principalName: string;
  readonly workspaceName: string;
  readonly profiles: readonly SaasProfile[];
}

export interface SaasIdentity {
  readonly session: SaasSession;
  /** Never rendered, serialized, or placed in a browser cookie. */
  readonly accessToken?: string;
  /** OIDC BFF session ID; server-only CSRF binding for step-up confirmations. */
  readonly csrfSessionId?: string;
}

export interface SaasRuntimeOptions {
  /**
   * The BFF resolves its own secure session. This boundary never returns an
   * access token, API key, or provider credential to the rendered document.
   */
  readonly resolveSession: (
    request: http.IncomingMessage
  ) => Promise<SaasSession | null>;
  readonly maxRequestBytes?: number;
  readonly oidc?: OidcBffOptions;
  /** Resolves a server-side identity for non-OIDC deployments. */
  readonly resolveIdentity?: (request: http.IncomingMessage) => Promise<SaasIdentity | null>;
  /** Optional typed API gateway. Without it, all mutating controls stay absent. */
  readonly journey?: SaasJourneyGateway;
  /** Platform capability, supplied server-side. Omitted means publication is off. */
  readonly publicationExecutionEnabled?: boolean;
  /** Local fixture only: permits demo form posts when a preview proxy strips origin headers. */
  readonly allowUnverifiedDemoFormPosts?: boolean;
  /** Server-composition adapter for one-time step-up consumption. */
  readonly recentAuthConsumer?: RecentAuthConfirmationConsumer;
}

const profileLabels: Readonly<Record<SaasProfile, string>> = {
  mathematics_education: "Mathematics education",
  history: "History",
  dark_truth: "Dark Truth",
  strategic_reinvention: "Veronica Benini strategic reinvention",
};


const localeLabels: Readonly<Record<"en" | "de" | "es" | "fr" | "it" | "pt", string>> = {
  en: "English", de: "German", es: "Spanish", fr: "French", it: "Italian", pt: "Portuguese",
};

const historyPresetLabels: Readonly<Record<string, string>> = {
  "military-campaign": "Military campaign",
  "civilization-rise-fall": "Rise and fall of a civilization",
  "historical-biography": "Historical biography",
  "archaeology-mystery": "Archaeology mystery",
  "world-war-geopolitics": "World war and geopolitics",
  "royal-court-intrigue": "Royal court intrigue",
  "everyday-life": "Everyday life",
  "disaster-pandemic-survival": "Disaster, pandemic, and survival",
  "technology-trade-transformation": "Technology, trade, and transformation",
  "dark-strange-history": "Dark and strange history",
};

const responseStyleNonces = new WeakMap<http.ServerResponse, string>();

function applyStyleNonce(response: http.ServerResponse, html: string): string {
  return html.replaceAll("__MEDIAFORGE_STYLE_NONCE__", responseStyleNonces.get(response) ?? "");
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function document(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style nonce="__MEDIAFORGE_STYLE_NONCE__">:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#162033;background:#f5f7fb}*{box-sizing:border-box}body{margin:0}.layout{min-height:100vh;display:grid;grid-template-columns:250px 1fr}.sidebar{background:#111b34;color:#e9efff;padding:28px 18px}.brand{font-weight:800;font-size:20px;letter-spacing:-.04em;margin:0 0 34px}.brand span{color:#7ee1c3}.workspace{padding:13px;background:#1c294a;border:1px solid #314269;border-radius:12px;margin-bottom:28px;font-size:13px}.workspace strong{display:block;font-size:14px}.nav{display:grid;gap:5px}.nav a{color:#bdc9e6;text-decoration:none;padding:10px 12px;border-radius:9px;font-size:14px}.nav a:hover,.nav a[aria-current=page]{background:#27385f;color:#fff}.main{max-width:1200px;width:100%;padding:40px;margin:0 auto}.eyebrow{color:#5c6b8a;font-size:12px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.hero{display:flex;justify-content:space-between;gap:24px;align-items:start;margin-bottom:28px}.hero h1{font-size:32px;letter-spacing:-.045em;margin:6px 0 8px}.hero p{color:#53627e;margin:0;max-width:650px}.button{display:inline-block;border:0;background:#2557d6;color:#fff;text-decoration:none;padding:10px 14px;border-radius:9px;font-weight:700;font-size:14px;cursor:pointer}.button.secondary{background:#eef1f7;color:#263653}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.card{background:#fff;border:1px solid #e1e6f0;border-radius:14px;padding:20px;box-shadow:0 3px 12px #14204a09}.card h2{font-size:16px;margin:0 0 7px}.card p{font-size:14px;line-height:1.5;color:#5e6c86;margin:0}.metric{font-size:28px;font-weight:780;letter-spacing:-.04em;margin:12px 0 3px}.stack{display:grid;gap:12px}.row{background:#fff;border:1px solid #e1e6f0;border-radius:12px;padding:16px;display:flex;justify-content:space-between;gap:18px;align-items:center}.row strong{display:block}.row span{font-size:13px;color:#62708a}.tag{font-size:12px;border-radius:999px;background:#e9f8f2;color:#14735b;padding:5px 9px;font-weight:700;white-space:nowrap}.tag.neutral{background:#eef1f7;color:#53627e}.notice,.alert{border-left:4px solid #e6aa36;background:#fff8e7;padding:14px 16px;border-radius:0 10px 10px 0;color:#654b18;font-size:14px}.alert{border-color:#d44b4b;background:#fff0f0;color:#7c2424}.empty{padding:38px;text-align:center;border:1px dashed #b8c4db;border-radius:14px;color:#5d6c88;background:#fafcff}.empty h2{margin:0 0 8px;color:#283653;font-size:18px}.steps{counter-reset:step;display:grid;gap:12px}.step{background:#fff;border:1px solid #e1e6f0;border-radius:12px;padding:15px 16px}.step:before{counter-increment:step;content:counter(step);display:inline-grid;place-items:center;width:23px;height:23px;margin-right:9px;border-radius:50%;background:#eaf0ff;color:#2557d6;font-weight:800;font-size:12px}.form{display:grid;gap:14px;max-width:720px}.field{display:grid;gap:6px;font-weight:700;font-size:14px}.field input,.field select,.field textarea{font:inherit;font-weight:400;border:1px solid #b8c4db;border-radius:9px;padding:10px;background:#fff;color:#162033}.field textarea{min-height:100px;resize:vertical}.hint{font-weight:400;color:#61708b;font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap}.link-row{text-decoration:none;color:inherit}.link-row:hover{border-color:#8ba5ed}.link-row strong{color:#1f3f91}@media(max-width:760px){.layout{grid-template-columns:1fr}.sidebar{padding:18px}.brand{margin-bottom:18px}.nav{grid-template-columns:repeat(3,1fr)}.nav a{font-size:12px;padding:8px}.main{padding:26px 18px}.hero{display:block}.hero .button{margin-top:18px}.grid{grid-template-columns:1fr}}</style></head><body>${body}</body></html>`;
}

export function renderSignedOutShell(): string {
  return document(
    "MediaForge sign in",
    '<h1>MediaForge</h1><p>Sign in through your workspace identity provider to continue.</p><p role="status">No workspace session is active.</p>'
  );
}

const navigation = [
  ["/", "Overview"], ["/projects", "Projects"], ["/episodes", "Episodes"],
  ["/workflows", "Workflows"], ["/reviews", "Review"], ["/assets", "Assets"],
  ["/publishing", "Publishing"], ["/usage", "Usage"], ["/integrations", "Integrations"], ["/settings", "Settings"],
] as const;

function shell(session: SaasSession, path: string, title: string, subtitle: string, content: string, action?: string): string {
  const nav = navigation.map(([href, label]) => `<a href="${href}"${path === href ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return document(title, `<div class="layout"><aside class="sidebar"><p class="brand">media<span>forge</span></p><div class="workspace"><strong>${escapeHtml(session.workspaceName)}</strong>${escapeHtml(session.principalName)} · Internal pilot</div><nav class="nav" aria-label="Primary">${nav}</nav></aside><main class="main"><div class="hero"><div><div class="eyebrow">Workspace</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>${action ?? ""}</div>${content}</main></div>`);
}

function empty(title: string, text: string, action?: string): string {
  return `<section class="empty"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${action ? `<p><a class="button" href="${action}">Get started</a></p>` : ""}</section>`;
}

function renderPage(session: SaasSession, path: string): string {
  if (path === "/") return shell(session, path, "A calm start to production", "See what needs attention, then move one episode forward with confidence.", `<div class="grid"><section class="card"><h2>Ready to start</h2><div class="metric">0</div><p>Episodes are waiting for a brief.</p></section><section class="card"><h2>In progress</h2><div class="metric">0</div><p>Workflow status will appear here as work begins.</p></section><section class="card"><h2>Needs review</h2><div class="metric">0</div><p>Human decisions stay visible and auditable.</p></section></div><section class="card" style="margin-top:16px"><h2>Available profiles</h2><p>${[...new Set(session.profiles)].map((profile) => escapeHtml(profileLabels[profile])).join(" · ") || "No production profiles are entitled for this workspace."}</p></section><div class="notice" style="margin-top:20px">This is a provider-free internal pilot. Publication and paid generation controls are intentionally unavailable.</div>`, `<a class="button" href="/projects/new">Create project</a>`);
  if (path === "/projects/new") return shell(session, path, "Create a project", "Choose an entitled profile. You can revise the episode brief before any workflow starts.", `<div class="steps"><div class="step"><strong>Choose a profile</strong><p>Only profiles approved for this workspace appear here.</p></div><div class="step"><strong>Give the project a clear name</strong><p>Use a name your reviewers will recognize later.</p></div><div class="step"><strong>Create the first episode brief</strong><p>Review the fields before starting provider-free production.</p></div></div><div class="grid" style="margin-top:18px">${[...new Set(session.profiles)].map((profile) => `<section class="card"><h2>${escapeHtml(profileLabels[profile])}</h2><p>Available in this internal pilot.</p></section>`).join("")}</div>`);
  if (path === "/projects") return shell(session, path, "Projects", "Projects keep related episode briefs, artifacts, and workflow history together.", `${empty("No projects yet", "Create a project to organize your first episode and its review trail.", "/projects/new")}<p class="notice" style="margin-top:16px">Available profiles: ${[...new Set(session.profiles)].map((profile) => escapeHtml(profileLabels[profile])).join(" · ") || "none"}.</p>`, `<a class="button" href="/projects/new">Create project</a>`);
  if (path === "/episodes") return shell(session, path, "Episodes", "Each episode is versioned. Stale edits are surfaced before they can overwrite newer work.", empty("No episode briefs yet", "Start from a project, then add the first typed episode brief.", "/projects"));
  if (path === "/workflows") return shell(session, path, "Workflows", "Follow durable work from admission to a clear terminal state. Cancellation and resume remain explicit actions.", empty("No workflows are running", "When an episode starts, its status and step history will appear here."));
  if (path === "/reviews") return shell(session, path, "Review and approvals", "Approve only the exact artifact revision shown. Expired, stale, or revoked challenges remain safely blocked.", empty("Nothing needs review", "Completed artifacts that require a human decision will appear here."));
  if (path === "/assets") return shell(session, path, "Assets", "Review immutable metadata and validation results before requesting a controlled download.", empty("No approved assets", "Assets remain quarantined until validation completes."));
  if (path === "/usage") return shell(session, path, "Usage and audit", "Usage is append-only and easy to inspect. Billing is not enabled for this pilot.", `<div class="grid"><section class="card"><h2>External provider budget</h2><div class="metric">$0</div><p>Safe pilot ceiling.</p></section><section class="card"><h2>Concurrent workflows</h2><div class="metric">0 / 1</div><p>Workspace safety limit.</p></section><section class="card"><h2>Audit events</h2><div class="metric">0</div><p>Security-relevant actions appear here.</p></section></div>`);
  if (path === "/integrations") return shell(session, path, "Integrations", "Manage signed webhook deliveries and API access with least privilege.", `<div class="stack"><div class="row"><div><strong>Webhooks</strong><span>No endpoints configured. Deliveries remain disabled until an operator provisions a signed endpoint.</span></div><span class="tag neutral">Disabled</span></div><div class="row"><div><strong>API access</strong><span>Keys are operator-controlled, shown only once, and not stored in this browser.</span></div><span class="tag neutral">Operator only</span></div></div>`);
  if (path === "/settings") return shell(session, path, "Workspace settings", "Safety policies, entitlements, and identity membership are managed by an operator for this restricted pilot.", `<div class="stack"><div class="row"><div><strong>Identity and access</strong><span>Sign-in uses a server-side OIDC session; no reusable API token is exposed.</span></div><span class="tag">Protected</span></div><div class="row"><div><strong>Publication</strong><span>Private-first publication is disabled until external recovery evidence is approved.</span></div><span class="tag neutral">Disabled</span></div></div>`);
  return shell(session, path, "Page not found", "The page may have moved or is not available for this pilot.", `<p><a class="button" href="/">Return to overview</a></p>`);
}

function idempotencyField(): string {
  return `<input type="hidden" name="idempotencyKey" value="web-${crypto.randomUUID()}">`;
}

function profileOptions(session: SaasSession, selected?: SaasProfile): string {
  return [...new Set(session.profiles)].map((profile) => `<option value="${profile}"${profile === selected ? " selected" : ""}>${escapeHtml(profileLabels[profile])}</option>`).join("");
}

function optionLabel(value: string): string {
  return value.replaceAll("-", " ").replace(/\b[a-z]/gu, (character) => character.toUpperCase());
}

function episodeFields(profile: SaasProfile, current?: Record<string, unknown>): string {
  const value = (key: string, fallback = "") => escapeHtml(typeof current?.[key] === "string" ? current[key] : fallback);
  if (profile === "mathematics_education") return `<label class="field">Curriculum source ID<input required name="curriculumSourceId" value="${value("curriculumSourceId")}"><span class="hint">Use the approved internal curriculum source.</span></label><label class="field">Skill ID<input required name="skillId" value="${value("skillId")}"></label><label class="field">Grade<select name="grade">${[5,6,7,8,9,10].map((grade) => `<option${Number(current?.["grade"]) === grade ? " selected" : ""}>${grade}</option>`).join("")}</select></label><label class="field">Difficulty<select name="difficulty">${["foundation","standard","challenge"].map((item) => `<option${value("difficulty", "standard") === item ? " selected" : ""}>${item}</option>`).join("")}</select></label><label class="field">Presentation preset ID<input required name="presentationPresetId" value="${value("presentationPresetId")}"></label><label class="field">Audio preset ID<input required name="audioPresetId" value="${value("audioPresetId")}"></label>`;
  if (profile === "history") return `<label class="field">Topic<input required name="topic" value="${value("topic")}" maxlength="220"><span class="hint">Name the question, person, event, or place the episode will answer.</span></label><label class="field">Story approach<select name="presetId">${Object.entries(historyPresetLabels).map(([item, label]) => `<option value="${item}"${value("presetId", "historical-biography") === item ? " selected" : ""}>${label}</option>`).join("")}</select></label><label class="field">Episode length<select name="format">${["short","standard","long"].map((item) => `<option${value("format", "standard") === item ? " selected" : ""}>${optionLabel(item)}</option>`).join("")}</select></label><label class="field">Audience<select name="audienceLevel">${["general","enthusiast","academic-lite"].map((item) => `<option${value("audienceLevel", "general") === item ? " selected" : ""}>${optionLabel(item)}</option>`).join("")}</select></label><label class="field">Period <span class="hint">Optional, used to anchor research</span><input name="period" value="${value("period")}" placeholder="e.g. medieval"></label>`;
  if (profile === "dark_truth") return `<label class="field">Premise<textarea required name="premise">${value("premise")}</textarea></label><label class="field">Story bible ID<input required name="storyBibleId" value="${value("storyBibleId")}"></label><label class="field">Reference asset IDs <span class="hint">Comma-separated, optional</span><input name="referenceAssetIds" value="${Array.isArray(current?.["referenceAssetIds"]) ? escapeHtml((current?.["referenceAssetIds"] as unknown[]).filter((item): item is string => typeof item === "string").join(", ")) : ""}"></label>`;
  return `<label class="field">Episode mode<select name="episodeMode">${["story-to-strategy","tactical-lesson","position-essay","myth-reality","decision-framework","case-diagnosis","q-and-a","guided-exercise"].map((item) => `<option${value("episodeMode", "story-to-strategy") === item ? " selected" : ""}>${optionLabel(item)}</option>`).join("")}</select><span class="hint">Italian source-reference episodes only in this pilot.</span></label><label class="field">Source asset IDs <span class="hint">Comma-separated internal assets with cleared rights</span><input required name="sourceAssetIds" value="${Array.isArray(current?.["sourceAssetIds"]) ? escapeHtml((current?.["sourceAssetIds"] as unknown[]).filter((item): item is string => typeof item === "string").join(", ")) : ""}"></label>`;
}

function episodeForm(session: SaasSession, project: ProjectSummary, action: string, episode?: { readonly id: string; readonly revision: number; readonly content: EpisodeInput["content"] }): string {
  const content = episode?.content as Record<string, unknown> | undefined;
  return `<form class="card form" method="post" action="${escapeHtml(action)}"><h2>${episode ? "Revise episode brief" : "Create first episode"}</h2><p>Fields are typed for ${escapeHtml(profileLabels[project.profile as SaasProfile])}. Changes require the current revision.</p>${idempotencyField()}${episode ? `<input type="hidden" name="revision" value="${episode.revision}">` : ""}${episodeFields(project.profile as SaasProfile, content)}<div class="actions"><button class="button" type="submit">${episode ? "Save revision" : "Create episode"}</button></div></form>`;
}

function createProjectForm(session: SaasSession): string {
  return `<form class="card form" method="post" action="/projects"><h2>Project details</h2>${idempotencyField()}<label class="field">Project name<input required name="name" maxlength="160" autofocus></label><label class="field">Production profile<select required name="profile">${profileOptions(session)}</select><span class="hint">Only workspace-entitled profiles are shown.</span></label><div class="actions"><button class="button" type="submit">Create project</button><a class="button secondary" href="/projects">Cancel</a></div></form>`;
}

function projectList(session: SaasSession, projects: readonly ProjectSummary[]): string {
  return projects.length === 0 ? empty("No projects yet", "Create a project to organize your first episode and its review trail.", "/projects/new") : `<div class="stack">${projects.map((project) => `<a class="row link-row" href="/projects/${encodeURIComponent(project.id)}"><div><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(profileLabels[project.profile as SaasProfile] ?? project.profile)} · revision ${project.revision}</span></div><span class="tag">Open</span></a>`).join("")}</div>`;
}

function episodeTitle(content: EpisodeInput["content"]): string {
  if (content.type === "history") return content.topic;
  if (content.type === "mathematics_education") return `Grade ${content.grade}: ${content.skillId}`;
  if (content.type === "dark_truth") return content.premise;
  return content.episodeMode.replaceAll("-", " ");
}

function capitalise(value: string): string {
  return value.length ? `${value[0]!.toUpperCase()}${value.slice(1)}` : value;
}

function workflowForm(projectId: string, episodeId: string, episodeRevision: number, locales: readonly string[]): string {
  return `<form class="card form" method="post" action="/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/workflow-runs"><h2>Start provider-free production</h2><p>The episode revision is pinned before durable work begins. Publication remains unavailable.</p>${idempotencyField()}<input type="hidden" name="episodeRevision" value="${episodeRevision}"><label class="field">Production language<select name="locale">${locales.map((locale) => `<option value="${escapeHtml(locale)}">${escapeHtml(localeLabels[locale as keyof typeof localeLabels] ?? locale)} (${escapeHtml(locale)})</option>`).join("")}</select><span class="hint">Options are resolved from persisted workspace configuration.</span></label><div class="actions"><button class="button" type="submit">Start workflow</button></div></form>`;
}

function languageAndVoiceReadiness(capabilities: CapabilityRegistry): string {
  const coverage = capabilities.cells.map((cell) => `<div class="row"><div><strong>${escapeHtml(cell.profileId)}</strong><span>${escapeHtml(cell.locales.map((locale) => localeLabels[locale as keyof typeof localeLabels] ?? locale).join(", "))}</span></div><span class="tag">Configured</span></div>`).join("");
  const voiceReadiness = capabilities.cells.map((cell) => `<section class="card">${renderGenreSpeechSettings({ status: "disabled", genreName: cell.profileId, availableProfiles: [], profileHistory: [], message: "Voice assignment and consent are resolved server-side; credentials are never rendered." })}</section>`).join("");
  return `<section class="card"><h2>Language coverage</h2><p>Every language is visible here, but workflow admission only offers locales entitled for the selected profile.</p></section><div class="stack" style="margin-top:12px">${coverage}</div><section class="card" style="margin-top:18px"><h2>Voice readiness</h2><p>Voice selection is never stored in the browser. It becomes available only when a consent-valid server-side profile version is configured.</p></section><div class="stack" style="margin-top:12px">${voiceReadiness || empty("No profile entitlements", "An operator must entitle a production profile before voice readiness can be assessed.")}</div>`;
}

function problemDetail(error: unknown): { readonly status: number; readonly message: string } {
  if (error instanceof ApiProblemError) return { status: error.status, message: error.problem.detail };
  return { status: 502, message: "The workspace service is temporarily unavailable. Your data was not changed." };
}

function publicationStatusMessage(status: string): string {
  if (status === "published") return "The provider receipt is bound to this immutable intent.";
  if (status === "reconciliation_required") return "Provider outcome is uncertain. Recovery is read-only and requires an operator; no retry will upload media again.";
  if (status === "failed") return "Publication stopped safely. Create a new intent only after reviewing the recorded evidence.";
  if (status === "executing") return "Execution is fenced and may only complete with a durable provider receipt.";
  if (status === "cancelled") return "This intent was cancelled before provider execution.";
  return "This immutable intent is prepared and awaiting its scheduled or controlled execution path.";
}

function publicationPrepareForm(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly episodeRevision: number;
  readonly channels: readonly { readonly channelId: string; readonly displayName: string; readonly connectionStatus: string; readonly defaultVisibility?: "private" | "unlisted" | "public" }[];
}): string {
  const eligible = input.channels.filter((channel) => channel.connectionStatus === "connected");
  if (eligible.length === 0) return `<section class="notice"><strong>Connect a channel before preparing an intent.</strong><p>OAuth remains server-side; an unavailable or expired channel cannot be selected.</p></section>`;
  const channelOptions = eligible.map((channel) => `<option value="${escapeHtml(channel.channelId)}">${escapeHtml(channel.displayName)}</option>`).join("");
  return `<form class="card form" method="post" action="/publishing/projects/${encodeURIComponent(input.projectId)}/episodes/${encodeURIComponent(input.episodeId)}:prepare"><h2>Prepare immutable publication intent</h2><p>Enter the exact approved artifacts and metadata. The server performs preflight and remains the authority for policy, horizon, approval, and OAuth checks.</p>${idempotencyField()}<input type="hidden" name="boundEpisodeRevision" value="${input.episodeRevision}"><label class="field">Channel<select name="channelId">${channelOptions}</select></label><label class="field">Visibility<select name="visibility"><option value="private">Private</option><option value="unlisted">Unlisted after validation</option><option value="public">Public after private-first validation</option></select></label><label class="field">Scheduled time <span class="hint">Optional RFC 3339 instant; server validates the configured horizon and provider constraints.</span><input name="scheduledAt" placeholder="2030-01-01T12:00:00Z"></label><label class="field">Schedule timezone<input name="scheduleTimezone" placeholder="Europe/Amsterdam"></label><label class="field">Approval ID<input required name="approvalId"></label><label class="field">Approval revision<input required name="approvalRevision" inputmode="numeric"></label><label class="field">Approved artifact hash<input required name="approvalArtifactHash"></label><label class="field">Video asset ID<input required name="videoAssetId"></label><label class="field">Video SHA-256<input required name="assetHash"></label><label class="field">Thumbnail asset ID<input required name="thumbnailAssetId"></label><label class="field">Thumbnail SHA-256<input required name="thumbnailHash"></label><label class="field">Caption asset ID <span class="hint">Optional when channel policy permits.</span><input name="captionAssetId"></label><label class="field">Caption SHA-256<input name="captionHash"></label><label class="field">Title<input required name="title" maxlength="200"></label><label class="field">Description<textarea required name="description" maxlength="5000"></textarea></label><label class="field">Tags <span class="hint">Comma-separated</span><input name="tags"></label><label class="field">Default audio language<input required name="defaultAudioLanguage" value="en"></label><label class="field"><input required type="checkbox" name="confirmed" value="yes"> I confirm this exact revision, destination, visibility, and metadata for preparation.</label><div class="actions"><button class="button" type="submit">Preflight and prepare</button></div></form>`;
}

async function renderPublishingPage(input: {
  readonly identity: SaasIdentity;
  readonly gateway: SaasJourneyGateway;
  readonly search: string;
  readonly executionEnabled: boolean;
}): Promise<string> {
  const publishing = input.gateway.publishing;
  const unavailable = `<section class="notice"><strong>Publication execution is unavailable.</strong><p>The platform capability is off, so this page has no executable publish control and cannot trigger a provider mutation.</p></section>`;
  if (!publishing) return shell(input.identity.session, "/publishing", "Publishing", "Prepare evidence and channel state without exposing browser credentials.", unavailable);
  const [channels, projects] = await Promise.all([
    publishing.listChannels(input.identity), input.gateway.listProjects(input.identity),
  ]);
  const selected = new URLSearchParams(input.search);
  const projectId = selected.get("project");
  const episodeId = selected.get("episode");
  const episodeRows = (await Promise.all(projects.items.map(async (project) => ({
    project, episodes: (await input.gateway.listEpisodes(input.identity, project.id)).items,
  })))).flatMap(({ project, episodes }) => episodes.map((episode) => ({ project, episode })));
  const chosen = episodeRows.find(({ project, episode }) => project.id === projectId && episode.id === episodeId);
  const channelRows = channels.items.length ? `<div class="stack">${channels.items.map((channel) => `<div class="row"><div><strong>${escapeHtml(channel.displayName)}</strong><span>${escapeHtml(channel.connectionStatus.replaceAll("_", " "))}${channel.authorizationExpiresAt ? ` · authorization expires ${escapeHtml(channel.authorizationExpiresAt)}` : ""}</span></div><div class="actions"><span class="tag ${channel.connectionStatus === "connected" ? "" : "neutral"}">${escapeHtml(channel.connectionStatus)}</span>${channel.connectionStatus !== "disconnected" ? `<form method="post" action="/publishing/channels/${encodeURIComponent(channel.channelId)}:disconnect"><input type="hidden" name="revision" value="${channel.revision}">${idempotencyField()}<button class="button secondary" type="submit">Disconnect</button></form>` : ""}</div></div>`).join("")}</div>` : empty("No publishing channels", "Connect a channel through the server-side OAuth flow before preparing a publication.");
  const episodeLinks = episodeRows.length ? `<div class="stack">${episodeRows.map(({ project, episode }) => `<a class="row link-row" href="/publishing?project=${encodeURIComponent(project.id)}&episode=${encodeURIComponent(episode.id)}"><div><strong>${escapeHtml(episodeTitle(episode.content))}</strong><span>${escapeHtml(project.name)} · revision ${episode.revision}</span></div><span class="tag neutral">Prepare</span></a>`).join("")}</div>` : empty("No episode brief", "Create and produce an episode before preparing publication evidence.", "/projects/new");
  const execution = input.executionEnabled
    ? `<section class="notice"><strong>Execution remains server-owned.</strong><p>No browser-held token or direct publish button is exposed. A controlled worker may execute only after its own authorization, fence, and provider checks.</p></section>`
    : unavailable;
  return shell(input.identity.session, "/publishing", "Publishing", "Channel credentials stay server-side. Every intent is immutable, preflighted, and private-first.", `${execution}<section class="card" style="margin-top:18px"><h2>Channels</h2><p>Connection and reauthorization state come from the server; credentials are never shown.</p><div class="actions" style="margin-top:12px"><form method="post" action="/publishing/channels:connect">${idempotencyField()}<button class="button" type="submit">Connect channel</button></form></div></section><div style="margin-top:12px">${channelRows}</div><section class="card" style="margin-top:18px"><h2>Choose an episode</h2><p>Preparation binds the exact source revision and metadata. Server preflight decides whether it is eligible.</p></section><div style="margin-top:12px">${episodeLinks}</div>${chosen ? `<div style="margin-top:18px">${publicationPrepareForm({ projectId: chosen.project.id, episodeId: chosen.episode.id, episodeRevision: chosen.episode.revision, channels: channels.items })}</div>` : ""}`);
}

interface PendingInvalidation { readonly workspaceId: string; readonly projectId: string; readonly episodeId: string; readonly preview: Awaited<ReturnType<SaasJourneyGateway["previewArtifactInvalidation"]>>; readonly reason?: string; readonly expiresAt: number; }

async function renderJourneyPage(identity: SaasIdentity, path: string, gateway: SaasJourneyGateway, search = "", publicationExecutionEnabled = false, pendingInvalidations?: ReadonlyMap<string, PendingInvalidation>): Promise<string | null> {
  try {
    if (path === "/publishing") return renderPublishingPage({
      identity, gateway, search, executionEnabled: publicationExecutionEnabled,
    });
    const publicationPath = path.match(/^\/publishing\/projects\/([^/]+)\/publications\/([^/]+)$/u);
    if (publicationPath) {
      const publishing = gateway.publishing;
      if (!publishing) return shell(identity.session, path, "Publishing", "Publication state is unavailable for this workspace.", `<section class="notice">No publishing BFF is configured.</section>`);
      const projectId = decodeURIComponent(publicationPath[1]!); const publicationId = decodeURIComponent(publicationPath[2]!);
      const publication = await publishing.getPublication(identity, projectId, publicationId);
      const controls = publication.status === "pending" ? `<div class="actions" style="margin-top:14px"><form method="post" action="/publishing/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(publication.id)}:cancel">${idempotencyField()}<input type="hidden" name="revision" value="${publication.revision}"><button class="button secondary" type="submit">Cancel intent</button></form></div><form class="card form" style="margin-top:14px" method="post" action="/publishing/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(publication.id)}:schedule">${idempotencyField()}<input type="hidden" name="revision" value="${publication.revision}"><label class="field">Scheduled time <span class="hint">Leave blank to remove the schedule. The server validates timezone and horizon.</span><input name="scheduledAt" value="${escapeHtml(publication.scheduledAt ?? "")}" placeholder="2030-01-01T12:00:00Z"></label><label class="field">Schedule timezone<input name="scheduleTimezone" placeholder="Europe/Amsterdam"></label><button class="button" type="submit">Update schedule</button></form>` : "";
      const execution = publicationExecutionEnabled ? `<section class="notice"><strong>Execution is server-owned.</strong><p>The browser never receives an OAuth token or direct provider control. The internal worker must still pass its confirmation and fence checks.</p></section>` : `<section class="notice"><strong>Execution is disabled.</strong><p>The platform flag is off; no executable publish control is rendered.</p></section>`;
      return shell(identity.session, path, "Publication intent", "This page displays only safe, immutable bindings and state.", `${execution}<section class="card" style="margin-top:18px"><h2>${escapeHtml(publication.status.replaceAll("_", " "))}</h2><p>${escapeHtml(publicationStatusMessage(publication.status))}</p><div class="stack" style="margin-top:14px"><div class="row"><div><strong>Destination</strong><span>Channel ${escapeHtml(publication.channelId)} · intended ${escapeHtml(publication.visibility)} visibility</span></div><span class="tag neutral">revision ${publication.revision}</span></div><div class="row"><div><strong>Source evidence</strong><span>Approval ${escapeHtml(publication.approvalId)} revision ${publication.approvalRevision} · asset ${escapeHtml(publication.assetHash)}</span></div><span class="tag neutral">Immutable</span></div><div class="row"><div><strong>Schedule</strong><span>${escapeHtml(publication.scheduledAt ?? "Not scheduled")}</span></div><span class="tag neutral">Server validated</span></div></div>${controls}</section><section class="card" style="margin-top:18px"><h2>Safe recovery</h2><p>Metadata changes require a new immutable intent. Reconciliation never guesses an external outcome or regenerates media.</p></section>`);
    }
    if (path === "/settings") {
      const capabilities = await gateway.getWorkspaceCapabilities(identity);
      return shell(identity.session, path, "Languages and voice readiness", "Selectable options are resolved from persisted workspace configuration. Voice credentials and consent records remain server-side.", languageAndVoiceReadiness(capabilities));
    }
    if (path === "/reviews" || path === "/assets") {
      const projects = (await gateway.listProjects(identity)).items;
      if (path === "/reviews") {
        const reviewData = await Promise.all(projects.map(async (project) => ({
          project,
          queue: await gateway.listReviewQueue(identity, project.id),
          history: await gateway.listApprovalHistory(identity, project.id),
        })));
        const queueRows = reviewData.flatMap(({ project, queue }) => queue.items.map((item) => {
          const challengeId = String(item["challengeId"] ?? item.id);
          return `<a class="row link-row" href="/projects/${encodeURIComponent(project.id)}/approval-challenges/${encodeURIComponent(challengeId)}"><div><strong>${escapeHtml(String(item["subjectId"] ?? "Review subject"))}</strong><span>${escapeHtml(project.name)} · expires ${escapeHtml(String(item["expiresAt"] ?? "not supplied"))}</span></div><span class="tag">Review</span></a>`;
        }));
        const historyRows = reviewData.flatMap(({ project, history }) => history.items.map((item) => `<div class="row"><div><strong>${escapeHtml(String(item["subjectId"] ?? item.id))}</strong><span>${escapeHtml(project.name)} · ${escapeHtml(String(item["decision"] ?? item["state"] ?? "recorded"))}</span></div><span class="tag neutral">Immutable</span></div>`));
        return shell(identity.session, path, "Review queue", "Review decisions are bound to the exact revision and artifact hash. History is immutable; current validity is resolved by the API.", `<section class="card"><h2>Actionable reviews</h2><p>Open a challenge to inspect its precise evidence before deciding.</p></section><div style="margin-top:12px">${queueRows.length ? `<div class="stack">${queueRows.join("")}</div>` : empty("No reviews awaiting a decision", "New hash-bound review challenges will appear here.")}</div><section class="card" style="margin-top:18px"><h2>Approval history</h2><p>Recorded decisions are facts, not editable notes.</p></section><div style="margin-top:12px">${historyRows.length ? `<div class="stack">${historyRows.join("")}</div>` : empty("No approval history", "Completed or revoked approvals will appear here.")}</div>`);
      }
      const evidence = await Promise.all(projects.map(async (project) => ({
        project,
        assets: (await gateway.listAssets(identity, project.id)).items,
        validations: (await gateway.listValidations(identity, project.id)).items,
      })));
      const rows = evidence.length ? `<div class="stack">${evidence.map(({ project, assets, validations }) => `<a class="row link-row" href="/projects/${encodeURIComponent(project.id)}/assets"><div><strong>${escapeHtml(project.name)}</strong><span>${assets.length === 1 ? "1 asset" : `${assets.length} assets`} · ${validations.length === 1 ? "1 validation" : `${validations.length} validations`} · inspect immutable evidence</span></div><span class="tag ${assets.length && validations.length ? "" : "neutral"}">${assets.length && validations.length ? "Ready to inspect" : "Awaiting evidence"}</span></a>`).join("")}</div>` : empty("No review evidence yet", "Start with a project and typed episode brief; evidence appears after production.", "/projects/new");
      if (path === "/assets") return shell(identity.session, path, "Asset library", "Browse evidence by project. Asset files remain controlled; this workspace shows metadata and validation only.", rows);
      return shell(identity.session, path, "Reviewer handoff", "Inspect immutable evidence first. A decision is possible only against the exact revision, hash, role, and expiry in a supplied approval challenge.", `<section class="card"><h2>Review checklist</h2><p>1. Inspect asset lifecycle and provenance. 2. Resolve validation findings. 3. Compare the exact artifact hash. 4. Record only the scoped approval challenge.</p></section><div style="margin-top:18px">${rows}</div>`);
    }
    if (path === "/") {
      const projects = (await gateway.listProjects(identity)).items;
      const projectEpisodes = await Promise.all(projects.map(async (project) => ({ project, episodes: (await gateway.listEpisodes(identity, project.id)).items })));
      const briefs = projectEpisodes.flatMap(({ episodes }) => episodes);
      const next = projectEpisodes.find(({ episodes }) => episodes.length === 0) ?? projectEpisodes.find(({ episodes }) => episodes.length > 0);
      const nextAction = !next
        ? `<section class="card"><h2>Start the editorial plan</h2><p>Create your first project, then add a typed episode brief for the producer.</p><p><a class="button" href="/projects/new">Create project</a></p></section>`
        : next.episodes.length === 0
          ? `<section class="card"><h2>Next: write the first brief</h2><p>${escapeHtml(next.project.name)} has no episode brief yet.</p><p><a class="button" href="/projects/${encodeURIComponent(next.project.id)}">Open project</a></p></section>`
          : `<section class="card"><h2>Next: review the latest brief</h2><p>${escapeHtml(episodeTitle(next.episodes[0]!.content))} is ready to revise or start.</p><p><a class="button" href="/projects/${encodeURIComponent(next.project.id)}/episodes/${encodeURIComponent(next.episodes[0]!.id)}">Open brief</a></p></section>`;
      const board = projects.length ? `<div class="stack">${projectEpisodes.map(({ project, episodes }) => `<a class="row link-row" href="/projects/${encodeURIComponent(project.id)}"><div><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(profileLabels[project.profile as SaasProfile] ?? project.profile)} · ${episodes.length === 1 ? "1 brief" : `${episodes.length} briefs`}</span></div><span class="tag">${episodes.length ? "Briefs ready" : "Needs brief"}</span></a>`).join("")}</div>` : "";
      return shell(identity.session, path, "Editorial workspace", "Plan what to make next, then move a clear brief through a reviewable production flow.", `<div class="grid"><section class="card"><h2>Active projects</h2><div class="metric">${projects.length}</div><p>Named content initiatives in this workspace.</p></section><section class="card"><h2>Episode briefs</h2><div class="metric">${briefs.length}</div><p>Versioned creative instructions ready to refine.</p></section><section class="card"><h2>Publishing</h2><div class="metric">Off</div><p>Internal review only for this pilot.</p></section></div><div style="margin-top:18px">${nextAction}</div>${board ? `<section class="card" style="margin-top:18px"><h2>Editorial board</h2><p>Open a project to continue the next producer action.</p></section><div style="margin-top:12px">${board}</div>` : ""}<div class="notice" style="margin-top:20px">Production is provider-free. Review assets and approvals before any future release decision.</div>`, `<a class="button" href="/projects/new">New content project</a>`);
    }
    if (path === "/episodes") {
      const projects = (await gateway.listProjects(identity)).items;
      const grouped = await Promise.all(projects.map(async (project) => ({ project, episodes: (await gateway.listEpisodes(identity, project.id)).items })));
      const rows = grouped.flatMap(({ project, episodes }) => episodes.map((episode) => `<a class="row link-row" href="/projects/${encodeURIComponent(project.id)}/episodes/${encodeURIComponent(episode.id)}"><div><strong>${escapeHtml(episodeTitle(episode.content))}</strong><span>${escapeHtml(project.name)} · ${escapeHtml(capitalise(episode.content.type.replaceAll("_", " "))) } · revision ${episode.revision}</span></div><span class="tag">Open brief</span></a>`));
      return shell(identity.session, path, "Episode briefs", "A brief is the producer’s single, versioned instruction set. Open one to revise it or begin production.", rows.length ? `<div class="stack">${rows.join("")}</div>` : empty("No episode briefs yet", "Create a project, then write its first profile-specific brief.", "/projects/new"), `<a class="button" href="/projects/new">New content project</a>`);
    }
    if (path === "/usage") {
      const [quota, usage, audit] = await Promise.all([gateway.getQuota(identity), gateway.listUsage(identity), gateway.listAudit(identity)]);
      const usageRows = usage.items.length ? `<div class="stack">${usage.items.map((entry) => `<div class="row"><div><strong>${escapeHtml(entry.operation)}</strong><span>${escapeHtml(entry.kind)} · ${escapeHtml(entry.quantityUnits)} ${escapeHtml(entry.unit)} · ${escapeHtml(entry.occurredAt)}</span></div><span class="tag neutral">${escapeHtml(entry.costMinor)} minor units</span></div>`).join("")}</div>` : empty("No usage recorded", "This provider-free pilot has not recorded any external provider usage.");
      const auditRows = audit.items.length ? `<div class="stack">${audit.items.map((entry) => `<div class="row"><div><strong>${escapeHtml(entry.action)}</strong><span>${escapeHtml(entry.occurredAt)} · correlation ${escapeHtml(entry.correlationId)}</span></div><span class="tag neutral">Recorded</span></div>`).join("")}</div>` : empty("No audit events", "Security-relevant actions will appear as immutable facts.");
      return shell(identity.session, path, "Usage and audit", "Costs and audit facts are append-only. Billing and publication are unavailable for this pilot.", `<div class="grid"><section class="card"><h2>Available budget</h2><div class="metric">${escapeHtml(quota.availableMinor)}</div><p>Minor units remaining of ${escapeHtml(quota.budgetLimitMinor)}.</p></section><section class="card"><h2>Reserved</h2><div class="metric">${escapeHtml(quota.reservedMinor)}</div><p>Committed before external work starts.</p></section><section class="card"><h2>Settled</h2><div class="metric">${escapeHtml(quota.settledMinor)}</div><p>Finalized usage, including corrections.</p></section></div><section class="card" style="margin-top:18px"><h2>Usage records</h2><p>Records are never edited in place.</p></section><div style="margin-top:12px">${usageRows}</div><section class="card" style="margin-top:18px"><h2>Audit trail</h2><p>Filtered by your workspace; raw credentials and provider details are never shown.</p></section><div style="margin-top:12px">${auditRows}</div>`);
    }
    if (path === "/integrations") return shell(identity.session, path, "Integrations", "This restricted pilot has no browser-managed secrets or external recovery controls.", `<div class="stack"><div class="row"><div><strong>API access</strong><span>Issuance and rotation are not enabled in this pilot contract.</span></div><span class="tag neutral">Unavailable</span></div><div class="row"><div><strong>Webhooks</strong><span>Endpoint provisioning and replay remain operator-disabled.</span></div><span class="tag neutral">Unavailable</span></div><div class="row"><div><strong>Publication recovery</strong><span>Recovery never guesses an external outcome and no publication action is exposed.</span></div><span class="tag neutral">Disabled</span></div></div>`);
    if (path === "/projects") return shell(identity.session, path, "Projects", "Projects keep related episode briefs, artifacts, and workflow history together.", projectList(identity.session, (await gateway.listProjects(identity)).items), `<a class="button" href="/projects/new">Create project</a>`);
    if (path === "/projects/new") return shell(identity.session, path, "Create a project", "Choose an entitled profile. You can revise the episode brief before any workflow starts.", createProjectForm(identity.session));
    const projectMatch = path.match(/^\/projects\/([^/]+)$/u);
    if (projectMatch) {
      const projectId = decodeURIComponent(projectMatch[1]!);
      const project = (await gateway.listProjects(identity)).items.find((item) => item.id === projectId);
      if (!project) return shell(identity.session, path, "Project unavailable", "This project does not exist or is outside your workspace.", `<p><a class="button" href="/projects">Back to projects</a></p>`);
      const episodes = (await gateway.listEpisodes(identity, projectId)).items;
      const episodesHtml = episodes.length === 0 ? empty("No episode briefs yet", "Start with the creative brief your producer will use.") : `<div class="stack">${episodes.map((episode) => `<a class="row link-row" href="/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episode.id)}"><div><strong>${escapeHtml(episodeTitle(episode.content))}</strong><span>Revision ${episode.revision} · updated ${escapeHtml(episode.updatedAt)}</span></div><span class="tag">Open brief</span></a>`).join("")}</div>`;
      const nextAction = episodes.length === 0 ? "Write the first creative brief" : "Refine a brief or start its provider-free workflow";
      return shell(identity.session, path, project.name, `Next producer action: ${nextAction}.`, `${episodesHtml}<div class="actions" style="margin-top:18px"><a class="button secondary" href="/projects/${encodeURIComponent(projectId)}/assets">Review assets and validation</a></div><div style="margin-top:18px">${episodeForm(identity.session, project, `/projects/${encodeURIComponent(projectId)}/episodes`)}</div>`);
    }
    const assetsMatch = path.match(/^\/projects\/([^/]+)\/assets$/u);
    if (assetsMatch) {
      const projectId = decodeURIComponent(assetsMatch[1]!);
      const [assets, validations] = await Promise.all([gateway.listAssets(identity, projectId), gateway.listValidations(identity, projectId)]);
      const assetRows = assets.items.length ? `<div class="stack">${assets.items.map((asset) => `<div class="row"><div><strong>${escapeHtml(asset.id)}</strong><span>${escapeHtml(asset.mimeType)} · ${asset.bytes} bytes · ${escapeHtml(asset.lifecycle)}</span></div><span class="tag neutral">${escapeHtml(asset.provenance)}</span></div>`).join("")}</div>` : empty("No validated assets", "Generated assets remain quarantined until their checks complete.");
      const validationRows = validations.items.length ? `<div class="stack">${validations.items.map((validation) => `<div class="row"><div><strong>${escapeHtml(String(validation["code"] ?? "Validation"))}</strong><span>${escapeHtml(String(validation["message"] ?? "No public detail available."))}</span></div><span class="tag neutral">${escapeHtml(String(validation["status"] ?? "recorded"))}</span></div>`).join("")}</div>` : empty("No validation records", "Validation results will appear with their artifact lineage.");
      return shell(identity.session, "/assets", "Assets and validations", "Artifacts are immutable. This view never receives a download URL or provider detail.", `<section class="card"><h2>Assets</h2><p>Metadata is available only within this workspace.</p></section><div style="margin-top:12px">${assetRows}</div><section class="card" style="margin-top:18px"><h2>Validation results</h2><p>Review failures before an approval decision.</p></section><div style="margin-top:12px">${validationRows}</div>`);
    }
    const challengeMatch = path.match(/^\/projects\/([^/]+)\/approval-challenges\/([^/]+)$/u);
    if (challengeMatch) {
      const projectId = decodeURIComponent(challengeMatch[1]!); const challengeId = decodeURIComponent(challengeMatch[2]!);
      const challenge = await gateway.getApprovalChallenge(identity, projectId, challengeId);
      const expired = Date.parse(challenge.expiresAt) <= Date.now(); const unavailable = expired || challenge.consumedAt !== null;
      const decision = unavailable ? `<div class="alert" role="status">This challenge is ${challenge.consumedAt ? "already decided" : "expired"} and cannot be reused.</div>` : `<form class="card form" method="post" action="/projects/${encodeURIComponent(projectId)}/approval-challenges/${encodeURIComponent(challengeId)}/decision">${idempotencyField()}<input type="hidden" name="subjectId" value="${escapeHtml(challenge.subjectId)}"><input type="hidden" name="revision" value="${challenge.subjectRevision}"><label class="field">Decision<select name="decision"><option value="approved">Approve this exact revision</option><option value="rejected">Reject</option></select></label><label class="field">Reason<textarea required name="reason" maxlength="1000"></textarea></label><button class="button" type="submit">Record decision</button></form>`;
      return shell(identity.session, "/reviews", "Approval challenge", "Confirm the exact subject, revision, and artifact hash before deciding.", `<div class="grid"><section class="card"><h2>Subject</h2><p>${escapeHtml(challenge.subjectId)} · revision ${challenge.subjectRevision}</p></section><section class="card"><h2>Artifact hash</h2><p>${escapeHtml(challenge.artifactHash)}</p></section><section class="card"><h2>Expires</h2><p>${escapeHtml(challenge.expiresAt)}</p></section></div><div style="margin-top:18px">${decision}</div>`);
    }
    const episodeMatch = path.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)$/u);
    if (episodeMatch) {
      const projectId = decodeURIComponent(episodeMatch[1]!); const episodeId = decodeURIComponent(episodeMatch[2]!);
      const project = (await gateway.listProjects(identity)).items.find((item) => item.id === projectId);
      if (!project) return shell(identity.session, path, "Episode unavailable", "This episode is not available in this workspace.", `<p><a class="button" href="/projects">Back to projects</a></p>`);
      const [episode, productionState, comparisons, configuration] = await Promise.all([
        gateway.getEpisode(identity, projectId, episodeId),
        gateway.getEpisodeProductionState(identity, projectId, episodeId),
        gateway.compareProductionUnitSnapshots(identity, projectId, episodeId),
        gateway.getEpisodeResolvedConfiguration(identity, projectId, episodeId),
      ]);
      const profile = project.profile as SaasProfile;
      const gateRows = productionState.blockers.length
        ? `<div class="stack">${productionState.blockers.map((gate) => `<div class="row"><div><strong>${escapeHtml(gate.code.replaceAll("_", " "))}</strong><span>${escapeHtml(gate.message)}</span></div><span class="tag danger">Blocked</span></div>`).join("")}</div>`
        : `<div class="notice" role="status">No blocking gate is currently recorded.</div>`;
      const actionRows = productionState.actions.length
        ? `<div class="stack">${productionState.actions.map((action) => `<div class="row"><div><strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(action.enabled ? "Available for this revision." : (action.reason ?? "Unavailable for this revision."))}</span></div><span class="tag ${action.enabled ? "" : "neutral"}">${action.enabled ? "Available" : "Unavailable"}</span></div>`).join("")}</div>`
        : "";
      const runLink = productionState.workflow.activeRunId
        ? `<p><a class="button secondary" href="/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(productionState.workflow.activeRunId)}${productionState.workflow.jobId ? `?job=${encodeURIComponent(productionState.workflow.jobId)}` : ""}">Open production timeline</a></p>`
        : "";
      const pendingToken = new URLSearchParams(search).get("invalidation");
      const pending = pendingToken ? pendingInvalidations?.get(pendingToken) : undefined;
      const invalidationForm = `<form class="card form" method="post" action="/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/invalidation-preview"><h2>Preview scoped regeneration</h2><p>Enter the server-issued next input fingerprint for one changed upstream unit. The preview uses persisted lineage; it does not accept browser snapshots.</p>${idempotencyField()}<label class="field">Unit kind<select name="kind"><option value="brief_script">Brief / script</option><option value="narration">Narration</option><option value="visual_plan">Visual plan</option><option value="scene_visual">Scene visual</option><option value="map">Map</option><option value="diagram">Diagram</option><option value="tts">TTS</option><option value="subtitles">Subtitles</option><option value="render">Render</option></select></label><label class="field">Next input fingerprint<input required name="nextInputFingerprint" pattern="[a-f0-9]{64}" maxlength="64"></label><label class="field">Reason<input name="reason" maxlength="1000"></label><button class="button secondary" type="submit">Preview invalidation</button></form>`;
      const confirmation = pending && pending.workspaceId === identity.session.workspaceId && pending.projectId === projectId && pending.episodeId === episodeId && pending.expiresAt > Date.now()
        ? `<section class="card" style="margin-top:18px"><h2>Confirm scoped regeneration</h2><p>${pending.preview.invalidatedUnits.length} units would become stale; ${pending.preview.regenerationTargets.length} targets will be queued. Review/readiness targets are excluded.</p><div class="stack">${pending.preview.invalidatedUnits.map((unit) => `<div class="row"><div><strong>${escapeHtml(unit.address.kind.replaceAll("_", " "))}</strong><span>${escapeHtml(unit.reason)}</span></div><span class="tag neutral">${escapeHtml(unit.previousStatus)}</span></div>`).join("")}</div><form method="post" action="/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/invalidation-confirm" style="margin-top:14px">${idempotencyField()}<input type="hidden" name="token" value="${escapeHtml(pendingToken!)}"><label class="field"><input required type="checkbox" name="confirmed" value="yes"> I confirm these exact server-calculated targets.</label><button class="button" type="submit">Queue regeneration</button></form></section>` : "";
      const comparisonRows = comparisons.items.length
        ? `<div class="stack">${comparisons.items.map(({ current, previous, comparison }) => `<div class="row"><div><strong>${escapeHtml(current.snapshot.address.kind.replaceAll("_", " "))}${current.snapshot.address.unitKey ? ` · ${escapeHtml(current.snapshot.address.unitKey)}` : ""}</strong><span>${escapeHtml(current.snapshot.status)} snapshot from ${escapeHtml(current.createdAt)}${previous ? ` · previous snapshot ${escapeHtml(previous.createdAt)}` : " · no prior immutable baseline"}</span></div><span class="tag neutral">${comparison ? "Metadata comparison" : "Current only"}</span></div>`).join("")}</div>`
        : empty("No production-unit snapshots yet", "Comparison becomes available after a worker persists immutable production output.");
      return shell(identity.session, path, "Episode workspace", "This view is driven by durable server projections; gate, comparison, and action availability are never inferred in the browser.", `<div class="grid"><section class="card"><h2>Production state</h2><div class="metric">${escapeHtml(productionState.lifecycleStage.replaceAll("_", " "))}</div><p>Projected ${escapeHtml(productionState.projectedAt)}.</p></section><section class="card"><h2>Current revision</h2><div class="metric">${episode.revision}</div><p>Use a refresh if someone else saves a newer version.</p></section><section class="card"><h2>Profile</h2><p>${escapeHtml(profileLabels[profile] ?? project.profile)}</p></section></div><section class="card" style="margin-top:18px"><h2>Required before the next action</h2>${gateRows}${runLink}</section><section class="card" style="margin-top:18px"><h2>Artifact lineage and comparison</h2><p>Baselines are immutable worker snapshots. No browser-side artifact graph is constructed.</p>${comparisonRows}</section><div style="margin-top:18px">${invalidationForm}</div>${confirmation}${actionRows ? `<section class="card" style="margin-top:18px"><h2>Permitted actions</h2>${actionRows}</section>` : ""}<div style="margin-top:18px">${episodeForm(identity.session, project, `/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}`, episode)}</div><div style="margin-top:18px">${workflowForm(projectId, episodeId, episode.revision, configuration.supportedLocales)}</div>`);
    }
    const workflowMatch = path.match(/^\/workflows\/([^/]+)\/([^/]+)$/u);
    if (workflowMatch) {
      const projectId = decodeURIComponent(workflowMatch[1]!); const runId = decodeURIComponent(workflowMatch[2]!);
      const jobId = new URLSearchParams(search).get("job") ?? "";
      const workflow = await gateway.getWorkflow(identity, projectId, runId);
      const steps = await gateway.getWorkflowSteps(identity, projectId, runId);
      const job = jobId ? await gateway.getJob(identity, projectId, jobId) : null;
      const controls = `<form class="actions" method="post" action="/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(runId)}:cancel">${idempotencyField()}<input type="hidden" name="revision" value="${workflow.revision}"><button class="button secondary" type="submit">Cancel</button></form><form class="actions" method="post" action="/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(runId)}:resume">${idempotencyField()}<input type="hidden" name="revision" value="${workflow.revision}"><button class="button" type="submit">Resume</button></form>`;
      return shell(identity.session, "/workflows", "Workflow status", "Refresh this page for the latest durable status; actions are revision-protected.", `<div class="grid"><section class="card"><h2>Workflow</h2><div class="metric">${escapeHtml(workflow.status)}</div><p>Revision ${workflow.revision}</p></section><section class="card"><h2>Job</h2><div class="metric">${job ? escapeHtml(job.status) : "Linked"}</div><p>${job?.failure ? escapeHtml(job.failure.detail) : "No raw worker or provider detail is displayed."}</p></section></div><div class="stack" style="margin-top:18px">${steps.items.map((step) => `<div class="row"><div><strong>${escapeHtml(step.phase ?? step.id)}</strong><span>${escapeHtml(step.message ?? "No public detail available.")}</span></div><span class="tag neutral">${escapeHtml(step.status)}</span></div>`).join("") || empty("No step records yet", "The workflow has been admitted and is waiting for its first durable step.")}</div><div class="actions" style="margin-top:18px">${controls}</div>`);
    }
  } catch (error) {
    const problem = problemDetail(error);
    return shell(identity.session, path, "Unable to load workspace data", "The service returned a safe, actionable response.", `<div class="alert" role="alert"><strong>${problem.status === 403 ? "You do not have access to this resource." : "We could not load this view."}</strong><p>${escapeHtml(problem.message)}</p></div><p><a class="button" href="/projects">Return to projects</a></p>`);
  }
  return null;
}

export function renderAuthenticatedShell(session: SaasSession): string {
  return renderPage(session, "/");
}

async function formData(request: http.IncomingMessage, maxBytes: number): Promise<URLSearchParams> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > maxBytes) throw new Error("form_too_large");
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function requiredField(input: URLSearchParams, name: string, maximum = 240): string {
  const value = input.get(name)?.trim() ?? "";
  if (!value || value.length > maximum) throw new Error(`Enter a valid ${name}.`);
  return value;
}

function listField(input: URLSearchParams, name: string): readonly string[] {
  return (input.get(name) ?? "").split(",").map((item) => item.trim()).filter(Boolean).filter((item) => item.length <= 160).slice(0, 50);
}

function optionalField(input: URLSearchParams, name: string, maximum = 240): string | undefined {
  const value = input.get(name)?.trim() ?? "";
  if (!value) return undefined;
  if (value.length > maximum) throw new Error(`Enter a valid ${name}.`);
  return value;
}

function nonNegativeInteger(input: URLSearchParams, name: string): number {
  const value = Number(requiredField(input, name, 20));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Enter a valid ${name}.`);
  return value;
}

function publicationPrepareInput(input: URLSearchParams) {
  const captionAssetId = optionalField(input, "captionAssetId", 160);
  const captionHash = optionalField(input, "captionHash", 64);
  if ((captionAssetId === undefined) !== (captionHash === undefined))
    throw new Error("Caption asset ID and SHA-256 must be supplied together.");
  const scheduledAt = optionalField(input, "scheduledAt", 80);
  const scheduleTimezone = optionalField(input, "scheduleTimezone", 80);
  const visibility = requiredField(input, "visibility", 12);
  if (visibility !== "private" && visibility !== "unlisted" && visibility !== "public")
    throw new Error("Choose a valid visibility.");
  return {
    channelId: requiredField(input, "channelId", 160),
    visibility,
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(scheduleTimezone ? { scheduleTimezone } : {}),
    approvalId: requiredField(input, "approvalId", 160),
    approvalRevision: nonNegativeInteger(input, "approvalRevision"),
    approvalArtifactHash: requiredField(input, "approvalArtifactHash", 64),
    assetHash: requiredField(input, "assetHash", 64),
    artifactBindings: [
      { assetId: requiredField(input, "videoAssetId", 160), role: "video", contentHash: requiredField(input, "assetHash", 64) },
      { assetId: requiredField(input, "thumbnailAssetId", 160), role: "thumbnail", contentHash: requiredField(input, "thumbnailHash", 64) },
      ...(captionAssetId && captionHash ? [{ assetId: captionAssetId, role: "captions", contentHash: captionHash }] : []),
    ],
    metadata: {
      title: requiredField(input, "title", 200), description: requiredField(input, "description", 5_000),
      tags: listField(input, "tags"), defaultAudioLanguage: requiredField(input, "defaultAudioLanguage", 35),
      thumbnailAssetId: requiredField(input, "thumbnailAssetId", 160), thumbnailHash: requiredField(input, "thumbnailHash", 64),
      ...(captionAssetId ? { captionAssetId } : {}), ...(captionHash ? { captionHash } : {}),
    },
    boundEpisodeRevision: nonNegativeInteger(input, "boundEpisodeRevision"),
  } as const;
}

function profileFromInput(value: string, session: SaasSession): SaasProfile {
  if (!(value in profileLabels) || !session.profiles.includes(value as SaasProfile)) throw new Error("This production profile is not entitled for this workspace.");
  return value as SaasProfile;
}

function episodeInput(profile: SaasProfile, input: URLSearchParams): EpisodeInput {
  if (profile === "mathematics_education") return { content: { type: profile, version: "1", curriculumSourceId: requiredField(input, "curriculumSourceId"), skillId: requiredField(input, "skillId"), grade: Number(requiredField(input, "grade")) as 5 | 6 | 7 | 8 | 9 | 10, difficulty: requiredField(input, "difficulty") as "foundation" | "standard" | "challenge", presentationPresetId: requiredField(input, "presentationPresetId"), audioPresetId: requiredField(input, "audioPresetId") } };
  if (profile === "history") {
    const period = input.get("period")?.trim();
    return { content: { type: profile, version: "1", topic: requiredField(input, "topic", 220), presetId: requiredField(input, "presetId") as EpisodeInput["content"] extends { readonly presetId: infer T } ? T : never, format: requiredField(input, "format") as "short" | "standard" | "long", audienceLevel: requiredField(input, "audienceLevel") as "general" | "enthusiast" | "academic-lite", ...(period ? { period: period as never } : {}) } } as EpisodeInput;
  }
  if (profile === "dark_truth") return { content: { type: profile, version: "1", premise: requiredField(input, "premise", 5_000), storyBibleId: requiredField(input, "storyBibleId"), referenceAssetIds: listField(input, "referenceAssetIds") } };
  return { content: { type: profile, version: "1", creatorProfileId: "veronica-benini", episodeMode: requiredField(input, "episodeMode") as "story-to-strategy" | "tactical-lesson" | "position-essay" | "myth-reality" | "decision-framework" | "case-diagnosis" | "q-and-a" | "guided-exercise", canonicalLocale: "it", sourceAssetIds: listField(input, "sourceAssetIds") } };
}

function isSameOrigin(request: http.IncomingMessage): boolean {
  const source = request.headers.origin && request.headers.origin !== "null"
    ? request.headers.origin
    : request.headers.referer;
  if (!source) return false;
  const hosts = [request.headers.host, request.headers["x-forwarded-host"]]
    .flatMap((value) => typeof value === "string" ? value.split(",") : [])
    .map((value) => value.trim())
    .filter(Boolean);
  try { return hosts.includes(new URL(source).host); } catch { return false; }
}

function actionError(response: http.ServerResponse, session: SaasSession, path: string, status: number, message: string): void {
  const title = status === 412 ? "This brief changed elsewhere" : status === 403 ? "You do not have permission for that action" : "We could not complete that action";
  response.writeHead(status).end(applyStyleNonce(response, shell(session, path, title, "No newer content was overwritten.", `<div class="alert" role="alert"><strong>${escapeHtml(message)}</strong><p>Refresh the page and review the latest revision before trying again.</p></div><p><a class="button" href="${escapeHtml(path)}">Refresh</a></p>`)));
}

async function handleJourneyAction(input: {
  readonly request: http.IncomingMessage;
  readonly response: http.ServerResponse;
  readonly identity: SaasIdentity;
  readonly path: string;
  readonly gateway: SaasJourneyGateway;
  readonly maxRequestBytes: number;
  readonly completedActions: Map<string, string>;
  readonly pendingInvalidations: Map<string, PendingInvalidation>;
  readonly allowUnverifiedDemoFormPosts: boolean;
}): Promise<boolean> {
  const { request, response, identity, path, gateway, maxRequestBytes, completedActions, pendingInvalidations, allowUnverifiedDemoFormPosts } = input;
  if (request.method !== "POST") return false;
  if (!isSameOrigin(request) && !allowUnverifiedDemoFormPosts) { response.writeHead(403).end(); return true; }
  let values: URLSearchParams;
  try { values = await formData(request, maxRequestBytes); } catch { actionError(response, identity.session, path, 413, "The submitted form is too large."); return true; }
  const idempotencyKey = requiredField(values, "idempotencyKey", 255);
  const replayKey = `${identity.session.workspaceId}:${path}:${idempotencyKey}`;
  const replay = completedActions.get(replayKey);
  if (replay) { response.writeHead(303, { location: replay, "idempotency-replayed": "true" }).end(); return true; }
  const redirect = (location: string) => {
    completedActions.set(replayKey, location);
    response.writeHead(303, { location }).end();
  };
  try {
    if (path === "/publishing/channels:connect") {
      const publishing = gateway.publishing;
      if (!publishing) { actionError(response, identity.session, path, 409, "Channel connection is unavailable for this workspace."); return true; }
      const started = await publishing.beginChannelConnect(identity);
      response.writeHead(303, { location: started.authorizationUrl, "cache-control": "no-store" }).end(); return true;
    }
    const disconnectChannel = path.match(/^\/publishing\/channels\/([^/]+):disconnect$/u);
    if (disconnectChannel) {
      const publishing = gateway.publishing;
      if (!publishing) { actionError(response, identity.session, path, 409, "Channel connection is unavailable for this workspace."); return true; }
      await publishing.disconnectChannel(identity, decodeURIComponent(disconnectChannel[1]!), `"${nonNegativeInteger(values, "revision")}"`);
      redirect("/publishing"); return true;
    }
    const preparePublication = path.match(/^\/publishing\/projects\/([^/]+)\/episodes\/([^/]+):prepare$/u);
    if (preparePublication) {
      const publishing = gateway.publishing;
      if (!publishing) { actionError(response, identity.session, path, 409, "Publication preparation is unavailable for this workspace."); return true; }
      if (values.get("confirmed") !== "yes") throw new Error("Confirm the exact revision, destination, visibility, and metadata.");
      const projectId = decodeURIComponent(preparePublication[1]!); const episodeId = decodeURIComponent(preparePublication[2]!);
      const publication = publicationPrepareInput(values);
      const preflight = await publishing.preflight(identity, projectId, episodeId, publication);
      if (!preflight.admitted) {
        actionError(response, identity.session, path, 412, preflight.rejections.map((rejection) => rejection.message).join(" ") || "Publication preflight failed.");
        return true;
      }
      const prepared = await publishing.prepare(identity, projectId, episodeId, publication, idempotencyKey);
      redirect(`/publishing/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(prepared.publication.id)}`); return true;
    }
    const cancelPublication = path.match(/^\/publishing\/projects\/([^/]+)\/publications\/([^/]+):cancel$/u);
    if (cancelPublication) {
      const publishing = gateway.publishing;
      if (!publishing) { actionError(response, identity.session, path, 409, "Publication control is unavailable for this workspace."); return true; }
      const projectId = decodeURIComponent(cancelPublication[1]!); const publicationId = decodeURIComponent(cancelPublication[2]!);
      await publishing.cancelPublication(identity, projectId, publicationId, `"${nonNegativeInteger(values, "revision")}"`);
      redirect(`/publishing/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(publicationId)}`); return true;
    }
    const updateSchedule = path.match(/^\/publishing\/projects\/([^/]+)\/publications\/([^/]+):schedule$/u);
    if (updateSchedule) {
      const publishing = gateway.publishing;
      if (!publishing) { actionError(response, identity.session, path, 409, "Publication control is unavailable for this workspace."); return true; }
      const projectId = decodeURIComponent(updateSchedule[1]!); const publicationId = decodeURIComponent(updateSchedule[2]!);
      const scheduledAt = optionalField(values, "scheduledAt", 80) ?? null;
      const scheduleTimezone = optionalField(values, "scheduleTimezone", 80);
      await publishing.updateSchedule(identity, projectId, publicationId, { scheduledAt, ...(scheduleTimezone ? { scheduleTimezone } : {}) }, `"${nonNegativeInteger(values, "revision")}"`);
      redirect(`/publishing/projects/${encodeURIComponent(projectId)}/publications/${encodeURIComponent(publicationId)}`); return true;
    }
    if (path === "/projects") {
      const profile = profileFromInput(requiredField(values, "profile"), identity.session);
      const project = await gateway.createProject(identity, { name: requiredField(values, "name", 160), profile }, idempotencyKey);
      redirect(`/projects/${encodeURIComponent(project.id)}`); return true;
    }
    const createEpisode = path.match(/^\/projects\/([^/]+)\/episodes$/u);
    if (createEpisode) {
      const projectId = decodeURIComponent(createEpisode[1]!);
      const project = (await gateway.listProjects(identity)).items.find((item) => item.id === projectId);
      if (!project) { actionError(response, identity.session, path, 404, "The project is unavailable."); return true; }
      const created = await gateway.createEpisode(identity, projectId, episodeInput(profileFromInput(project.profile, identity.session), values), idempotencyKey);
      redirect(`/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(created.id)}`); return true;
    }
    const replaceEpisode = path.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)$/u);
    if (replaceEpisode) {
      const projectId = decodeURIComponent(replaceEpisode[1]!); const episodeId = decodeURIComponent(replaceEpisode[2]!);
      const project = (await gateway.listProjects(identity)).items.find((item) => item.id === projectId);
      if (!project) { actionError(response, identity.session, path, 404, "The project is unavailable."); return true; }
      await gateway.replaceEpisode(identity, projectId, episodeId, episodeInput(profileFromInput(project.profile, identity.session), values), `"${Number(requiredField(values, "revision", 12))}"`);
      redirect(path); return true;
    }
    const start = path.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/workflow-runs$/u);
    if (start) {
      const projectId = decodeURIComponent(start[1]!); const episodeId = decodeURIComponent(start[2]!);
      const accepted = await gateway.startWorkflow(identity, projectId, episodeId, { template: "episode-production", episodeRevision: Number(requiredField(values, "episodeRevision", 12)), locales: [requiredField(values, "locale", 8)], variants: ["full"], approvalMode: "required", publicationMode: "none" }, idempotencyKey);
      redirect(`/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(accepted.workflowRunId)}?job=${encodeURIComponent(accepted.jobId)}`); return true;
    }
    const previewInvalidation = path.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/invalidation-preview$/u);
    if (previewInvalidation) {
      const projectId = decodeURIComponent(previewInvalidation[1]!); const episodeId = decodeURIComponent(previewInvalidation[2]!);
      const kind = requiredField(values, "kind", 80); const nextInputFingerprint = requiredField(values, "nextInputFingerprint", 64); const reason = optionalField(values, "reason", 1000);
      if (!/^[a-f0-9]{64}$/u.test(nextInputFingerprint)) throw new Error("Enter a 64-character lowercase SHA-256 input fingerprint.");
      const preview = await gateway.previewArtifactInvalidation(identity, projectId, episodeId, { changes: [{ address: { kind }, nextInputFingerprint, ...(reason === undefined ? {} : { reason }) }] });
      const token = crypto.randomUUID(); pendingInvalidations.set(token, { workspaceId: identity.session.workspaceId, projectId, episodeId, preview, ...(reason === undefined ? {} : { reason }), expiresAt: Date.now() + 10 * 60_000 });
      redirect(`/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}?invalidation=${encodeURIComponent(token)}`); return true;
    }
    const confirmInvalidation = path.match(/^\/projects\/([^/]+)\/episodes\/([^/]+)\/invalidation-confirm$/u);
    if (confirmInvalidation) {
      if (values.get("confirmed") !== "yes") throw new Error("Confirm the exact server-calculated regeneration targets.");
      const projectId = decodeURIComponent(confirmInvalidation[1]!); const episodeId = decodeURIComponent(confirmInvalidation[2]!); const token = requiredField(values, "token", 100);
      const pending = pendingInvalidations.get(token);
      if (!pending || pending.expiresAt <= Date.now() || pending.workspaceId !== identity.session.workspaceId || pending.projectId !== projectId || pending.episodeId !== episodeId) { actionError(response, identity.session, path, 412, "This invalidation preview expired or belongs to another workspace. Preview again."); return true; }
      const accepted = await gateway.regenerateProductionUnits(identity, projectId, episodeId, { targets: pending.preview.regenerationTargets, ...(pending.reason ? { reason: pending.reason } : {}) }, idempotencyKey);
      pendingInvalidations.delete(token); redirect(`/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(accepted.workflowRunId)}?job=${encodeURIComponent(accepted.jobId)}`); return true;
    }
    const decision = path.match(/^\/projects\/([^/]+)\/approval-challenges\/([^/]+)\/decision$/u);
    if (decision) {
      const projectId = decodeURIComponent(decision[1]!); const challengeId = decodeURIComponent(decision[2]!);
      const challenge = await gateway.getApprovalChallenge(identity, projectId, challengeId);
      if (challenge.consumedAt || Date.parse(challenge.expiresAt) <= Date.now()) { actionError(response, identity.session, path, 409, "This approval challenge is no longer available."); return true; }
      const choice = requiredField(values, "decision", 12);
      if (choice !== "approved" && choice !== "rejected") throw new Error("Choose an approval decision.");
      await gateway.recordApproval(identity, projectId, { challengeId, subjectId: requiredField(values, "subjectId"), expectedRevision: Number(requiredField(values, "revision", 12)), decision: choice, reason: requiredField(values, "reason", 1_000) }, `"${challenge.subjectRevision}"`, idempotencyKey);
      redirect(`/projects/${encodeURIComponent(projectId)}/approval-challenges/${encodeURIComponent(challengeId)}`); return true;
    }
    const control = path.match(/^\/workflows\/([^/]+)\/([^/:]+):(cancel|resume)$/u);
    if (control) {
      const projectId = decodeURIComponent(control[1]!); const runId = decodeURIComponent(control[2]!); const ifMatch = `"${Number(requiredField(values, "revision", 12))}"`;
      const accepted = control[3] === "cancel" ? await gateway.cancelWorkflow(identity, projectId, runId, ifMatch) : await gateway.resumeWorkflow(identity, projectId, runId, ifMatch, idempotencyKey);
      redirect(`/workflows/${encodeURIComponent(projectId)}/${encodeURIComponent(accepted.workflowRunId)}?job=${encodeURIComponent(accepted.jobId)}`); return true;
    }
  } catch (error) {
    const problem = problemDetail(error);
    actionError(response, identity.session, path, problem.status, problem.message); return true;
  }
  return false;
}

function setSecurityHeaders(response: http.ServerResponse): string {
  const nonce = crypto.randomBytes(18).toString("base64");
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader(
    "content-security-policy",
    `default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; style-src 'self' 'nonce-${nonce}'; img-src 'self'; connect-src 'self'`
  );
  response.setHeader("cross-origin-opener-policy", "same-origin");
  response.setHeader(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()"
  );
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  responseStyleNonces.set(response, nonce);
  return nonce;
}

/**
 * Minimal same-origin BFF shell. Mutations are intentionally absent until the
 * API and session/CSRF contracts are available; this avoids a browser-held API
 * credential or a partial mutation surface.
 */
export function createSaasRuntime(options: SaasRuntimeOptions): http.Server {
  const maxRequestBytes = options.maxRequestBytes ?? 16_384;
  const oidc = options.oidc ? new OidcBff(options.oidc) : null;
  const completedActions = new Map<string, string>();
  const pendingInvalidations = new Map<string, PendingInvalidation>();
  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    const contentLength = Number(request.headers["content-length"] ?? 0);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength > maxRequestBytes
    ) {
      response.writeHead(413).end();
      return;
    }
    if (oidc && await oidc.handle(request, response)) return;
    const url = new URL(request.url ?? "/", "http://mediaforge.local");
    const path = url.pathname;
    const identity = oidc?.identity(request) ?? await options.resolveIdentity?.(request) ?? (() => undefined)();
    const session = identity?.session ?? await options.resolveSession(request);
    const resolvedIdentity = identity ?? (session ? { session } : null);
    if (request.method === "POST" && options.journey && resolvedIdentity) {
      if (await handleJourneyAction({ request, response, identity: resolvedIdentity, path, gateway: options.journey, maxRequestBytes, completedActions, pendingInvalidations, allowUnverifiedDemoFormPosts: options.allowUnverifiedDemoFormPosts ?? false })) return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", options.journey ? "GET, HEAD, POST" : "GET, HEAD");
      response.writeHead(405).end();
      return;
    }
    const journey = resolvedIdentity && options.journey ? await renderJourneyPage(resolvedIdentity, path, options.journey, url.searchParams.toString(), options.publicationExecutionEnabled ?? false, pendingInvalidations) : null;
    const page = journey ?? (session ? renderPage(session, path) : renderSignedOutShell());
    const knownJourney = path === "/publishing" || /^\/publishing\/projects\/[^/]+\/publications\/[^/]+$/u.test(path) || /^\/projects\/[^/]+(?:\/episodes\/[^/]+)?$/u.test(path) || /^\/projects\/[^/]+\/(?:assets|approval-challenges\/[^/]+)$/u.test(path) || /^\/workflows\/[^/]+\/[^/]+$/u.test(path);
    response.writeHead(session && !navigation.some(([href]) => href === path) && path !== "/projects/new" && !knownJourney ? 404 : 200);
    if (request.method === "GET") response.end(applyStyleNonce(response, page));
    else response.end();
  });
}
