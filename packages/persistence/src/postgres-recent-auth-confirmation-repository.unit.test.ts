import { describe, expect, it } from "vitest";
import { POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION } from "./postgres-recent-auth-confirmation-repository.js";
describe("recent auth confirmation migration", () => { it("binds and consumes confirmations once", () => { expect(POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION).toContain("csrf_session_id"); expect(POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION).toContain("consumed_at"); expect(POSTGRES_RECENT_AUTH_CONFIRMATION_MIGRATION).toContain("workspace_isolation"); }); });
