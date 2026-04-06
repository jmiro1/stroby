import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,

  // Strip PII from all events before sending
  beforeSend(event) {
    // Remove message content, phone numbers, emails from logs
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      for (const key of ["phone", "email", "content", "body", "message", "apiKey", "apiSecret", "password"]) {
        if (data[key]) data[key] = "[redacted]";
      }
    }
    // Scrub phone numbers from error messages
    if (event.exception?.values) {
      for (const exc of event.exception.values) {
        if (exc.value) {
          exc.value = exc.value.replace(/\+?\d{10,15}/g, "[phone]");
          exc.value = exc.value.replace(/[\w._-]+@[\w.-]+\.\w+/g, "[email]");
        }
      }
    }
    return event;
  },

  ignoreErrors: [
    // Ignore expected errors
    "Rate limit exceeded",
    "Unauthorized",
  ],
});
