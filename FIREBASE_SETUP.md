# Firebase room sync

The score board remains local until Firebase is configured.

1. Create a Firebase project and register a Web app.
2. Enable **Authentication > Sign-in method > Anonymous**.
3. Create a **Realtime Database**.
4. Copy the Web app config values into `firebase-config.js`.
5. Set the Realtime Database rules to:

```json
{
  "rules": {
    "matches": {
      "$room": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

Each connected device signs in anonymously. Anyone with a room code can read and update that room, as requested. Codes are randomly generated. Do not put personal or sensitive information in a match.

Use **Buat room** on one device, share the player link with scorekeepers, and send the monitor link to the server. Match data is visible in the Firebase Realtime Database console under `matches`.

The Firebase Web config is public client configuration. Never put a Firebase service-account key in this website.