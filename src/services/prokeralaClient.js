import axios from "axios";

let accessToken = null;
let tokenExpiresAt = 0;

async function fetchAccessToken() {
    const clientId = process.env.PROKERALA_CLIENT_ID;
    const clientSecret = process.env.PROKERALA_CLIENT_SECRET;
    const tokenUrl = process.env.PROKERALA_TOKEN_URL;

    if (!clientId || !clientSecret || !tokenUrl) {
        throw new Error("Missing Prokerala credentials in .env");
    }

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });

    const { access_token, expires_in } = response.data;
    accessToken = access_token;
    tokenExpiresAt = Date.now() + (expires_in - 60) * 1000;

    return accessToken;
}

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiresAt) {
        return accessToken;
    }
    return fetchAccessToken();
}

export async function callProkerala(endpoint, payload = {}, method = "POST") {
    const baseUrl = process.env.PROKERALA_BASE_URL;

    if (!endpoint || !baseUrl) {
        throw new Error("Missing Prokerala endpoint or base URL.");
    }

    const token = await getAccessToken();

    const url = `${baseUrl}${endpoint}`;
    console.log(`[Prokerala Request] URL: ${url} | Payload:`, JSON.stringify(payload));

    const config = {
        method: method.toUpperCase(),
        url,
        headers: {
            Authorization: `Bearer ${token}`,
        },
    };

    if (config.method === "GET") {
        config.params = payload;
    } else {
        config.data = payload;
    }

    const response = await axios(config);
    return response.data;
}
