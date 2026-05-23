import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let initialized = false;

export function initFirebaseAdmin() {
  if (initialized) return admin;

  const credPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    path.resolve(process.cwd(), "firebase-service-account.json");

  if (!fs.existsSync(credPath)) {
    throw new Error(
      `Firebase service account JSON not found at ${credPath}. Set FIREBASE_SERVICE_ACCOUNT_PATH or place the file at the default location.`
    );
  }

  const serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  initialized = true;
  console.log(
    `Firebase Admin initialized (project: ${serviceAccount.project_id})`
  );
  return admin;
}

export { admin };
