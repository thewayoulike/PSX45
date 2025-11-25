// Google Drive Storage Service
// Stores application state in a single JSON file in Google Drive.
// Includes Session Persistence to handle page refreshes.

const HARDCODED_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';
const CLIENT_ID_KEY = 'VITE_GOOGLE_CLIENT_ID';

// LocalStorage Keys for Session Persistence
const STORAGE_TOKEN_KEY = 'psx_drive_access_token';
const STORAGE_USER_KEY = 'psx_drive_user_profile';
const STORAGE_EXPIRY_KEY = 'psx_drive_token_expiry';

const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid';
const DB_FILE_NAME = 'psx_tracker_data.json';

let tokenClient: any = null;
let accessToken: string | null = null;

export interface DriveUser {
  name: string;
  email: string;
  picture: string;
}

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

const getEnv = (key: string) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(key);
        if (stored && stored.length > 10) return stored;
    }
  } catch (e) { /* ignore */ }
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) { /* ignore */ }
  return undefined;
};

const RAW_ID = getEnv(CLIENT_ID_KEY) || getEnv('REACT_APP_GOOGLE_CLIENT_ID') || HARDCODED_CLIENT_ID;
const CLIENT_ID = (RAW_ID && RAW_ID.includes('.apps.googleusercontent.com')) ? RAW_ID : undefined;

const loadGoogleScript = () => {
    if (document.getElementById('google-gsi-script')) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-gsi-script';
    document.body.appendChild(script);
};

/**
 * Initialize Auth & Attempt to Restore Session
 */
export const initDriveAuth = (onUserLoggedIn: (user: DriveUser) => void) => {
    loadGoogleScript();

    // 1. TRY RESTORE SESSION IMMEDIATELY (Fix for "Logout on Refresh")
    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedUserStr = localStorage.getItem(STORAGE_USER_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

        if (storedToken && storedUserStr && storedExpiry) {
            const now = Date.now();
            // Check if token is valid (buffer of 5 mins)
            if (now < parseInt(storedExpiry) - 300000) {
                console.log("Restoring valid session...");
                accessToken = storedToken;
                const user = JSON.parse(storedUserStr);
                // Trigger login immediately
                onUserLoggedIn(user);
            } else {
                console.log("Session expired. Please sign in again.");
                localStorage.removeItem(STORAGE_TOKEN_KEY);
                localStorage.removeItem(STORAGE_USER_KEY);
                localStorage.removeItem(STORAGE_EXPIRY_KEY);
            }
        }
    } catch (e) {
        console.error("Error restoring session", e);
    }

    // 2. SETUP GOOGLE CLIENT FOR NEW LOGINS
    const checkInterval = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            clearInterval(checkInterval);
            if (!CLIENT_ID) return;

            try {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: CLIENT_ID,
                    scope: SCOPES,
                    callback: async (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            accessToken = tokenResponse.access_token;
                            
                            // Save Session to LocalStorage
                            const expiresIn = (tokenResponse.expires_in || 3599) * 1000;
                            localStorage.setItem(STORAGE_TOKEN_KEY, accessToken!);
                            localStorage.setItem(STORAGE_EXPIRY_KEY, (Date.now() + expiresIn).toString());

                            try {
                                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                    headers: { Authorization: `Bearer ${accessToken}` }
                                });
                                if (response.ok) {
                                    const user = await response.json();
                                    // Save User Profile
                                    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify({
                                        name: user.name,
                                        email: user.email,
                                        picture: user.picture
                                    }));
                                    onUserLoggedIn({
                                        name: user.name,
                                        email: user.email,
                                        picture: user.picture
                                    });
                                }
                            } catch (e) {
                                console.error("Failed to fetch user info", e);
                            }
                        }
                    },
                });
            } catch (e) {
                console.error("Error initializing Google Token Client", e);
            }
        }
    }, 500);
};

export const signInWithDrive = () => {
    if (!tokenClient) {
        alert("Google Service initializing... please wait 2 seconds and try again.");
        return;
    }
    // Force 'consent' to ensure we get fresh permissions if needed
    tokenClient.requestAccessToken({ prompt: 'consent' });
};

export const signOutDrive = () => {
    // Clear Session Data
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    accessToken = null;

    if (window.google && accessToken) {
        window.google.accounts.oauth2.revoke(accessToken, () => {
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
};

export const updateClientId = () => {
    const current = localStorage.getItem(CLIENT_ID_KEY) || HARDCODED_CLIENT_ID;
    const newId = prompt("Enter Google Client ID:", current);
    if (newId && newId.trim() !== current) {
        localStorage.setItem(CLIENT_ID_KEY, newId.trim());
        alert("ID Updated! Page will reload.");
        window.location.reload();
    }
};

// --- Drive File Operations ---

const findDbFile = async () => {
    if (!accessToken) return null;
    // 'trashed = false' ensures we don't read from Bin
    const query = `name = '${DB_FILE_NAME}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    return null;
};

export const saveToDrive = async (data: any) => {
    if (!accessToken) return;
    try {
        const fileId = await findDbFile();
        const fileContent = JSON.stringify(data);
        
        const metadata = { name: DB_FILE_NAME, mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        const method = fileId ? 'PATCH' : 'POST';
        const endpoint = fileId 
            ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
            : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

        await fetch(endpoint, {
            method,
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form
        });
    } catch (e) {
        console.error("Save to Drive failed", e);
    }
};

export const loadFromDrive = async () => {
    if (!accessToken) return null;
    try {
        const fileId = await findDbFile();
        if (!fileId) return null;

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (response.ok) return await response.json();
    } catch (e) {
        console.error("Load from Drive failed", e);
    }
    return null;
};
