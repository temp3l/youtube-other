import { z } from "zod";
import { verificationCheckSchema } from "../domain/index.js";

export const VERIFIER_PROTOCOL_VERSION = "math-verifier.v3";
export const MATH_SPEC_VERSION = "math-spec.v3";
export const VERIFIER_VERSION = "3.0.0";
export const SYMPY_VERSION = "1.14.0";
export const verifierRequestSchema = z.strictObject({
  protocolVersion: z.literal(VERIFIER_PROTOCOL_VERSION),
  requestId: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/u),
  mathSpecVersion: z.literal(MATH_SPEC_VERSION),
  checks: z.array(verificationCheckSchema).min(1),
});
export const verifierCheckResultSchema = z.strictObject({
  checkId: z.string(),
  status: z.enum(["passed", "failed", "unsupported", "error"]),
  expected: z.string().optional(),
  actual: z.string().optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
});
export const verifierResponseSchema = z.strictObject({
  protocolVersion: z.literal(VERIFIER_PROTOCOL_VERSION),
  requestId: z.string(),
  inputHash: z.string(),
  verifierVersion: z.literal(VERIFIER_VERSION),
  sympyVersion: z.literal(SYMPY_VERSION),
  status: z.enum(["passed", "failed", "unsupported", "error"]),
  checks: z.array(verifierCheckResultSchema),
});
export type VerifierRequest = z.infer<typeof verifierRequestSchema>;
export type VerifierResponse = z.infer<typeof verifierResponseSchema>;
