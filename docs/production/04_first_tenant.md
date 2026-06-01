# 👥 First Tenant Creation

This chapter starts after the platform operator has completed instance setup.

## 1. Sign In to `rooiam-app`

Use the tenant/company surface:

- `https://login.example.com`

Do not use `rooiam-admin` for tenant setup.

## 2. Create the First Workspace

If you are the first tenant user in the instance:

1. sign in
2. open the onboarding/get-started flow
3. create a workspace/company name
4. confirm the generated slug

Example:

- name: `Acme`
- slug: `acme`

## 3. What the First Workspace Gives You

After workspace creation, the tenant owner can:

- manage branding
- manage sign-in policy
- invite staff
- create company OAuth clients
- create company API keys
- review company audit activity

## 4. Add More Workspaces

From the tenant portal:

1. open `Workspaces`
2. create an additional workspace
3. switch between workspaces as needed

One user can belong to multiple workspaces.

## 5. Invite Staff

From the tenant portal:

1. open `Staff`
2. send an invite to the staff email
3. the invited person accepts through email
4. tenant admins can change their role if they have the correct permission

## 6. Role Boundary

Tenant users are not platform admins.


