# Demo Account Map

This page exists to prevent confusion between platform admin, tenant admin, and customer demo users.

## Email Roles

| Email | Role | Surface |
|---|---|---|
| `admin@rooiam.demo` | Platform admin | `rooiam-admin` (demo) |
| `rooroo@sweetfactory.demo` | Tenant owner | `rooiam-app` (demo) |
| `minmin@lovechocolate.user` | RooChoco end user | `candycloud-web` (demo) |
| `lulu@softmallow.user` | MintMallow end user | `candycloud-web` (demo) |

## Surface Mapping

| Surface | URL | Email Hint |
|---|---|---|
| Platform admin (demo) | `http://localhost:5181` | `admin@rooiam.demo` |
| Tenant chooser (demo) | `http://localhost:5182` | no email; choose workspace first |
| Tenant login | `http://localhost:5182/?workspace=roochoco` | `rooroo@sweetfactory.demo` |
| Tenant login | `http://localhost:5182/?workspace=mintmallow` | `rooroo@sweetfactory.demo` |
| Demo downstream app | `http://localhost:5184/?org=roochoco` | `minmin@lovechocolate.user` |
| Demo downstream app | `http://localhost:5184/?org=mintmallow` | `lulu@softmallow.user` |

## Important Boundary

- `rooiam-admin` (demo, `5181`) is for the platform operator
- `rooiam-app` (demo, `5182`) is for tenant/workspace login and tenant admin
- `candycloud-web` (`5184`) is for downstream customer/client simulation
