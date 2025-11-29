// Google Drive Storage Service
// Stores application state in a single JSON file in Google Drive.
// Includes Session Persistence and Auto-Refresh handling.

const HARDCODED_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';
const CLIENT_ID_KEY = 'VITE_GOOGLE_CLIENT_ID';

// LocalStorage Keys for Session Persistence
const STORAGE_TOKEN_KEY = 'psx_drive_access_token';
const STORAGE_USER_KEY = 'psx_drive_user_profile';
const STORAGE_EXPIRY_KEY = 'psx_drive_token_expiry';

// ADDED: spreadsheets scope
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets openid';
const DB_FILE_NAME = 'psx_tracker_data.json';
const SHEET_FILE_NAME = 'PSX_Portfolio_Transactions'; // Name of the Google Sheet

let tokenClient: any = null;
let accessToken: string | null = null;
let tokenExpiryTime: number = 0;

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

export const initDriveAuth = (onUserLoggedIn: (user: DriveUser) => void) => {
    loadGoogleScript();

    try {
        const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
        const storedUserStr = localStorage.getItem(STORAGE_USER_KEY);
        const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);

        if (storedToken && storedUserStr && storedExpiry) {
            const expiry = parseInt(storedExpiry);
            const now = Date.now();
            
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
                            const expiresIn = (tokenResponse.expires_in || 3599) * 1000;
                            tokenExpiryTime = Date.now() + expiresIn;

                            localStorage.setItem(STORAGE_TOKEN_KEY, accessToken!);
                            localStorage.setItem(STORAGE_EXPIRY_KEY, tokenExpiryTime.toString());

                            if (refreshTokenResolver) {
                                refreshTokenResolver(accessToken!);
                                refreshTokenResolver = null;
                            }

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

const getValidToken = async (): Promise<string | null> => {
    const now = Date.now();
    if (accessToken && tokenExpiryTime > now + 60000) {
        return accessToken;
    }

    if (!tokenClient) return null;
    console.log("Token expired or missing. refreshing...");
    
    return new Promise((resolve) => {
        refreshTokenResolver = resolve;
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
        localStorage.removeItem(STORAGE_TOKEN_KEY); 
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

// --- Google Sheets Sync ---

const findSheetFile = async () => {
    const token = await getValidToken();
    if (!token) return null;

    // Look for Google Sheet specifically
    const query = `name = '${SHEET_FILE_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id, name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    return null;
};

const createSheetFile = async () => {
    const token = await getValidToken();
    if (!token) return null;

    const metadata = { name: SHEET_FILE_NAME, mimeType: 'application/vnd.google-apps.spreadsheet' };
    const response = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });
    const data = await response.json();
    return data.id;
};

export const syncTransactionsToSheet = async (transactions: any[]) => {
    const token = await getValidToken();
    if (!token) return;

    try {
        let sheetId = await findSheetFile();
        if (!sheetId) {
            console.log("Creating new Google Sheet...");
            sheetId = await createSheetFile();
        }
        if (!sheetId) return;

        // 1. Prepare Data Headers and Rows
        const headers = [
            'Date', 'Type', 'Category', 'Ticker', 'Broker', 
            'Quantity', 'Price', 'Commission', 'Tax', 'CDC Charges', 'Other Fees', 
            'Total Amount', 'Notes', 'ID (Do Not Edit)'
        ];

        // Sort by date descending
        const sortedTx = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        const rows = sortedTx.map(t => {
            // Calculate Total/Net Amount logic for the sheet
            let total = 0;
            const gross = t.quantity * t.price;
            const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0);

            if (t.type === 'BUY') total = gross + fees;
            else if (t.type === 'SELL') total = gross - fees;
            else if (t.type === 'DIVIDEND') total = gross - (t.tax || 0); // Net Dividend
            else if (t.type === 'TAX') total = -Math.abs(t.price);
            else if (t.type === 'DEPOSIT') total = t.price;
            else if (t.type === 'WITHDRAWAL' || t.type === 'ANNUAL_FEE') total = -Math.abs(t.price);
            else if (t.type === 'OTHER') {
                 if (t.category === 'OTHER_TAX') total = -Math.abs(t.price);
                 else total = t.price; // Adjustment
            }
            else if (t.type === 'HISTORY') total = t.price;

            return [
                t.date, 
                t.type, 
                t.category || '', 
                t.ticker, 
                t.broker || '', 
                t.quantity, 
                t.price, 
                t.commission || 0, 
                t.tax || 0, 
                t.cdcCharges || 0, 
                t.otherFees || 0, 
                total, 
                t.notes || '',
                t.id
            ];
        });

        const values = [headers, ...rows];

        // 2. Clear Sheet First (to ensure deletions are reflected)
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:Z:clear`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });

        // 3. Write New Data
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values })
        });
        
        console.log("Google Sheet synced successfully.");

    } catch (e) {
        console.error("Sheet Sync Failed", e);
    }
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
