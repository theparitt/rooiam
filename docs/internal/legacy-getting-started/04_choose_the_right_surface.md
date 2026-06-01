# Choose the Right Surface

This page exists so you know exactly which project component or documentation folder to use, and when.

If you remember only one rule, remember this:

- `rooiam-admin` = platform operator surface
- `rooiam-app` = tenant company login and tenant admin surface
- `rooiam-demo` = downstream sample client for customer/client testing

## Frontend Surfaces

### Use `rooiam-admin` on `5171`

URL:

- `http://localhost:5171`

Use it for:

- platform admin
- instance setup
- SMTP configuration
- Google OAuth configuration
- Microsoft OAuth configuration
- system-wide review

Demo account:

- `admin@rooiam.demo`

### Use `rooiam-app` on `5172`

URL:

- `http://localhost:5172`

Use it for:

- tenant login
- tenant admin portal
- branding
- login method policy
- tenant members
- tenant API keys
- tenant OAuth clients

Demo accounts:

- `http://localhost:5172/?org=roochoco` -> `rooroo@sweetfactory.demo`
- `http://localhost:5172/?org=mintmallow` -> `rooroo@sweetfactory.demo`

Do not use:

- `admin@rooiam.demo`

on `rooiam-app`

### Use `rooiam-demo` on `5174`

URL:

- `http://localhost:5174`

Use it for:

- downstream sample client
- customer/client login testing
- callback and redirect testing
- real hosted login flow validation

Demo accounts:

- `http://localhost:5174/?org=roochoco` -> `coco@roochoco.demo`
- `http://localhost:5174/?org=mintmallow` -> `minty@mintmallow.demo`

Do not use:

- `rooroo@sweetfactory.demo`

on `rooiam-demo`

## Marketing and Documentation Surfaces

### Use `rooiam-landing` on `5173`

URL:

- `http://localhost:5173`

Use it for:

- product landing page
- marketing copy
- linking out to documentation and GitHub

### Use `rooiam-docs` on `5175`

URL:

- `http://localhost:5175`

Use it for:

- the online documentation website UI
- navigating through setup, demo, development, and production guides
- reading integration and reference docs

### The `docs` folder

Use it for:

- writing the actual Markdown (`.md`) files that power the documentation.
- `rooiam-docs` reads these files to generate the `http://localhost:5175` documentation website.

### The `rooiam-book` folder

Use it for:

- reading a textbook-style resource designed for undergraduate students.
- learning about Identity and Access Management (IAM) concepts with Rooiam used as a practical example.
- simplified explanations that separate general concepts from internal engineering notes.
