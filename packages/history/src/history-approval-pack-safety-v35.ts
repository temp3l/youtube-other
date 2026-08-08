export const HISTORY_APPROVAL_PACK_UNSAFE_TEXT_V35 =
  /(?:\b(?:api[_-]?key|password|secret[_-](?:key|token))\b|(?:^|[/])(?:home|users)(?:[/]|$))/iu;

export function containsUnsafeApprovalPackTextV35(content: string): boolean {
  return HISTORY_APPROVAL_PACK_UNSAFE_TEXT_V35.test(content);
}
