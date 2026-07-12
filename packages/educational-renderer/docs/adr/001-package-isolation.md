# ADR 001: Package isolation

Accepted. Use the repository scope but no `@mediaforge/*` dependencies. A focused architecture test
rejects reverse coupling. Future applications may depend on this package through an adapter only.
