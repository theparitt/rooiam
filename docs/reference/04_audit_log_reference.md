# Audit Log Reference

This page explains the most important audit-log meanings for operators.

## Core Columns

### Action
- what happened

### Actor
- who caused it

### Target
- what area or object was affected

## Important Auth Events

### `auth.login.success`
- a human sign-in completed

Check:
- actor
- IP
- method
- workspace

### `auth.login.suspicious`
- a suspicious sign-in pattern was detected

Examples:
- new IP
- rapid IP change
- new user agent

### `auth.widget.embed_origin_blocked`
- a site tried to load the hosted widget but was not allowed

### `auth.app_callback_rejected`
- a callback target was not accepted

### `auth.logout.redirect_rejected`
- a logout redirect target was not accepted

## API Key Events

### `api_key.used`
- a workspace API key called a workspace integration endpoint

Action second line:
- API key label

Target:
- affected area
- route path

## App Events

### `oauth_client.created`
### `oauth_client.updated`
### `oauth_client.deleted`

Check:
- redirect URIs
- allowed embed origins
- whether a multi-origin app changed intentionally

## Operator Rule

When in doubt:
1. confirm the actor
2. confirm the IP
3. confirm the workspace or app affected
4. confirm whether the event matches planned work
5. if not, treat it as suspicious until explained
