# Product Surface Map

Rooiam has several visible products. This page explains who each one is for.

## `rooiam-server`
- Rust backend
- sessions
- OIDC
- OAuth provider callbacks
- workspace integration API

## `rooiam-app`
- tenant portal
- end-user login
- workspace management

## `rooiam-admin`
- platform/operator console
- instance-wide setup
- platform-wide audit review

## `rooiam-example`
- teaching and integration samples

## `rooiam-docs`
- user-facing documentation site

## `rooiam-book`
- longer-form architecture and implementation notes

## Practical Split

If you are:
- integrating a real app:
  - read `rooiam-docs`
  - use `rooiam-example`
- operating the platform:
  - use `rooiam-admin`
  - read production docs
- managing one workspace:
  - use `rooiam-app`
- extending core auth behavior:
  - work in `rooiam-server`
