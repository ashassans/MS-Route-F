/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, getDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or database unreachable. Check configuration.');
      return false;
    }
    // Permission denied on unauthenticated read to /test/connection still verifies network reachability
    return true;
  }
}

export interface AuthResult {
  success: boolean;
  user?: any;
  error?: string;
  code?: string;
  unauthorizedDomain?: string;
}

export async function loginWithGoogle(): Promise<AuthResult> {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    return { success: true, user: cred.user };
  } catch (error: any) {
    const code = error?.code || '';
    const message = error?.message || 'Authentication failed';
    const isUnauthorizedDomain = code === 'auth/unauthorized-domain';
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : '';

    return {
      success: false,
      error: message,
      code,
      unauthorizedDomain: isUnauthorizedDomain ? currentDomain : undefined,
    };
  }
}

export async function logoutUser() {
  return signOut(auth);
}

export async function saveGatewayConfigToCloud(configJson: string): Promise<{ success: boolean; updatedAt?: string; error?: string }> {
  if (!auth.currentUser) {
    return { success: false, error: 'User is not signed in with Google' };
  }
  const uid = auth.currentUser.uid;
  const path = `users/${uid}/settings/gateway_config`;
  try {
    const updatedAt = new Date().toISOString();
    await setDoc(doc(db, 'users', uid, 'settings', 'gateway_config'), {
      userId: uid,
      configJson,
      updatedAt,
    });
    return { success: true, updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadGatewayConfigFromCloud(): Promise<{ success: boolean; configJson?: string; updatedAt?: string; error?: string }> {
  if (!auth.currentUser) {
    return { success: false, error: 'User is not signed in with Google' };
  }
  const uid = auth.currentUser.uid;
  const path = `users/${uid}/settings/gateway_config`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'gateway_config'));
    if (!snap.exists()) {
      return { success: false, error: 'No cloud backup found for this account' };
    }
    const data = snap.data();
    return { success: true, configJson: data?.configJson, updatedAt: data?.updatedAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

