# Rooiam Agent Rules

Before making product, API, UI, roadmap, or architecture changes in this repo, read:

- [docs/internal/product_policy.md](./docs/internal/product_policy.md)

That document is the product doctrine for Rooiam.

It is not optional context.
It defines the direction this product is supposed to move toward.

## Required Rule

When making decisions, prefer changes that improve:

- identity security
- tenant control
- developer integration quality
- self-host trust
- product clarity

Avoid changes that add:

- feature sprawl
- confusing terminology
- unnecessary customization
- weak tenant boundaries
- protocol drift

## Implementation Rule

If a proposed change conflicts with `docs/internal/product_policy.md`, the doctrine wins unless the user explicitly decides to change the doctrine itself.
