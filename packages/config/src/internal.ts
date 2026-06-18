import { ConfigurationError } from "@mediaforge/domain";

export function configurationErrorFromUnknown(message: string): ConfigurationError {
  return new ConfigurationError(message);
}
