// Google Drive Storage Service
// Stores the entire application state in a single JSON file in the user's Google Drive.

// User's Client ID from screenshot (Fallback)
const HARDCODED_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';

// Keys
const CLIENT_ID_KEY = 'VITE_GOOGLE_CLIENT_ID';

// Safe access to environment variables
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

// Priority: LocalStorage (User Override) -> Env Var -> Hardcoded
const RAW_ID = getEnv(CLIENT_ID_KEY) || getEnv('REACT_APP_GOOGLE_CLIENT_ID') || HARDCODED_CLIENT_ID;
const CLIENT_ID = (RAW_ID && RAW_ID.includes('.apps.googleusercontent.com')) ? RAW_ID : undefined;

// --- FIX: Added 'email profile openid' to scopes ---
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

/**
 * Inject Google Script if missing
 */
const loadGoogleScript = () => {
    if (document.getElementById('google-gsi-script')) {
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.id = 'google-gsi-script';
    document.body.appendChild(script);
};

/**
 * Initialize the Google Identity Services client
 */
export const initDriveAuth = (onUserLoggedIn: (user: DriveUser) => void) => {
    loadGoogleScript();

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
                            try {
                                // Fetch user details using the access token
                                const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                    headers: { Authorization: `Bearer ${accessToken}` }
                                });
                                if (response.ok) {
                                    const user = await response.json();
                                    onUserLoggedIn({
                                        name: user.name,
                                        email: user.email,
                                        picture: user.picture
                                    });
                                } else {
                                    console.error("Failed to fetch user profile", response.status);
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
    const currentOrigin = window.location.origin;

    // 1. Check Google Script
    if (!window.google || !window.google.accounts) {
        alert("Google Script loading... please wait 3 seconds and try again.");
        loadGoogleScript();
        return;
    }

    // 2. Check Client ID
    if (!CLIENT_ID) {
        const manualKey = prompt(
            "Configuration Missing\n\n" +
            "Please paste your Google Client ID:"
        );
        if (manualKey) {
            localStorage.setItem(CLIENT_ID_KEY, manualKey.trim());
            window.location.reload();
        }
        return;
    }

    // 3. Attempt Sign In
    try {
        if (tokenClient) {
            // Force prompt to ensure we get the new permissions
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Force init if waiting failed
            tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (resp: any) => { 
                    if (resp.access_token) {
                        accessToken = resp.access_token; 
                        // Re-trigger initAuth callback logic manually if needed, 
                        // but typically initDriveAuth's callback handles this.
                        // We just alert here for the first successful connection.
                    }
                }
            });
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    } catch (e: any) {
        const changeId = confirm(
            "Authorization Error (Access Blocked)\n\n" +
            "This usually means the URL is not authorized yet.\n" +
            "1. Did you add '" + currentOrigin + "' to Google Cloud?\n" +
            "2. Did you wait 5 minutes for it to propagate?\n\n" +
            "Click OK to CHANGE the Client ID.\n" +
            "Click CANCEL to keep trying with current ID."
        );

        if (changeId) {
            updateClientId();
        }
    }
};

export const updateClientId = () => {
    const current = localStorage.getItem(CLIENT_ID_KEY) || HARDCODED_CLIENT_ID;
    const newId = prompt("Enter Google Client ID:", current);
    if (newId && newId.trim() !== current) {
        localStorage.setItem(CLIENT_ID_KEY, newId.trim());
        alert("ID Updated! Page will reload.");
        window.location.reload();
    } else if (newId === '') {
        localStorage.removeItem(CLIENT_ID_KEY);
        alert("ID Reset to default. Page will reload.");
        window.location.reload();
    }
};

export const signOutDrive = () => {
    if (accessToken && window.google) {
        window.google.accounts.oauth2.revoke(accessToken, () => {
            accessToken = null;
            window.location.reload();
        });
    } else {
        window.location.reload();
    }
};

// --- Drive File Operations ---

const findDbFile = async () => {
    if (!accessToken) return null;
    const query = `name = '${DB_FILE_NAME}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    return null;
};

export const saveToDrive = async (data: any) => {
    if (!accessToken) return;
    const fileContent = JSON.stringify(data);
    const fileId = await findDbFile();
    
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
};

export const loadFromDrive = async () => {
    if (!accessToken) return null;
    const fileId = await findDbFile();
    if (!fileId) return null;

    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (response.ok) return await response.json();
    return null;
};
