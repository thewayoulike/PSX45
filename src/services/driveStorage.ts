// Google Drive Storage Service
// Stores application state in a single JSON file in Google Drive.
// Includes Session Persistence, Auto-Refresh handling, Google Sheets Sync, and Gmail Integration.

const HARDCODED_CLIENT_ID = '76622516302-malmubqvj1ms3klfsgr5p6jaom2o7e8s.apps.googleusercontent.com';
const CLIENT_ID_KEY = 'VITE_GOOGLE_CLIENT_ID';

// LocalStorage Keys for Session Persistence
const STORAGE_TOKEN_KEY = 'psx_drive_access_token';
const STORAGE_USER_KEY = 'psx_drive_user_profile';
const STORAGE_EXPIRY_KEY = 'psx_drive_token_expiry';

// SCOPES: Updated to include 'gmail.readonly'
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/gmail.readonly openid';
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
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) { /* ignore */ }
  return undefined;
};

// Prioritize the User's Env Variable over the Hardcoded one
const RAW_ID = getEnv(CLIENT_ID_KEY) || HARDCODED_CLIENT_ID;
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
    tokenClient.requestAccessToken({ prompt: '' });
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
    
    if (response.status === 403) {
        console.error("403 Forbidden creating Sheet. Likely scope issue.");
        alert("Action Forbidden: Please Sign Out and Sign In again to grant 'Create Spreadsheets' permission.");
        return null;
    }
    
    const data = await response.json();
    return data.id;
};

export const getGoogleSheetId = async (): Promise<string | null> => {
    return await findSheetFile();
};

export const syncTransactionsToSheet = async (transactions: any[], portfolios: any[]) => {
    const token = await getValidToken();
    if (!token) return;

    try {
        let sheetId = await findSheetFile();
        if (!sheetId) {
            console.log("Creating new Google Sheet...");
            sheetId = await createSheetFile();
        }
        if (!sheetId) return;

        // 1. Get existing sheets (tabs)
        const metaResp = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (metaResp.status === 403) {
             console.error("403 Forbidden: App cannot access Google Sheets.");
             alert("Sync Failed: The app does not have permission to access Google Sheets. Please Sign Out and Sign In again, ensuring all permissions are checked.");
             return;
        }

        const meta = await metaResp.json();
        const existingTitles = new Set(meta.sheets?.map((s: any) => s.properties.title) || []);

        const headers = [
            'Date', 'Type', 'Category', 'Ticker', 'Broker', 
            'Quantity', 'Price', 'Commission', 'Tax', 'CDC Charges', 'Other Fees', 
            'Total Amount', 'Notes', 'ID'
        ];

        // 2. Iterate Portfolios and Sync
        for (const p of portfolios) {
            // Sanitize sheet title
            const sheetTitle = p.name.replace(/[*?:\/\\\[\]]/g, '_').substring(0, 100);
            
            // Create tab if missing
            if (!existingTitles.has(sheetTitle)) {
                await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requests: [{ addSheet: { properties: { title: sheetTitle } } }]
                    })
                });
                existingTitles.add(sheetTitle); 
            }

            // Prepare Data for this Portfolio
            const pTx = transactions
                .filter(t => t.portfolioId === p.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const rows = pTx.map(t => {
                let total = 0;
                const gross = t.quantity * t.price;
                const fees = (t.commission||0) + (t.tax||0) + (t.cdcCharges||0) + (t.otherFees||0);

                if (t.type === 'BUY') total = gross + fees;
                else if (t.type === 'SELL') total = gross - fees;
                else if (t.type === 'DIVIDEND') total = gross - (t.tax || 0); 
                else if (t.type === 'TAX') total = -Math.abs(t.price);
                else if (t.type === 'DEPOSIT') total = t.price;
                else if (t.type === 'WITHDRAWAL' || t.type === 'ANNUAL_FEE') total = -Math.abs(t.price);
                else if (t.type === 'OTHER') {
                     if (t.category === 'OTHER_TAX') total = -Math.abs(t.price);
                     else total = t.price; 
                }
                else if (t.type === 'HISTORY') total = t.price;

                return [
                    t.date, t.type, t.category || '', t.ticker, t.broker || '', 
                    t.quantity, t.price, t.commission || 0, t.tax || 0, 
                    t.cdcCharges || 0, t.otherFees || 0, total, t.notes || '', t.id
                ];
            });

            const values = [headers, ...rows];

            // 3. Clear Sheet & Write
            const range = `'${sheetTitle}'!A:Z`;
            
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:clear`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/'${sheetTitle}'!A1?valueInputOption=USER_ENTERED`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ values })
            });
        }
        
        console.log("Google Sheet synced successfully.");

    } catch (e) {
        console.error("Sheet Sync Failed", e);
    }
};

// --- GMAIL INTEGRATION FUNCTIONS ---

export const searchGmailMessages = async (query: string) => {
    const token = await getValidToken();
    if (!token) return [];

    try {
        // 1. Search for messages
        // Force 'has:attachment' to ensure we only get files
        const q = `${query} has:attachment`;
        const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=10`;
        const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
        
        if (listResp.status === 403) {
            throw new Error("Permission denied. Please sign out and sign in again to grant Gmail access.");
        }

        const listData = await listResp.json();
        
        if (!listData.messages) return [];

        // 2. Fetch details for each message to get snippet and attachment info
        const messages = await Promise.all(listData.messages.map(async (msg: any) => {
            const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
            const detailResp = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
            const detailData = await detailResp.json();
            
            // Extract Headers
            const subject = detailData.payload.headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
            const from = detailData.payload.headers.find((h: any) => h.name === 'From')?.value || 'Unknown Sender';
            const date = detailData.internalDate;

            // Find Attachments Recursively
            const attachments: any[] = [];
            
            const traverseParts = (partList: any[]) => {
                partList.forEach((part: any) => {
                    if (part.body && part.body.attachmentId) {
                        attachments.push({
                            id: part.body.attachmentId,
                            filename: part.filename,
                            mimeType: part.mimeType,
                            messageId: msg.id,
                            size: part.body.size
                        });
                    }
                    if (part.parts) traverseParts(part.parts);
                });
            };
            
            if (detailData.payload.parts) {
                traverseParts(detailData.payload.parts);
            }

            return {
                id: msg.id,
                snippet: detailData.snippet,
                subject,
                from,
                date: parseInt(date),
                attachments
            };
        }));

        return messages;
    } catch (e: any) {
        console.error("Gmail Search Failed", e);
        throw new Error(e.message || "Failed to access Gmail.");
    }
};

// Helper to fix MIME types
const getMimeType = (filename: string, originalMime: string) => {
    if (originalMime && originalMime !== 'application/octet-stream') return originalMime;
    
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'csv': return 'text/csv';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'xls': return 'application/vnd.ms-excel';
        default: return originalMime || 'application/octet-stream';
    }
};

export const downloadGmailAttachment = async (messageId: string, attachmentId: string, filename: string, mimeType: string): Promise<File | null> => {
    const token = await getValidToken();
    if (!token) return null;

    try {
        const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.data) {
            // Convert Base64URL to standard Base64
            const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/');
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            
            // FIX: Correct the MIME type before creating the File object
            const finalMimeType = getMimeType(filename, mimeType);
            
            return new File([byteArray], filename, { type: finalMimeType });
        }
    } catch (e) {
        console.error("Attachment Download Failed", e);
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
