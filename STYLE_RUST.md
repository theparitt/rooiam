````md
# Rust Style Guide

This project uses a readability-first Rust style optimized for long-term maintenance.

The goal is simple: code should be easy to scan, easy to revisit, and visually consistent across the whole repository.

## Core Principles

- Prefer readability over compactness
- Prefer consistency over personal preference in individual files
- Keep formatting stable across the repository
- Write code in a way that is comfortable to re-read months later

## Function Brace Style

All functions use this brace layout:

```rust
fn process()
{
}
````

Opening braces must be placed on the next line.

## Spacing Rules

### After `use` statements

There must be **5 blank lines** after the final `use` statement before the first non-`use` item.

This is the only place where **5 blank lines** are used.

Example:

```rust
use std::sync::Arc;
use yew::prelude::*;






const MAX_ITEMS: usize = 20;
```

### Between constants and the first function

There must be **3 blank lines** between the constant section and the first function.

Example:

```rust
const MAX_ITEMS: usize = 20;
const DEFAULT_PAGE: usize = 1;



fn init()
{
}
```

### Between functions

There must be **3 blank lines** between each function.

Example:

```rust
fn alpha()
{
    // ...
}



fn beta()
{
    // ...
}
```

### Inside the same function

Within the same function, separate logical blocks with blank lines.

* Use **1 blank line** for normal separation between small logical blocks
* Use **2 blank lines** only when stronger visual separation is needed

Example:

```rust
fn process()
{
    let user = load_user();

    let permissions = load_permissions();

    apply_permissions( user, permissions );
}
```

### Between top-level items

Between top-level items such as:

* `const`
* `type`
* `struct`
* `enum`
* `trait`
* `impl`
* free functions

use **3 blank lines**.

Example:

```rust
pub struct AppState
{
    // ...
}



pub enum Msg
{
    // ...
}



impl AppState
{
    // ...
}
```

## File Section Order

Use this order when possible:

1. `use`
2. constants
3. type aliases
4. structs
5. enums
6. traits
7. impl blocks
8. free functions

Example:

```rust
use std::sync::Arc;






const MAX_ITEMS: usize = 20;



type UserId = i64;



pub struct AppState
{
    // ...
}



pub enum Msg
{
    // ...
}



impl AppState
{
    // ...
}



fn helper()
{
    // ...
}
```

## `use` Statements

Prefer one module per `use` statement.

Example:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use yew::prelude::*;
```

Avoid packing unrelated imports into a single long grouped line unless there is a strong reason.

## Function Length and Readability

Prefer functions that can be read top-to-bottom without mental jumping.

When a function starts doing multiple jobs:

* split repeated logic into helpers
* separate parsing, validation, mutation, and rendering steps
* keep each block visually distinct

## Logical Blocks

Inside a function, group related lines together.

Good:

```rust
fn build_response()
{
    let user = load_user();
    let settings = load_settings();

    let theme = resolve_theme( &user, &settings );
    let locale = resolve_locale( &user, &settings );

    render_response( theme, locale )
}
```

## Constants

Place file-level constants near the top of the file, below `use`.

Use uppercase snake case:

```rust
const MAX_ITEMS: usize = 20;
const DEFAULT_PAGE_SIZE: usize = 50;
```

## Naming

Use standard Rust naming conventions unless there is a strong project-specific reason not to.

* `snake_case` for functions, variables, and modules
* `PascalCase` for structs, enums, and traits
* `SCREAMING_SNAKE_CASE` for constants

Prefer descriptive names over clever names.

## Structs and Enums

Keep definitions vertically readable.

Example:

```rust
pub struct SessionInfo
{
    pub session_id: String,
    pub user_id: i64,
    pub expires_at: i64,
}
```

```rust
pub enum AuthMethod
{
    Password,
    Passkey,
    MagicLink,
}
```

## `impl` Blocks

Keep related methods together.

Preferred grouping:

* constructors
* mutators
* accessors
* helpers

Example:

```rust
impl SessionInfo
{
    pub fn new( session_id: String, user_id: i64, expires_at: i64 ) -> Self
    {
        Self
        {
            session_id,
            user_id,
            expires_at,
        }
    }


    pub fn is_expired( &self, now: i64 ) -> bool
    {
        now >= self.expires_at
    }
}
```

## Match Formatting

Prefer readable match arms.

Example:

```rust
match auth_method
{
    AuthMethod::Password =>
    {
        handle_password_login()
    }

    AuthMethod::Passkey =>
    {
        handle_passkey_login()
    }

    AuthMethod::MagicLink =>
    {
        handle_magic_link_login()
    }
}
```

## Early Returns

Prefer early returns when they reduce nesting and improve readability.

Example:

```rust
fn validate_email( email: &str ) -> Result<(), Error>
{
    if email.trim().is_empty()
    {
        return Err( Error::InvalidEmail );
    }

    if !email.contains( '@' )
    {
        return Err( Error::InvalidEmail );
    }

    Ok( () )
}
```

## Comments

Use comments to explain intent, not obvious syntax.

Good:

```rust
// Keep the raw redirect target out of the client flow.
// The final redirect must come from tenant configuration.
```

## Error Handling

Prefer explicit and readable error handling.

* return meaningful errors
* avoid hiding important failure paths
* add context where the source of failure may be unclear
* do not over-compress error logic just to save lines

## Final Rule

Consistency is more important than convention.

If a file already follows this style, continue using that style throughout the file.
If introducing a new file, follow this guide from the start.

```
```
