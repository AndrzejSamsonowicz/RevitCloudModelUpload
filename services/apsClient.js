const axios = require('axios');

const APS_BASE_URL = 'https://developer.api.autodesk.com';

class APSClient {
    constructor() {
        this.clientId = process.env.APS_CLIENT_ID;
        this.clientSecret = process.env.APS_CLIENT_SECRET;
        this.callbackUrl = process.env.APS_CALLBACK_URL;
        this.tokenCache = new Map();
    }

    /**
     * Get 2-legged OAuth token for app-level access
     */
    async get2LeggedToken(scopes = ['code:all', 'data:read', 'data:write']) {
        const cacheKey = scopes.join(',');
        const cached = this.tokenCache.get(cacheKey);
        
        if (cached && cached.expiresAt > Date.now()) {
            return cached.token;
        }

        try {
            const response = await axios.post(
                `${APS_BASE_URL}/authentication/v2/token`,
                new URLSearchParams({
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    grant_type: 'client_credentials',
                    scope: scopes.join(' ')
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            const token = response.data.access_token;
            const expiresAt = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer

            this.tokenCache.set(cacheKey, { token, expiresAt });
            return token;
        } catch (error) {
            console.error('Failed to get 2-legged token:', error.response?.data || error.message);
            throw new Error('OAuth authentication failed');
        }
    }

    /**
     * Get 3-legged OAuth authorization URL for user access
     */
    getAuthorizationUrl(state = '') {
        const scopes = ['data:read', 'data:write', 'code:all'];
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            redirect_uri: this.callbackUrl,
            scope: scopes.join(' '),
            state: state
        });

        return `${APS_BASE_URL}/authentication/v2/authorize?${params.toString()}`;
    }

    /**
     * Exchange authorization code for 3-legged token
     */
    async get3LeggedToken(code) {
        try {
            const response = await axios.post(
                `${APS_BASE_URL}/authentication/v2/token`,
                new URLSearchParams({
                    grant_type: 'authorization_code',
                    code: code,
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    redirect_uri: this.callbackUrl
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            return {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            console.error('Failed to exchange code for token:', error.response?.data || error.message);
            throw new Error('Token exchange failed');
        }
    }

    /**
     * Refresh 3-legged token
     */
    async refreshToken(refreshToken) {
        try {
            const response = await axios.post(
                `${APS_BASE_URL}/authentication/v2/token`,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: this.clientId,
                    client_secret: this.clientSecret
                }),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            return {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                expiresIn: response.data.expires_in
            };
        } catch (error) {
            console.error('Failed to refresh token:', error.response?.data || error.message);
            throw new Error('Token refresh failed');
        }
    }
}

module.exports = new APSClient();
