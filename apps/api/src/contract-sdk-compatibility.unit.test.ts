import { describe, expect, it } from "vitest";

import {
  SDK_V1_CONSTS,
  SDK_V1_ENUMS,
  SDK_V1_OBJECT_SCHEMAS,
  SDK_V1_OPERATIONS,
} from "../../../packages/api-sdk/src/v1-contract.js";
import { openApiDocument } from "./contract.js";

type JsonObject = Readonly<Record<string, unknown>>;

function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an OpenAPI object.");
  return value as JsonObject;
}

function refName(value: unknown): string | null {
  const reference = object(value)["$ref"];
  return typeof reference === "string"
    ? reference.split("/").at(-1) ?? null
    : null;
}

function operationSchema(operation: JsonObject, kind: "request" | "response", status?: string): string | null {
  const source = kind === "request"
    ? object(object(object(operation["requestBody"])["content"])["application/json"])["schema"]
    : object(object(object(object(operation["responses"])[status!])["content"])["application/json"])["schema"];
  return refName(source);
}

function schemaAt(path: string): JsonObject {
  const [schemaName, ...segments] = path.split(".");
  let current = object(object(openApiDocument.components.schemas)[schemaName!]);
  for (const segment of segments) {
    current = segment === "items"
      ? object(current["items"])
      : object(object(current["properties"])[segment!]);
  }
  return current;
}

describe("OpenAPI and TypeScript SDK compatibility", () => {
  it("binds every and only OpenAPI operation to the same SDK method, path, and method", () => {
    const actual = new Map<string, { readonly method: string; readonly path: string; readonly operation: JsonObject }>();
    for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
      for (const [method, candidate] of Object.entries(pathItem)) {
        const operation = object(candidate);
        const operationId = operation["operationId"];
        expect(typeof operationId).toBe("string");
        actual.set(operationId as string, { method: method.toUpperCase(), path, operation });
      }
    }

    expect([...actual.keys()].sort()).toEqual(Object.keys(SDK_V1_OPERATIONS).sort());
    for (const [operationId, expected] of Object.entries(SDK_V1_OPERATIONS)) {
      const wire = actual.get(operationId);
      expect(wire, operationId).toBeDefined();
      expect({ method: wire!.method, path: wire!.path }).toEqual({
        method: expected.method,
        path: expected.path,
      });
      expect(operationSchema(wire!.operation, "response", expected.successStatus)).toBe(expected.responseSchema);
      expect(wire!.operation["requestBody"] === undefined ? null : operationSchema(wire!.operation, "request"))
        .toBe(expected.requestSchema);

      const headers = (wire!.operation["parameters"] as readonly unknown[] | undefined ?? [])
        .map(refName)
        .filter((name): name is "IdempotencyKey" | "IfMatch" => name === "IdempotencyKey" || name === "IfMatch")
        .sort();
      expect(headers).toEqual([...expected.requiredHeaders].sort());

      const problemResponses = Object.entries(object(wire!.operation["responses"]))
        .filter(([status]) => !status.startsWith("2"))
        .map(([, response]) => refName(response))
        .filter((name): name is string => name !== null);
      expect(problemResponses.length > 0).toBe(expected.problemResponses);
      for (const responseName of problemResponses) {
        const response = object(object(openApiDocument.components.responses)[responseName]);
        const problemSchema = object(
          object(object(response["content"])["application/problem+json"])["schema"]
        );
        expect(refName(problemSchema)).toBe("Problem");
      }
    }
  });

  it("rejects public object requiredness and openness drift", () => {
    for (const [schemaName, expected] of Object.entries(SDK_V1_OBJECT_SCHEMAS)) {
      const schema = object(object(openApiDocument.components.schemas)[schemaName]);
      const required = [...(schema["required"] as readonly string[] | undefined ?? [])].sort();
      expect(required, schemaName).toEqual([...expected.required].sort());
      expect(schema["additionalProperties"] !== false, schemaName).toBe(expected.additionalProperties);
    }
  });

  it("rejects narrowing or widening of SDK enum and literal wire values", () => {
    for (const [path, expected] of Object.entries(SDK_V1_ENUMS))
      expect(schemaAt(path)["enum"], path).toEqual(expected);
    for (const [path, expected] of Object.entries(SDK_V1_CONSTS))
      expect(schemaAt(path)["const"], path).toBe(expected);
  });
});
