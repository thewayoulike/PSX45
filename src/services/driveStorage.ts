// Google Drive Storage Service
// Stores application state in a single JSON file in Google Drive.
// Includes Session Persistence and Auto-Refresh handling.

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
let tokenExpiryTime: number = 0;

// Promise wrapper to handle async token refresh
let refreshTokenResolver: ((token: string) => void) | null = null;

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

    // 1. TRY RESTORE SESSION IMMEDIATELY
    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedUserStr = localStorage.getItem(STORAGE_USER_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

        if (storedToken && storedUserStr && storedExpiry) {
            const expiry = parseInt(storedExpiry);
            const now = Date.now();
            
            // Check if token is valid (or recently expired, we can try to refresh if user profile exists)
            // Buffer of 1 minute
            if (!isNaN(expiry) && now < expiry - 60000) {
                console.log("Restoring valid session...");
                accessToken = storedToken;
                tokenExpiryTime = expiry;
                const user = JSON.parse(storedUserStr);
                onUserLoggedIn(user);
            } else {
                console.log("Session expired. Clearing storage.");
                localStorage.removeItem(STORAGE_TOKEN_KEY);
                localStorage.removeItem(STORAGE_USER_KEY);
                localStorage.removeItem(STORAGE_EXPIRY_KEY);
            }
        }
    } catch (e) {
        console.error("Error restoring session", e);
    }

    // 2. SETUP GOOGLE CLIENT
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
                            
                            // Calculate absolute expiry time
                            const expiresIn = (tokenResponse.expires_in || 3599) * 1000;
                            tokenExpiryTime = Date.now() + expiresIn;

                            // Save to Storage
                            localStorage.setItem(STORAGE_TOKEN_KEY, accessToken!);
                            localStorage.setItem(STORAGE_EXPIRY_KEY, tokenExpiryTime.toString());

                            // If we were waiting for a refresh, resolve it
                            if (refreshTokenResolver) {
                                refreshTokenResolver(accessToken!);
                                refreshTokenResolver = null;
                            }

                            // Fetch User Profile if not already present or if this is a fresh login
                            const storedUser = localStorage.getItem(STORAGE_USER_KEY);
                            if (!storedUser || !refreshTokenResolver) {
                                try {
                                    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                        headers: { Authorization: `Bearer ${accessToken}` }
                                    });
                                    if (response.ok) {
                                        const user = await response.json();
                                        const userData = {
                                            name: user.name,
                                            email: user.email,
                                            picture: user.picture
                                        };
                                        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(userData));
                                        onUserLoggedIn(userData);
                                    }
                                } catch (e) {
                                    console.error("Failed to fetch user info", e);
                                }
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
    // Force consent for fresh login
    tokenClient.requestAccessToken({ prompt: 'consent' });
};

export const signOutDrive = () => {
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

/**
 * Ensures we have a valid token before making requests.
 * Refreshes if expired.
 */
const getValidToken = async (): Promise<string | null> => {
    const now = Date.now();
    // If token exists and has > 1 minute left, use it
    if (accessToken && tokenExpiryTime > now + 60000) {
        return accessToken;
    }

    // Token expired or missing. Try to refresh.
    if (!tokenClient) return null;

    console.log("Token expired or missing. refreshing...");
    
    return new Promise((resolve) => {
        refreshTokenResolver = resolve;
        // Skip prompt to try silent refresh
        tokenClient.requestAccessToken({ prompt: '' });
    });
};

// --- Drive File Operations ---

const findDbFile = async () => {
    const token = await getValidToken();
    if (!token) return null;

    const query = `name = '${DB_FILE_NAME}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    
    if (response.status === 401) {
        // Retry once with forced refresh if 401
        localStorage.removeItem(STORAGE_TOKEN_KEY); // Force clear
        const newToken = await getValidToken();
        if (!newToken) return null;
        const retryResp = await fetch(url, { headers: { Authorization: `Bearer ${newToken}` } });
        const data = await retryResp.json();
        if (data.files && data.files.length > 0) return data.files[0].id;
        return null;
    }

    const data = await response.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    return null;
};

export const saveToDrive = async (data: any) => {
    const token = await getValidToken();
    if (!token) {
        console.warn("Cannot save: No valid auth token.");
        return;
    }

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
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });
    } catch (e) {
        console.error("Save to Drive failed", e);
    }
};

export const loadFromDrive = async () => {
    const token = await getValidToken();
    if (!token) return null;

    try {
        const fileId = await findDbFile();
        if (!fileId) return null;

        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) return await response.json();
    } catch (e) {
        console.error("Load from Drive failed", e);
    }
    return null;
};

export const hasValidSession = (): boolean => {
    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
        
        if (storedToken && storedExpiry) {
            const now = Date.now();
            if (now < parseInt(storedExpiry) - 60000) {
                return true;
            }
        }
    } catch (e) {
        return false;
    }
    return false;
};
