/**
 * Shared shell-command policy for Codex PreToolUse and Cursor beforeShellExecution.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */

function tokenize(command) {
  return command.trim().match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}

export function evaluateVerificationCommand(command, options = {}) {
  const allowBroad = options.allowBroadVerification === true;
  const allowAdhocDebug = options.allowAdhocDebug === true;
  const shellCommandCount = options.shellCommandCount ?? 0;
  const maxRepeatedShellCommands = options.maxRepeatedShellCommands ?? 2;

  if (allowBroad) {
    return { allowed: true };
  }

  if (typeof command !== "string" || command.trim() === "") {
    return { allowed: false, reason: "Repository command guard expected a non-empty shell command." };
  }

  const normalized = command.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();
  const tokens = tokenize(normalized);
  const hasToken = (value) => tokens.includes(value);
  const hasPrefix = (...prefix) => prefix.every((part, index) => tokens[index] === part);
  const hasAny = (...parts) => parts.some((part) => lower.includes(part));
  const hasExplicitVitestFile = tokens.some((token) =>
    /\.(unit|integration|e2e)\.test\.ts$/.test(token) || /\.acceptance\.ts$/.test(token)
  );
  const hasTestNameFilter =
    hasToken("-t") || hasToken("--testNamePattern") || hasToken("--test-name-pattern");
  const hasFocusedVitestConfig = tokens.some((token) =>
    /vitest\.(unit|integration|e2e|acceptance)\.config\.ts$/.test(token)
  );
  const hasPackageFilter = hasToken("--filter");
  const isBroadRecursive =
    hasToken("-r") ||
    hasToken("--recursive") ||
    hasToken("--workspace-root") ||
    hasToken("--if-present");
  const focusedTestCount = (normalized.match(/test:focused/g) ?? []).length;
  const isVerificationCommand =
    hasToken("test:focused") ||
    ((hasToken("vitest") || lower.includes(" vitest ")) && hasExplicitVitestFile);

  if (focusedTestCount > 1) {
    return {
      allowed: false,
      reason:
        "Chained multi-file verification is blocked. Run one `pnpm test:focused -- <test-file>` per shell command.",
    };
  }

  if (
    hasToken("build") &&
    (hasToken("&&") || hasToken(";")) &&
    (hasToken("test:focused") || lower.includes(" vitest "))
  ) {
    return {
      allowed: false,
      reason:
        "Chained build+test commands are blocked. Run one focused test file per shell command; Vitest transpiles the affected package without a separate build step.",
    };
  }

  if (isVerificationCommand && shellCommandCount > maxRepeatedShellCommands) {
    return {
      allowed: false,
      reason:
        `Repeated identical verification command blocked after ${maxRepeatedShellCommands} runs in this session. Stop, classify the failure, and report the exact test name, owning module, and smallest follow-up instead of rerunning the same command.`,
    };
  }

  if (!allowAdhocDebug && /--input-type=module\b/.test(lower) && /\s-e\s/.test(lower)) {
    return {
      allowed: false,
      reason:
        "Ad-hoc `node --input-type=module -e` debug scripts are blocked by default. Add a focused unit/acceptance test or set ALLOW_ADHOC_DEBUG=1 when explicitly authorized.",
    };
  }

  if (hasAny(" --update", " -u", " --updatesnapshot", " --update-snapshots")) {
    return {
      allowed: false,
      reason:
        "Snapshot updates are blocked by default. Re-run a focused file without update flags and edit only intentionally changed expectations.",
    };
  }

  if (
    lower.includes("fixture") &&
    /(regen|regenerate|refresh|rewrite|update|snapshot)/.test(lower)
  ) {
    return {
      allowed: false,
      reason:
        "Broad fixture regeneration is blocked by default. Classify the failure first and edit only the directly justified fixture.",
    };
  }

  if (
    hasPrefix("pnpm", "test") ||
    hasPrefix("npm", "test") ||
    hasPrefix("yarn", "test")
  ) {
    return {
      allowed: false,
      reason:
        "Unfiltered workspace test wrappers are blocked. Use `pnpm test:focused -- <test-file>` or `pnpm exec vitest run -c vitest.unit.config.ts --bail=1 <test-file>`.",
    };
  }

  if (
    hasToken("build") ||
    hasPrefix("pnpm", "build") ||
    hasPrefix("npm", "run", "build") ||
    hasPrefix("yarn", "build") ||
    (tokens[0] === "pnpm" && isBroadRecursive && hasToken("build"))
  ) {
    return {
      allowed: false,
      reason:
        "Build commands are blocked by default during agent tasks. Use focused tests first and only run package builds when explicitly authorized.",
    };
  }

  if (
    hasPrefix("pnpm", "typecheck") ||
    hasPrefix("npm", "run", "typecheck") ||
    hasPrefix("yarn", "typecheck") ||
    (tokens[0] === "pnpm" && isBroadRecursive && hasToken("typecheck"))
  ) {
    return {
      allowed: false,
      reason:
        "Workspace-wide typecheck is blocked by default. Use an affected-package command such as `pnpm --filter @mediaforge/history typecheck` after focused tests pass.",
    };
  }

  if (
    hasPrefix("pnpm", "test:unit") ||
    hasPrefix("pnpm", "test:integration") ||
    hasPrefix("pnpm", "test:e2e") ||
    hasPrefix("npm", "run", "test:unit") ||
    hasPrefix("npm", "run", "test:integration") ||
    hasPrefix("npm", "run", "test:e2e") ||
    hasPrefix("yarn", "test:unit") ||
    hasPrefix("yarn", "test:integration") ||
    hasPrefix("yarn", "test:e2e")
  ) {
    if (!hasExplicitVitestFile) {
      return {
        allowed: false,
        reason:
          "Unfiltered Vitest wrapper command blocked. Use `pnpm test:focused -- <test-file>` so the file filter is explicit.",
      };
    }
  }

  if (
    (hasToken("vitest") || lower.includes(" vitest ")) &&
    hasAny(" run", " watch", " --run") &&
    !hasExplicitVitestFile
  ) {
    return {
      allowed: false,
      reason:
        "Vitest commands must include an explicit test file in this repository. Use `pnpm test:focused -- <test-file>` and add `-t <exact name>` only when needed.",
    };
  }

  if (
    (hasToken("pnpm") && hasToken("test:focused")) ||
    ((hasToken("vitest") || lower.includes(" vitest ")) &&
      hasFocusedVitestConfig &&
      hasExplicitVitestFile) ||
    (tokens[0] === "pnpm" && hasPackageFilter && hasToken("typecheck"))
  ) {
    return { allowed: true };
  }

  if (hasTestNameFilter && !hasExplicitVitestFile) {
    return {
      allowed: false,
      reason:
        "Exact test-name filters must still be paired with an explicit test file here. Use `pnpm test:focused -- <test-file> -t <exact name>`.",
    };
  }

  return { allowed: true };
}
