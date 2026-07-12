import fs from "node:fs/promises";
import path from "node:path";
import { lessonIdSchema, mathLanguageSchema } from "../domain/index.js";

export class MathWorkspacePathResolver {
  readonly root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  resolve(...segments: readonly string[]): string {
    const target = path.resolve(this.root, ...segments);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`))
      throw new Error("Math workspace path traversal rejected.");
    return target;
  }
  async assertReadable(target: string): Promise<string> {
    const contained = this.resolve(path.relative(this.root, target));
    const rootReal = await fs.realpath(this.root);
    const stat = await fs.lstat(contained);
    if (stat.isSymbolicLink() || !stat.isFile())
      throw new Error(
        "Math workspace artifact must be a regular non-symlink file."
      );
    const real = await fs.realpath(contained);
    if (!real.startsWith(`${rootReal}${path.sep}`))
      throw new Error("Math workspace symlink escape rejected.");
    return contained;
  }
  async assertWritable(target: string): Promise<string> {
    const contained = this.resolve(path.relative(this.root, target));
    let current = this.root;
    const relativeParent = path.relative(this.root, path.dirname(contained));
    for (const part of relativeParent.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error(
            `Math workspace symlink ancestor rejected: ${current}`
          );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return contained;
  }
  async readJson(target: string): Promise<unknown> {
    return JSON.parse(
      await fs.readFile(await this.assertReadable(target), "utf8")
    ) as unknown;
  }
  lesson(lessonId: string): string {
    return this.resolve(lessonIdSchema.parse(lessonId));
  }
  locale(lessonId: string, language: string): string {
    return this.resolve(
      lessonIdSchema.parse(lessonId),
      "locales",
      mathLanguageSchema.parse(language)
    );
  }
  manifest(lessonId: string): string {
    return this.resolve(lessonIdSchema.parse(lessonId), "manifest.json");
  }
}
