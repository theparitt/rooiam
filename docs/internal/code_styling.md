# Rooiam Code Styling & Standards

A high-quality IAM platform demands extreme consistency, safety, and readability. Both the backend and frontend codebases follow strict rules ensuring the platform feels premium inside and out.

## API / Backend (`rooiam-server`)
- **Strict Rust Practices**: 
  - All code must pass `cargo clippy -- -D warnings`.
  - Enforced `rustfmt` standard formatting.
- **Domain-Driven Modularity**: 
  - Modules (`auth`, `identity`, `session`) must be self-contained in `src/modules/{module_name}`.
  - Cross-module dependencies should be minimized, communicating mostly through shared domain models or the database layer.
- **Centralized Error Handling**: 
  - Avoid using `.unwrap()` or panics anywhere in production business logic.
  - Use the customized `AppError` type in `src/shared/error.rs` to abstract database or redis failures away from the client-facing HTTP responses to prevent information leakage.
- **Security-First Mutability**:
  - Keep state immutable wherever possible. 
  - Cryptographic operations (hashing) must occur **before** data enters the persistence layer.

## Frontend (`rooiam-admin` & `rooiam-app`)
- **Type Safety**: Strictly typed **TypeScript**. Avoid using `any`; define robust interfaces mirroring the Rust API structs.
- **Component Architecture**: 
  - Functional React patterns exclusively (Hooks).
  - Business logic separated from UI rendering (use custom hooks for fetching).
- **Aesthetic Excellence (The Wow Factor)**:
  - Deep integration of custom graphics from the `\art` directory.
  - Use modern, premium dark-mode styling by default (slate, custom gradients).
  - Micro-animations (framer-motion or vanilla CSS transitions) for interactive feedback without layout shifts.
  - Consistent padding, elegant typography (e.g., Inter/Roboto), and exact alignment reflecting a highly professional B2B tool.
