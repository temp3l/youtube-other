import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { countSpokenWords } from "@mediaforge/shared";
import { rewriteShortStories } from "./short-rewrite.service.js";
import { FULL_STORY_PROVENANCE_MARKER, SHORT_REWRITE_PROMPT_VERSION } from "./short-rewrite.constants.js";

type MockResponse = {
  readonly id?: string;
  readonly output_text: string;
};

function buildNarration(wordTarget: number): string {
  const sentences = [
    "Mara heard the doll breathing under the attic door.",
    "When she opened it, the doll sat on the nursery chair with wet hands and her own name scratched across the glass.",
    "She burned the dress, locked the trunk, and thought the house had gone quiet, but the final photograph on the stairs showed the doll behind her brother.",
  ];
  let narration = sentences.join(" ");
  let index = 0;
  while (countSpokenWords(narration) < wordTarget) {
    narration = `${narration} silent${index}`;
    index += 1;
  }
  return narration;
}

function makeMockClient(responses: readonly MockResponse[] = []) {
  const queue = [...responses];
  const responseFn = vi.fn(async () => {
    const next = queue.shift();
    if (!next) {
      throw new Error("No mock response available.");
    }
    return {
      id: next.id ?? "mock-response",
      output_text: next.output_text,
      output_parsed: JSON.parse(next.output_text),
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 5 },
      },
    };
  });
  return {
    responses: {
      create: responseFn,
      parse: responseFn,
    },
  };
}

function buildResponseJson(args: {
  readonly title: string;
  readonly wordCount: number;
  readonly thumbnailText: string;
  readonly fullVideoBridge: string;
  readonly narration?: string;
}): string {
  const narration = args.narration ?? buildNarration(args.wordCount);
  return JSON.stringify(
    {
      title: args.title,
      hook: narration.split(". ")[0]?.endsWith(".")
        ? narration.split(". ")[0]
        : `${narration.split(". ")[0] ?? ""}.`,
      narration,
      wordCount: 1,
      estimatedDurationSecondsAt175Wpm: 1,
      estimatedDurationSecondsAt180Wpm: 1,
      thumbnailText: args.thumbnailText,
      fullVideoBridge: args.fullVideoBridge,
    },
    null,
    2
  );
}

async function createSourceStory(tempRoot: string): Promise<string> {
  const episodeDir = path.join(tempRoot, "009-the-christmas-doll", "source");
  await fs.mkdir(episodeDir, { recursive: true });
  const sourcePath = path.join(episodeDir, "009-the-christmas-doll-en-full.md");
  await fs.writeFile(
    sourcePath,
    [
      "# Episode 009 — The Christmas Doll",
      FULL_STORY_PROVENANCE_MARKER,
      "",
      "## Audio Generation Instructions",
      "- Use a steady narrator.",
      "",
      "## Narration Script",
      "Mara heard the doll breathing under the attic door.",
      "When she opened it, the doll sat on the nursery chair with wet hands and her own name scratched across the glass.",
      "She burned the dress, locked the trunk, and thought the house had gone quiet, but the final photograph on the stairs showed the doll behind her brother.",
    ].join("\n"),
    "utf8"
  );
  return sourcePath;
}

async function createRawCompatibilitySource(tempRoot: string): Promise<string> {
  const sourceDir = path.join(tempRoot, "incoming");
  await fs.mkdir(sourceDir, { recursive: true });
  const sourcePath = path.join(sourceDir, "009-the-christmas-doll-en-full.md");
  await fs.writeFile(
    sourcePath,
    [
      "# Episode 009 — The Christmas Doll",
      "",
      "## Narration Script",
      "Mara heard the doll breathing under the attic door.",
      "When she opened it, the doll sat on the nursery chair with wet hands and her own name scratched across the glass.",
      "She burned the dress, locked the trunk, and thought the house had gone quiet, but the final photograph on the stairs showed the doll behind her brother.",
    ].join("\n"),
    "utf8"
  );
  return sourcePath;
}

describe("short rewrite service", () => {
  it("writes localized markdown and JSON for a successful generation", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-success-"));
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-success",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 155,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);

    const summary = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(client.responses.create).toHaveBeenCalledTimes(1);
    expect(summary.artifacts[0]?.status).toBe("completed");
    const markdownPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.md"
    );
    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    expect(await fs.readFile(markdownPath, "utf8")).toContain("# Narration Script");
    const sidecar = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
      readonly generation: { readonly wordCount: number };
    };
    expect(sidecar.generation.wordCount).toBe(155);
  });

  it("repairs a narration that exceeds the hard word limit", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-repair-"));
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 171,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
      {
        id: "resp-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 154,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);

    const summary = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    const sidecar = JSON.parse(await fs.readFile(jsonPath, "utf8")) as {
      readonly generation: { readonly wordCount: number };
    };
    expect(sidecar.generation.wordCount).toBe(154);
  });

  it("repairs a narration that contains editorial commentary", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-editorial-"));
    const sourcePath = await createSourceStory(tempRoot);
    const editorialNarration = buildNarration(155).replace(
      "When she opened it, the doll sat on the nursery chair",
      "When she opened it, the danger became personal and the doll sat on the nursery chair"
    );
    const client = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 155,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
          narration: editorialNarration,
        }),
      },
      {
        id: "resp-repair",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 154,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);

    const summary = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
  });

  it("does not call OpenAI during dry-run", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-dry-run-"));
    const sourcePath = await createSourceStory(tempRoot);
    const client = makeMockClient();

    const summary = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: true,
        resume: false,
        overwrite: false,
      },
      {
        client,
      }
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.skipped).toBe(1);
    expect(client.responses.create).not.toHaveBeenCalled();
  });

  it("materializes the canonical source before generating when compatibility mode is enabled", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-compat-source-"));
    const rawSource = await createRawCompatibilitySource(tempRoot);
    const client = makeMockClient([
      {
        id: "resp-compatibility",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 153,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);

    const summary = await rewriteShortStories(
      {
        inputPath: rawSource,
        outputRoot: tempRoot,
        episodeSlug: "the-christmas-doll",
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        allowSourceInput: true,
      },
      {
        client,
      }
    );

    expect(summary.completed).toBe(1);
    expect(summary.sourcePath).toBe(
      path.join(
        tempRoot,
        "009-the-christmas-doll",
        "source",
        "009-the-christmas-doll-en-full.md"
      )
    );
    expect(
      await fs.readFile(
        path.join(
          tempRoot,
          "009-the-christmas-doll",
          "source",
          "009-the-christmas-doll-en-full.md"
        ),
        "utf8"
      )
    ).toContain("Mara heard the doll breathing under the attic door.");
  });

  it("skips valid artifacts on resume and regenerates stale hashes", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-resume-"));
    const sourcePath = await createSourceStory(tempRoot);
    const initialClient = makeMockClient([
      {
        id: "resp-initial",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 152,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);

    const initial = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client: initialClient,
      }
    );
    expect(initial.completed).toBe(1);

    const jsonPath = path.join(
      tempRoot,
      "009-the-christmas-doll",
      "de",
      "short",
      "009-the-christmas-doll-de-short.json"
    );
    const stale = JSON.parse(await fs.readFile(jsonPath, "utf8")) as Record<string, unknown>;
    stale.sourceSha256 = "0".repeat(64);
    await fs.writeFile(jsonPath, `${JSON.stringify(stale, null, 2)}\n`, "utf8");

    const resumeClient = makeMockClient([
      {
        id: "resp-resume",
        output_text: buildResponseJson({
          title: "Das Puppenhaus",
          wordCount: 153,
          thumbnailText: "Nasse Hände",
          fullVideoBridge: "Sieh dir die ganze Episode an.",
        }),
      },
    ]);
    const regenerated = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: true,
        overwrite: false,
        maxRetries: 0,
      },
      {
        client: resumeClient,
      }
    );
    expect(resumeClient.responses.create).toHaveBeenCalledTimes(1);
    expect(regenerated.completed).toBe(1);
    expect(regenerated.failed).toBe(0);
  });

  it("keeps completed languages isolated when one request fails", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "short-rewrite-partial-"));
    const sourcePath = await createSourceStory(tempRoot);
    const client = {
      responses: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            id: "resp-success",
            output_text: buildResponseJson({
              title: "Das Puppenhaus",
              wordCount: 153,
              thumbnailText: "Nasse Hände",
              fullVideoBridge: "Sieh dir die ganze Episode an.",
            }),
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2,
            },
          })
          .mockRejectedValueOnce(new Error("rate limited")),
      },
    };

    const summary = await rewriteShortStories(
      {
        inputPath: sourcePath,
        outputRoot: tempRoot,
        languages: ["de", "es"],
        model: "gpt-5-mini",
        dryRun: false,
        resume: false,
        overwrite: false,
        maxRetries: 0,
        maxConcurrency: 1,
      },
      {
        client,
      }
    );

    expect(summary.failed).toBeGreaterThan(0);
    expect(summary.artifacts).toHaveLength(2);
    expect(client.responses.create).toHaveBeenCalledTimes(2);
    const debugDir = path.join(tempRoot, "009-the-christmas-doll", "debug");
    expect(
      await fs.readFile(path.join(debugDir, "stories-rewrite-short-es.request.json"), "utf8")
    ).toContain("short_rewrite_result");
    expect(
      JSON.parse(
        await fs.readFile(path.join(debugDir, "stories-rewrite-short-es.response.json"), "utf8")
      )
    ).toHaveProperty("status", "failed");
  });
});
