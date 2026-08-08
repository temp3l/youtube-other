export interface SdkV1OperationContract {
  readonly method: "GET" | "PATCH" | "POST";
  readonly path: string;
  readonly successStatus: "200" | "201" | "202";
  readonly responseSchema: string;
  readonly requestSchema: string | null;
  readonly requiredHeaders: readonly ("IdempotencyKey" | "IfMatch")[];
  readonly problemResponses: boolean;
}

export interface SdkV1ObjectSchemaContract {
  readonly required: readonly string[];
  readonly additionalProperties: boolean;
}

export type SdkV1OperationOwner =
  | "platform"
  | "content"
  | "workflow"
  | "artifact"
  | "review"
  | "publication"
  | "speech"
  | "developer"
  | "lifecycle";

export interface SdkV1OperationModule {
  readonly id: string;
  readonly owner: SdkV1OperationOwner;
  readonly operations: Readonly<Record<string, SdkV1OperationContract>>;
}
