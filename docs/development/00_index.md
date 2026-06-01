# Development Guide

This section is for contributors and local operators.

Read in this order:

1. [Local Setup](./01_local_setup.md)
2. [Running the Stack](./02_running_the_stack.md)
3. [Demo Seed vs Normal Mode](./03_demo_seed_vs_normal.md)

## Scope

This covers:

- local dependencies
- environment variables
- migrations
- frontend apps and ports
- demo mode vs normal mode

## Version Floor

For current `0.1` development builds, use at least:

- Rust `1.88.0`
- Node.js `20`
- PostgreSQL `16`
- Redis `7`

The repo includes `rust-toolchain.toml` so Rust contributors get the expected compiler version automatically.
