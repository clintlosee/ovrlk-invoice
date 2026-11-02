# Auth: email+password with OTP, locked sign-up, no client logins

Owners sign in with email and password plus an emailed one-time code; TOTP or passkey is optional and encouraged. The sign-up page exists but shows Coming soon and rejects registrations until opened. Clients never have accounts: they reach an Invoice through a long, random, expiring Invoice Link that is rate limited.
