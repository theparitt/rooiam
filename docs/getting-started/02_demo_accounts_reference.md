# Demo Accounts & Roles

To explore Rooiam's multi-tenant and RBAC features, we have pre-seeded the system with a variety of accounts across different organizations and roles.

> [!NOTE]
> These accounts are only available when `ROOIAM_MODE=demo` is set in your `.env`.

## 1. Platform Administration

These accounts have global access to manage all tenants, SMTP settings, and system configurations.

| Email | Name | Role | Access |
| :--- | :--- | :--- | :--- |
| `owner@rooiam.demo` | Roo Owner | Platform Owner | Full system control |
| `admin@rooiam.demo` | Roo Admin | Platform Admin | System-wide settings |

---

## 2. Tenant (Organization) Administration
These accounts manage specific businesses/organizations.

### Shared Admins

Some admins manage multiple test organizations to demonstrate switching context.

| Email | Name | Manages |
| :--- | :--- | :--- |
| `rooroo@sweetfactory.demo` | rooroo | **RooChoco**, **MintMallow** |
| `moomoo@whitebakery.demo` | Moo Moo | **MelonHoneyToast**, **BerryBurger**, **MooPizza** |

### Specific Org Admins

Typical "IT Admin" or "HR" roles within a single company.

| Organization | Email | Name | Role |
| :--- | :--- | :--- | :--- |
| **RooChoco** | `fondue@honeychoco.demo` | Fondue | Admin |
| **RooChoco** | `bonbon@waferchoco.demo` | Bonbon | Admin |
| **MintMallow** | `peppermint@mintmallow.demo` | Peppermint | Admin |
| **MintMallow** | `spearmint@mintmallow.demo` | Spearmint | Admin |

---

## 3. End Users (Customers)

These are standard users (e.g., employees or customers of the tenants) who only have access to their respective company apps.

| Organization | Email | Name | Manages |
| :--- | :--- | :--- | :--- |
| **RooChoco** | `minmin@lovechocolate.user` | Minmin | Normal User |
| **MintMallow** | `lulu@softmallow.user` | Lulu | Normal User |
| **MelonHoneyToast** | `sunny@toastgarden.user` | Sunny | Normal User |
| **BerryBurger** | `poppy@jamdiner.user` | Poppy | Normal User |
| **MooPizza** | `mozza@cheesetown.user` | Mozza | Normal User |

---

## 4. RBAC Roles Explained

The demo environment seeds five system roles with different permission levels:

1. **Owner**: Full control over the organization, including deletion and billing.
2. **Admin**: Can manage members, branding, and security policies but cannot delete the org.
3. **Manager**: Can view activity logs and invite new members.
4. **Viewer**: Read-only access to member lists and activity.
5. **Member**: Standard access to organization applications.
