import mongoose from "mongoose";

/**
 * Records a sign-in or sign-out event from the client. Used by the admin
 * Activity page to see who has been accessing the app.
 *
 * Recorded by:
 *   - Client AuthContext on successful sign-in (Google + email/password)
 *   - Client AuthContext on explicit sign-out
 *
 * NOT recorded:
 *   - Token refreshes (Firebase handles silently in background)
 *   - Failed logins (we don't have a server-side hook for those; the
 *     client never gets a token to send)
 */
const authEventSchema = new mongoose.Schema(
  {
    // Firebase UID of the account that signed in/out. May be the app owner
    // or a guest user.
    userId: { type: String, required: true, index: true },

    // Email at the time of the event (lower-cased for consistency).
    email: { type: String, required: true, lowercase: true, trim: true, index: true },

    // What kind of event this is.
    eventType: {
      type: String,
      enum: ["login", "logout"],
      required: true,
      index: true,
    },

    // Optional display name from Firebase.
    displayName: { type: String, default: "" },

    // Source of the credential — google.com, password, etc. Sent by the
    // client where known. Empty string if unknown (e.g. logout).
    provider: { type: String, default: "" },

    // Best-effort context for forensics.
    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

// Compound index lets us efficiently page the admin list (newest first)
// and quickly find a specific user's history.
authEventSchema.index({ createdAt: -1 });
authEventSchema.index({ email: 1, createdAt: -1 });

export const AuthEvent = mongoose.model("AuthEvent", authEventSchema);
