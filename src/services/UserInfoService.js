const requestIp = require('request-ip');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const axios = require('axios');
const useragent = require('useragent');
const MobileDetect = require('mobile-detect');
const fastGeoip = require('fast-geoip');
const DeviceDetector = require('device-detector-js');

class UserInfoService {
    static async collectUserInfo(req, frontendData = {}) {
        const userAgent = req.headers['user-agent'] || '';
        
        // Extract real IP (demo mode is handled inside extractRealIP)
        const ip = this.extractRealIP(req);
        
        console.log(`🔍 Processing request for IP: ${ip}`);
        console.log(`📱 User-Agent: ${userAgent}`);
        
        const [networkInfo, deviceInfo, geolocation, browserInfo, systemInfo] = await Promise.all([
            this.extractNetworkInfo(req, ip),
            this.extractAdvancedDeviceInfo(userAgent, frontendData),
            this.extractPreciseGeolocation(ip),
            this.extractAdvancedBrowserInfo(userAgent),
            this.extractSystemInfo(userAgent)
        ]);

        const timestamp = new Date().toISOString();

        return {
            timestamp,
            network: networkInfo,
            device: deviceInfo,
            geolocation,
            browser: browserInfo,
            system: systemInfo
        };
    }

    static extractRealIP(req) {
        // Check if demo mode is enabled
        if (req.headers['x-demo-mode'] === 'true') {
            return '8.8.8.8'; // Use Google's DNS for demo
        }
        
        return requestIp.getClientIp(req) || 
               req.headers['cf-connecting-ip'] || 
               req.headers['x-real-ip'] || 
               req.headers['x-forwarded-for']?.split(',')[0] || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress ||
               req.ip ||
               '127.0.0.1';
    }

    static async extractNetworkInfo(req, overrideIp = null) {
        const ip = overrideIp || this.extractRealIP(req);
        
        return {
            ip,
            userAgent: req.headers['user-agent'],
            acceptLanguage: req.headers['accept-language'],
            acceptEncoding: req.headers['accept-encoding'],
            connection: req.headers.connection,
            host: req.headers.host,
            origin: req.headers.origin,
            referer: req.headers.referer,
            xForwardedFor: req.headers['x-forwarded-for'],
            xRealIp: req.headers['x-real-ip']
        };
    }

    static async extractAdvancedDeviceInfo(userAgent, frontendData = {}) {
        try {
            const uaParser = new UAParser(userAgent);
            const uaResult = uaParser.getResult();
            const useragentParsed = useragent.parse(userAgent);
            const mobileDetect = new MobileDetect(userAgent);
            const deviceDetector = new DeviceDetector();
            const deviceResult = deviceDetector.parse(userAgent);

            let deviceType = 'desktop';
            if (mobileDetect.mobile()) {
                deviceType = mobileDetect.tablet() ? 'tablet' : 'mobile';
            } else if (uaResult.device.type) {
                deviceType = uaResult.device.type;
            }

            let vendor = 'Unknown';
            let model = 'Unknown';
            
            if (deviceResult.device) {
                vendor = deviceResult.device.brand || vendor;
                model = deviceResult.device.model || model;
            } else if (uaResult.device.vendor) {
                vendor = uaResult.device.vendor;
                model = uaResult.device.model || model;
            }

            const devicePatterns = this.analyzeUserAgentPatterns(userAgent);
            if (devicePatterns.vendor !== 'Unknown') vendor = devicePatterns.vendor;
            if (devicePatterns.model !== 'Unknown') model = devicePatterns.model;

            const deviceInfo = {
                type: deviceType,
                vendor,
                model,
                isMobile: mobileDetect.mobile() !== null,
                isTablet: mobileDetect.tablet() !== null,
                isDesktop: !mobileDetect.mobile(),
                
                // Use frontend data when available, otherwise infer
                screenResolution: frontendData.screenResolution || this.inferScreenResolution(userAgent, deviceType),
                colorDepth: frontendData.colorDepth || 24,
                pixelRatio: frontendData.pixelRatio || this.inferPixelRatio(userAgent),
                timezone: frontendData.timezone || 'UTC',
                language: frontendData.language || 'en-US',
                platform: frontendData.platform || uaResult.os.name,
                cookieEnabled: frontendData.cookieEnabled !== undefined ? frontendData.cookieEnabled : true,
                onlineStatus: frontendData.onlineStatus !== undefined ? frontendData.onlineStatus : true,
                hardwareConcurrency: frontendData.hardwareConcurrency || this.inferCores(vendor, model),
                deviceMemory: frontendData.deviceMemory || this.inferMemory(deviceType, vendor),
                maxTouchPoints: frontendData.maxTouchPoints || (deviceType === 'mobile' ? 10 : 0),
                touchSupport: frontendData.touchSupport !== undefined ? frontendData.touchSupport : (deviceType !== 'desktop'),
                
                // Battery information (use precise undefined checks to preserve 0/false values)
                batteryLevel: frontendData.batteryLevel !== undefined ? frontendData.batteryLevel : null,
                batteryCharging: frontendData.batteryCharging !== undefined ? frontendData.batteryCharging : null,
                batteryChargingTime: frontendData.batteryChargingTime !== undefined ? frontendData.batteryChargingTime : null,
                batteryDischargingTime: frontendData.batteryDischargingTime !== undefined ? frontendData.batteryDischargingTime : null
            };
            
            return deviceInfo;
        } catch (error) {
            console.error('Error extracting device info:', error);
            return {
                type: 'unknown',
                vendor: 'Unknown',
                model: 'Unknown',
                error: error.message
            };
        }
    }

    static analyzeUserAgentPatterns(userAgent) {
        const patterns = {
            'iPhone15': { vendor: 'Apple', model: 'iPhone 15' },
            'iPhone14': { vendor: 'Apple', model: 'iPhone 14' },
            'iPhone13': { vendor: 'Apple', model: 'iPhone 13' },
            'iPhone': { vendor: 'Apple', model: 'iPhone' },
            'iPad': { vendor: 'Apple', model: 'iPad' },
            'Macintosh': { vendor: 'Apple', model: 'Mac' },
            'SM-S': { vendor: 'Samsung', model: 'Galaxy S' },
            'Galaxy': { vendor: 'Samsung', model: 'Galaxy' },
            'Pixel': { vendor: 'Google', model: 'Pixel' },
            'OnePlus': { vendor: 'OnePlus', model: 'OnePlus' },
            'HUAWEI': { vendor: 'Huawei', model: 'Huawei' },
            'Windows NT': { vendor: 'Microsoft', model: 'Windows' }
        };

        for (const [pattern, info] of Object.entries(patterns)) {
            if (userAgent.includes(pattern)) {
                return info;
            }
        }
        return { vendor: 'Unknown', model: 'Unknown' };
    }

    static inferScreenResolution(userAgent, deviceType) {
        if (userAgent.includes('iPhone15')) return '1179x2556';
        if (userAgent.includes('iPhone14')) return '1170x2532';
        if (userAgent.includes('iPhone')) return '828x1792';
        if (userAgent.includes('iPad')) return '1668x2388';
        if (deviceType === 'mobile') return '360x800';
        if (deviceType === 'tablet') return '768x1024';
        return '1920x1080';
    }

    static inferPixelRatio(userAgent) {
        if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 3;
        if (userAgent.includes('Android')) return 2;
        return 1;
    }

    static inferCores(vendor, model) {
        if (vendor === 'Apple') {
            if (model.includes('15') || model.includes('14')) return 6; // A17/A16 chips
            if (model.includes('13') || model.includes('12')) return 6; // A15/A14 chips
            return 4; // Older Apple devices
        }
        if (vendor === 'Google' && model.includes('Pixel')) return 8; // Tensor chips
        if (vendor === 'Samsung') return 8; // Snapdragon/Exynos
        return 4; // Default mobile
    }

    static inferMemory(deviceType, vendor) {
        if (deviceType === 'desktop') return 16;
        if (vendor === 'Apple') {
            return 6; // iPhones typically have 6GB+ now
        }
        if (vendor === 'Samsung') return 8; // Samsung flagships
        if (vendor === 'Google') return 8; // Pixel phones
        if (deviceType === 'tablet') return 4;
        return 4; // Default mobile
    }

    static async extractPreciseGeolocation(ip) {
        try {
            if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
                return {
                    country: 'Local',
                    region: 'Local',
                    city: 'Local',
                    latitude: null,
                    longitude: null,
                    timezone: 'Local',
                    isp: 'Local Network',
                    organization: 'Local Network',
                    source: 'local'
                };
            }

            console.log(`🌍 Getting location for IP: ${ip}`);
            
            const results = await Promise.allSettled([
                this.getLocationFromIpapi(ip),
                this.getLocationFromIpinfo(ip),
                this.getLocationFromFastGeoip(ip),
                this.getLocationFromGeoipLite(ip)
            ]);

            let bestResult = null;
            let bestScore = 0;

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    const score = this.scoreGeolocationResult(result.value);
                    if (score > bestScore) {
                        bestScore = score;
                        bestResult = result.value;
                    }
                }
            }

            return bestResult || {
                country: 'Unknown',
                region: 'Unknown',
                city: 'Unknown',
                latitude: null,
                longitude: null,
                timezone: 'Unknown',
                isp: 'Unknown',
                organization: 'Unknown',
                source: 'none'
            };

        } catch (error) {
            console.error('Error extracting geolocation:', error);
            return {
                country: 'Unknown',
                region: 'Unknown', 
                city: 'Unknown',
                latitude: null,
                longitude: null,
                timezone: 'Unknown',
                isp: 'Unknown',
                organization: 'Unknown',
                source: 'error',
                error: error.message
            };
        }
    }

    static async getLocationFromIpapi(ip) {
        try {
            const response = await axios.get(`http://ipapi.co/${ip}/json/`, {
                timeout: 3000,
                headers: { 'User-Agent': 'Mozilla/5.0 UserInfoAPI/1.0' }
            });
            
            const data = response.data;
            if (data.error) throw new Error(data.reason);
            
            return {
                country: data.country_name,
                countryCode: data.country_code,
                region: data.region,
                city: data.city,
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                timezone: data.timezone,
                isp: data.org,
                organization: data.org,
                postal: data.postal,
                source: 'ipapi.co'
            };
        } catch (error) {
            console.error('ipapi.co failed:', error.message);
            return null;
        }
    }

    static async getLocationFromIpinfo(ip) {
        try {
            const response = await axios.get(`https://ipinfo.io/${ip}/json`, {
                timeout: 3000,
                headers: { 'User-Agent': 'Mozilla/5.0 UserInfoAPI/1.0' }
            });
            
            const data = response.data;
            if (!data.loc) return null;
            
            const [lat, lon] = data.loc.split(',').map(parseFloat);
            
            return {
                country: data.country,
                region: data.region,
                city: data.city,
                latitude: lat,
                longitude: lon,
                timezone: data.timezone,
                isp: data.org,
                organization: data.org,
                postal: data.postal,
                source: 'ipinfo.io'
            };
        } catch (error) {
            console.error('ipinfo.io failed:', error.message);
            return null;
        }
    }

    static async getLocationFromFastGeoip(ip) {
        try {
            const geo = await fastGeoip.lookup(ip);
            if (!geo) return null;
            
            return {
                country: geo.country,
                region: geo.region,
                city: geo.city,
                latitude: geo.ll ? geo.ll[0] : null,
                longitude: geo.ll ? geo.ll[1] : null,
                timezone: geo.timezone,
                isp: geo.area,
                organization: geo.area,
                source: 'fast-geoip'
            };
        } catch (error) {
            console.error('fast-geoip failed:', error.message);
            return null;
        }
    }

    static getLocationFromGeoipLite(ip) {
        try {
            const geo = geoip.lookup(ip);
            if (!geo) return null;
            
            return {
                country: geo.country,
                region: geo.region,
                city: geo.city,
                latitude: geo.ll ? geo.ll[0] : null,
                longitude: geo.ll ? geo.ll[1] : null,
                timezone: geo.timezone,
                isp: 'Unknown',
                organization: 'Unknown',
                source: 'geoip-lite'
            };
        } catch (error) {
            console.error('geoip-lite failed:', error.message);
            return null;
        }
    }

    static scoreGeolocationResult(result) {
        let score = 0;
        if (result.country && result.country !== 'Unknown') score += 1;
        if (result.region && result.region !== 'Unknown') score += 1;
        if (result.city && result.city !== 'Unknown') score += 1;
        if (result.latitude && result.longitude) score += 3;
        if (result.timezone && result.timezone !== 'Unknown') score += 1;
        if (result.isp && result.isp !== 'Unknown') score += 1;
        return score;
    }

    static async extractAdvancedBrowserInfo(userAgent) {
        try {
            const uaParser = new UAParser(userAgent);
            const result = uaParser.getResult();
            const useragentParsed = useragent.parse(userAgent);
            
            return {
                name: result.browser.name || useragentParsed.family || 'unknown',
                version: result.browser.version || useragentParsed.toVersion() || 'unknown',
                major: result.browser.major || useragentParsed.major || 'unknown',
                engine: result.engine.name || 'unknown',
                engineVersion: result.engine.version || 'unknown',
                isWebView: userAgent.includes('wv') || userAgent.includes('WebView'),
                isMobile: /Mobile|Android|iPhone|iPad/.test(userAgent),
                isBot: /bot|crawler|spider|scraper/i.test(userAgent)
            };
        } catch (error) {
            console.error('Error extracting browser info:', error);
            return {
                name: 'unknown',
                version: 'unknown',
                engine: 'unknown',
                engineVersion: 'unknown',
                error: error.message
            };
        }
    }

    static extractSystemInfo(userAgent) {
        try {
            const uaParser = new UAParser(userAgent);
            const result = uaParser.getResult();
            const useragentParsed = useragent.parse(userAgent);
            
            return {
                os: result.os.name || useragentParsed.os.family || 'unknown',
                osVersion: result.os.version || useragentParsed.os.toVersion() || 'unknown',
                architecture: result.cpu.architecture || 'unknown',
                cpu: result.cpu.architecture || 'unknown'
            };
        } catch (error) {
            console.error('Error extracting system info:', error);
            return {
                os: 'unknown',
                osVersion: 'unknown',
                architecture: 'unknown',
                cpu: 'unknown',
                error: error.message
            };
        }
    }

    static generateSummary(data) {
        const { network, device, geolocation, browser, system } = data;
        
        return {
            timestamp: data.timestamp,
            ip: network.ip,
            country: geolocation.country,
            region: geolocation.region,
            city: geolocation.city,
            coordinates: geolocation.latitude && geolocation.longitude ? 
                `${geolocation.latitude}, ${geolocation.longitude}` : null,
            browser: `${browser.name} ${browser.version}`,
            os: `${system.os} ${system.osVersion}`,
            device: `${device.vendor} ${device.model} (${device.type})`,
            isp: geolocation.isp,
            batteryLevel: device.batteryLevel,
            batteryCharging: device.batteryCharging
        };
    }
}

module.exports = UserInfoService;
