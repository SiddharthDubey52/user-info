const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const requestIp = require('request-ip');

class UserInfoService {
    // Extract network information
    static extractNetworkInfo(req) {
        const clientIp = requestIp.getClientIp(req);
        
        return {
            ip: clientIp,
            userAgent: req.headers['user-agent'] || null,
            acceptLanguage: req.headers['accept-language'] || null,
            acceptEncoding: req.headers['accept-encoding'] || null,
            connection: req.headers.connection || null,
            host: req.headers.host || null,
            origin: req.headers.origin || null,
            referer: req.headers.referer || req.headers.referrer || null,
            xForwardedFor: req.headers['x-forwarded-for'] || null,
            xRealIp: req.headers['x-real-ip'] || null
        };
    }

    // Extract device information from User-Agent and headers
    static extractDeviceInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        const parser = new UAParser(userAgent);
        const result = parser.getResult();

        return {
            type: result.device.type || 'desktop',
            vendor: result.device.vendor || 'unknown',
            model: result.device.model || 'unknown',
            userAgent: userAgent,
            // These would be provided by frontend JavaScript
            screenResolution: req.body.screenResolution || null,
            colorDepth: req.body.colorDepth || null,
            pixelDepth: req.body.pixelDepth || null,
            timezone: req.body.timezone || null,
            language: req.body.language || null,
            platform: req.body.platform || null,
            cookieEnabled: req.body.cookieEnabled || null,
            onlineStatus: req.body.onlineStatus || null,
            hardwareConcurrency: req.body.hardwareConcurrency || null,
            deviceMemory: req.body.deviceMemory || null,
            maxTouchPoints: req.body.maxTouchPoints || null
        };
    }

    // Extract browser information
    static extractBrowserInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        const parser = new UAParser(userAgent);
        const result = parser.getResult();

        return {
            name: result.browser.name || 'unknown',
            version: result.browser.version || 'unknown',
            engine: result.engine.name || 'unknown',
            engineVersion: result.engine.version || 'unknown'
        };
    }

    // Extract system information
    static extractSystemInfo(req) {
        const userAgent = req.headers['user-agent'] || '';
        const parser = new UAParser(userAgent);
        const result = parser.getResult();

        return {
            os: result.os.name || 'unknown',
            osVersion: result.os.version || 'unknown',
            architecture: result.cpu.architecture || 'unknown',
            cpu: req.body.cpu || 'unknown'
        };
    }

    // Extract geolocation information using IP
    static extractGeolocation(ip) {
        try {
            // Remove IPv6 prefix if present
            const cleanIp = ip?.replace(/^::ffff:/, '') || null;
            
            // Skip localhost and private IPs
            if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp.startsWith('192.168.') || cleanIp.startsWith('10.') || cleanIp.startsWith('172.')) {
                return {
                    country: 'Unknown',
                    region: 'Unknown',
                    city: 'Unknown',
                    latitude: null,
                    longitude: null,
                    timezone: null,
                    isp: 'Unknown',
                    organization: 'Unknown'
                };
            }

            const geo = geoip.lookup(cleanIp);
            
            if (!geo) {
                return {
                    country: 'Unknown',
                    region: 'Unknown',
                    city: 'Unknown',
                    latitude: null,
                    longitude: null,
                    timezone: null,
                    isp: 'Unknown',
                    organization: 'Unknown'
                };
            }

            return {
                country: geo.country || 'Unknown',
                region: geo.region || 'Unknown',
                city: geo.city || 'Unknown',
                latitude: geo.ll ? geo.ll[0] : null,
                longitude: geo.ll ? geo.ll[1] : null,
                timezone: geo.timezone || null,
                isp: 'Unknown', // geoip-lite doesn't provide ISP info
                organization: 'Unknown'
            };
        } catch (error) {
            console.error('Error extracting geolocation:', error);
            return {
                country: 'Unknown',
                region: 'Unknown',
                city: 'Unknown',
                latitude: null,
                longitude: null,
                timezone: null,
                isp: 'Unknown',
                organization: 'Unknown'
            };
        }
    }

    // Collect all user information
    static async collectUserInfo(req) {
        try {
            const networkInfo = this.extractNetworkInfo(req);
            const deviceInfo = this.extractDeviceInfo(req);
            const browserInfo = this.extractBrowserInfo(req);
            const systemInfo = this.extractSystemInfo(req);
            const geolocation = this.extractGeolocation(networkInfo.ip);

            return {
                network: networkInfo,
                device: deviceInfo,
                browser: browserInfo,
                system: systemInfo,
                geolocation: geolocation
            };
        } catch (error) {
            console.error('Error collecting user info:', error);
            throw new Error('Failed to collect user information');
        }
    }
}

module.exports = UserInfoService;
