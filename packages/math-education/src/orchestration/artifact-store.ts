import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "@mediaforge/shared";
import { z } from "zod";
import {
  createArtifactLineage,
  type MathArtifactLineage,
  type MathStage,
} from "./workflow.js";
import { type MathArtifactSchemaVersion } from "./artifact-schemas.js";

export class MathArtifactStore {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(relativePath: string): string {
    if (path.isAbsolute(relativePath) || relativePath.includes("\\"))
      throw new Error("Math artifact path must be portable and relative.");
    const target = path.resolve(this.root, relativePath);
    if (!target.startsWith(`${this.root}${path.sep}`))
      throw new Error("Math artifact path traversal rejected.");
    return target;
  }

  async write<T>(args: {
    relativePath: string;
    schema: z.ZodType<T>;
    value: unknown;
    schemaVersion: MathArtifactSchemaVersion;
    parentHashes: readonly string[];
    producedBy: MathStage;
  }): Promise<{ value: T; lineage: MathArtifactLineage }> {
    const parsed = args.schema.parse(args.value);
    const target = this.resolve(args.relativePath);
    await this.assertNoSymlinkAncestors(target);
    await writeJsonAtomic(target, parsed);
    return {
      value: parsed,
      lineage: await createArtifactLineage({
        root: this.root,
        relativePath: args.relativePath,
        schemaVersion: args.schemaVersion,
        parentHashes: args.parentHashes,
        producedBy: args.producedBy,
      }),
    };
  }

  async read<T>(relativePath: string, schema: z.ZodType<T>): Promise<T | null> {
    const target = this.resolve(relativePath);
    try {
      await this.assertNoSymlinkAncestors(target);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Artifact is not a regular file.");
      return schema.parse(
        JSON.parse(await fs.readFile(target, "utf8")) as unknown
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      const quarantineDir = path.join(this.root, "state", "quarantine");
      await fs.mkdir(quarantineDir, { recursive: true });
      const quarantine = path.join(
        quarantineDir,
        `${path.basename(target)}.${Date.now()}.corrupt`
      );
      await fs.rename(target, quarantine).catch(() => undefined);
      throw new Error(`Math artifact was quarantined: ${quarantine}`, {
        cause: error,
      });
    }
  }

  private async assertNoSymlinkAncestors(target: string): Promise<void> {
    const relative = path.relative(this.root, path.dirname(target));
    let current = this.root;
    for (const part of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error(`Symlink ancestor rejected: ${current}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
