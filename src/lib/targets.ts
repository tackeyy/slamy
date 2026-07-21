import { TargetResolver, type WorkspaceCatalog } from "../targets/index.js";

export type CreateTargetResolverOptions = {
  workspaceCatalog: WorkspaceCatalog;
};

export function createTargetResolver(options: CreateTargetResolverOptions): TargetResolver {
  return new TargetResolver(options.workspaceCatalog);
}
