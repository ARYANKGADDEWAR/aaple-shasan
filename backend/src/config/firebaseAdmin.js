// src/config/firebaseAdmin.js
const admin = require('firebase-admin');
const logger = require('./logger');

function buildCredential() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    logger.warn('Firebase Admin env variables are not fully configured');
    return null;
  }

  return admin.credential.cert({ projectId, clientEmail, privateKey });
}

if (!admin.apps.length) {
  const credential = buildCredential();
  if (credential) {
    admin.initializeApp({ credential });
  }
}

module.exports = admin;
