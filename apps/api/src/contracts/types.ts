export type OpenApiPathOwner =
  | "platform"
  | "content"
  | "workflow"
  | "artifact"
  | "review"
  | "publication"
  | "speech"
  | "developer"
  | "lifecycle";

export interface OpenApiPathModule {
  readonly id: string;
  readonly owner: OpenApiPathOwner;
  readonly paths: Readonly<Record<string, unknown>>;
}
