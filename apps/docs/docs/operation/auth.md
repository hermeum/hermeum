---
title: Auth
description: Email OTP auth, allowed email domains, and SMTP.
sidebar_label: Auth
sidebar_position: 6
displayed_sidebar: docsSidebar
---

# Auth

Hermeum authenticates users at `/auth/*` on the web server. The auth flow is
**email OTP** — users enter their email, receive a one-time code, and sign in
with it. There are no passwords.

Sessions are signed with `BETTER_AUTH_SECRET` (required for production;
generate with `openssl rand -base64 32`). The auth tables live in the same
database as the rest of Hermeum.

## Allowed email domains

Set `HERMEUM_ALLOWED_EMAIL_DOMAIN` to restrict OTP delivery to a single domain
(e.g. `yourcompany.com`). When set, the
`/auth/sign-in/email-otp/send-verification-otp` endpoint rejects emails that
don't end with `@<domain>` before sending the code. Leave it unset to allow any
email.

This is a soft gate — it controls who can *request* a code, not who can *use*
one. Combine with network-level access controls if you need hard isolation.

## SMTP

Set `HERMEUM_SMTP_URL` to a connection URL (e.g.
`smtps://user:pass@mail.example.com:465`) so OTP codes can be emailed to users.
The URL is passed directly to
[nodemailer's `createTransport`](https://nodemailer.com/smtp/); any form
nodemailer accepts works.
