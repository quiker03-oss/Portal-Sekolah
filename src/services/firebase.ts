import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, getDocFromServer, collection, collectionGroup, getDocs, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, uploadString, getDownloadURL, deleteObject } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);
storage.maxUploadRetryTime = 6000;
storage.maxOperationRetryTime = 6000;

export { signInWithPopup, firebaseSignOut };
export { doc, setDoc, getDoc, getDocFromServer, collection, collectionGroup, getDocs, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch };
export { ref, uploadBytes, uploadString, getDownloadURL, deleteObject };

