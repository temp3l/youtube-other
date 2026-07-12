import { type z } from "zod";
import { mathMetadataSchema } from "../metadata/math-metadata.js";
export type MathMetadata = z.infer<typeof mathMetadataSchema>;
