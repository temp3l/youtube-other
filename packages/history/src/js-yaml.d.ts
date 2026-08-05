declare module "js-yaml" {
  export interface Mark { readonly line: number; }
  export class YAMLException extends Error {
    readonly reason?: string;
    readonly mark?: Mark;
  }
  export const JSON_SCHEMA: unknown;
  export function load(source: string, options?: {
    readonly schema?: unknown;
    readonly json?: boolean;
    readonly filename?: string;
  }): unknown;
}
