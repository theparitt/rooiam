# Choose the Right Surface

This page exists so you know exactly which project component or documentation folder to use, and when.

If you remember only one rule, remember this:

- `rooiam-admin` = **Platform Owner** 👑 (You run the whole cloud service)
- `rooiam-app` = **Tenant Customer** 🏘️ (Businesses using your service)
- `candycloud-web` = **End User** 👤 (Employees of those businesses)

---

### Why two different "Admin" screens? ❓

1.  **Platform Admin (`rooiam-admin`)**: This is for **YOU**. Use it to set up global settings like SMTP, Google/Microsoft master keys, and to see every single organization in the system.
2.  **Tenant Portal (`rooiam-app`)**: This is for **YOUR CUSTOMERS** (e.g., "RooChoco"). They login here to upload their own logo, invite their own staff, and get their own API keys without ever seeing your global platform settings.

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

- `http://localhost:5182/?workspace=roochoco` -> `rooroo@sweetfactory.demo` or `fondue@honeychoco.demo`
- `http://localhost:5182/?workspace=mintmallow` -> `rooroo@sweetfactory.demo` or `peppermint@mintmallow.demo`

Do not use:

- `admin@rooiam.demo`

on `rooiam-app`

### Use `candycloud-web` on `5184`

URL:

- `http://localhost:5184`

Use it for:

- downstream sample client
- customer/client login testing
- callback and redirect testing
- real hosted login flow validation

Demo accounts:

- `http://localhost:5184/?org=roochoco` -> `minmin@lovechocolate.user`
- `http://localhost:5184/?org=mintmallow` -> `lulu@softmallow.user`

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

### The `rooiam-book` on `5176` 📚

URL:

- `http://localhost:5176`

Use it for:

- reading a textbook-style resource for engineers and students.
- learning about Identity and Access Management (IAM) from first principles.
- deep-diving into the actual Rust implementation and database schema of Rooiam.
