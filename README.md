# TruGuidz Guide Portal

A lightweight web dashboard for TruGuidz guides — built as a stopgap for
guides on Android (the TruGuidz app is iOS-only right now). It talks
directly to the same Supabase backend as the iOS app, so anything created
or changed here (a listing, a booking confirmation, a message) shows up
identically in the app, and vice versa.

No build step — plain HTML/CSS/JS, loading the Supabase JS SDK from a CDN.
Same approach as [truguidz-legal](https://github.com/Robert-Long52/truguidz-legal).

## Features

- Sign in / sign up (same account as the app)
- Guide application (ID upload, waiver, submitted for manual review)
- Create/edit listings, including photos, and deactivate/reactivate
- View bookings, confirm or decline requests
- Message explorers on confirmed bookings
- Connect a Stripe account for payouts

## Local development

No dependencies — just serve the folder:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.
