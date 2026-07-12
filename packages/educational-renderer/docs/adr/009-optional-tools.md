# ADR 009: Blender and Graphviz

Accepted. Both are optional capabilities. Neither is a package dependency or invoked by v0.1 scenes.
Future scene registries must probe and fail only the scene that explicitly requests an optional tool.
