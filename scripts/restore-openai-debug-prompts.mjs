#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REDACTED_CONTENT = "[REDACTED_CONTENT]";

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function readJsonDirectory(directory) {
  const names = (await fs.readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(names.map(async (name) => ({
    filePath: path.join(directory, name),
    name,
    value: await readJson(path.join(directory, name)),
  })));
}

function setRestoredPrompt(entry, prompt) {
  if (!entry.request || typeof entry.request !== "object" || Array.isArray(entry.request)) {
    throw new Error(`Debug entry ${entry.id ?? "unknown"} has no request object.`);
  }
  if (entry.request.prompt !== REDACTED_CONTENT) {
    throw new Error(`Debug entry ${entry.id ?? "unknown"} does not contain a redacted prompt.`);
  }
  return {
    ...entry,
    request: {
      ...entry.request,
      prompt,
    },
  };
}

async function main() {
  const episodeDir = path.resolve(process.argv[2] ?? "");
  if (!process.argv[2]) {
    throw new Error("Usage: node scripts/restore-openai-debug-prompts.mjs <episode-directory>");
  }

  const debugDir = path.join(episodeDir, "debug", "openai-calls");
  const restoredDir = path.join(episodeDir, "debug", "openai-calls-restored");
  const stateDir = path.join(episodeDir, "state", "image-generation");
  const requestDir = path.join(stateDir, "provider-requests");
  const responseDir = path.join(stateDir, "provider-responses");

  const [logs, requests, responses] = await Promise.all([
    readJsonDirectory(debugDir),
    readJsonDirectory(requestDir),
    readJsonDirectory(responseDir),
  ]);

  const requestsByScene = new Map();
  for (const request of requests) {
    const { sceneId, prompt, promptHash } = request.value;
    if (typeof sceneId !== "string" || typeof prompt !== "string" || typeof promptHash !== "string") {
      continue;
    }
    const actualHash = sha256(prompt);
    if (actualHash !== promptHash) {
      throw new Error(`Prompt hash mismatch for ${request.filePath}: expected ${promptHash}, got ${actualHash}.`);
    }
    requestsByScene.set(sceneId, request);
  }

  const exactSuccessById = new Map();
  for (const response of responses) {
    const { requestId, sceneId, promptHash } = response.value;
    const request = requestsByScene.get(sceneId);
    if (
      typeof requestId === "string" &&
      request &&
      request.value.promptHash === promptHash
    ) {
      exactSuccessById.set(requestId, { request, response, sceneId });
    }
  }

  const exactByLogName = new Map();
  for (const log of logs) {
    const requestId = log.value?.response?.request_id;
    const evidence = exactSuccessById.get(requestId);
    if (!evidence || log.value?.caller?.stage !== evidence.sceneId) {
      continue;
    }
    exactByLogName.set(log.name, { ...evidence, requestId, pairedSuccess: log });

    const successTime = Date.parse(log.value.timestamp);
    const preDispatch = logs
      .filter((candidate) =>
        candidate.value?.caller?.stage === evidence.sceneId &&
        candidate.value?.paidProviderCalled === false &&
        candidate.value?.response === undefined &&
        Date.parse(candidate.value.timestamp) <= successTime
      )
      .sort((left, right) => Date.parse(right.value.timestamp) - Date.parse(left.value.timestamp))[0];
    if (preDispatch) {
      exactByLogName.set(preDispatch.name, { ...evidence, requestId, pairedSuccess: log });
    }
  }

  await fs.mkdir(restoredDir, { recursive: true });
  const restoredAt = new Date().toISOString();
  const index = [];

  for (const log of logs) {
    const evidence = exactByLogName.get(log.name);
    let restored = log.value;
    let restoration;
    if (evidence) {
      restored = setRestoredPrompt(restored, evidence.request.value.prompt);
      restoration = {
        status: "exact",
        restoredAt,
        sceneId: evidence.sceneId,
        requestId: evidence.requestId,
        promptHash: evidence.request.value.promptHash,
        evidence: {
          providerRequest: path.relative(episodeDir, evidence.request.filePath),
          providerResponse: path.relative(episodeDir, evidence.response.filePath),
          pairedSuccessLog: path.relative(debugDir, evidence.pairedSuccess.filePath),
        },
      };
    } else {
      restoration = {
        status: "unavailable",
        restoredAt,
        sceneId: log.value?.caller?.stage,
        reason: "The exact historical prompt snapshot was overwritten; no request-id plus prompt-hash match remains locally.",
      };
    }

    const output = { ...restored, restoration };
    await fs.writeFile(path.join(restoredDir, log.name), `${JSON.stringify(output, null, 2)}\n`, "utf8");
    index.push({
      file: log.name,
      timestamp: log.value.timestamp,
      sceneId: log.value?.caller?.stage,
      paidProviderCalled: log.value.paidProviderCalled,
      requestId: log.value?.response?.request_id,
      durationMs: log.value.durationMs,
      restorationStatus: restoration.status,
      ...(restoration.status === "exact" ? { promptHash: restoration.promptHash } : {}),
    });
  }

  const exactRecords = index.filter((entry) => entry.restorationStatus === "exact").length;
  const exactPaidCalls = index.filter((entry) => entry.restorationStatus === "exact" && entry.paidProviderCalled).length;
  const unavailablePaidCalls = index.filter((entry) => entry.restorationStatus === "unavailable" && entry.paidProviderCalled).length;
  const summary = {
    schemaVersion: 1,
    generatedAt: restoredAt,
    sourceDirectory: path.relative(episodeDir, debugDir),
    outputDirectory: path.relative(episodeDir, restoredDir),
    originalLogsModified: false,
    totals: {
      records: index.length,
      paidCalls: index.filter((entry) => entry.paidProviderCalled).length,
      exactRecords,
      exactPaidCalls,
      unavailablePaidCalls,
    },
    note: "Only prompts backed by both the persisted provider request hash and matching OpenAI request ID are restored. Image base64 output and secrets remain redacted.",
    records: index,
  };
  await fs.writeFile(path.join(restoredDir, "restoration-summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify(summary.totals)}\n${restoredDir}\n`);
}

await main();
