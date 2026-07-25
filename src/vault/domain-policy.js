export function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      // Hỗ trợ fallback cho các chuỗi url không chứa protocol hợp lệ
      return normalizeOrigin('https://' + value);
    }
    return url.origin;
  } catch (e) {
    try {
      // Nếu là domain trần như facebook.com
      const url = new URL('https://' + value);
      return url.origin;
    } catch (err) {
      throw new Error('Unsupported origin: ' + value);
    }
  }
}

export function matchesOrigin(credential, origin) {
  try {
    const normOriginHost = new URL(normalizeOrigin(origin)).hostname.toLowerCase();
    
    // Đảm bảo credential có mảng origins hợp lệ
    const origins = credential.origins || [];
    if (credential.url) {
      const u = normalizeOrigin(credential.url);
      if (!origins.includes(u)) origins.push(u);
    }

    return origins.some(item => {
      try {
        const itemHost = new URL(normalizeOrigin(item)).hostname.toLowerCase();
        
        // 1. Khớp hoàn toàn
        if (itemHost === normOriginHost) return true;
        
        // 2. Khớp subdomain (Ví dụ: login.facebook.com khớp với facebook.com)
        if (normOriginHost.endsWith('.' + itemHost) || itemHost.endsWith('.' + normOriginHost)) return true;
        
        // 3. Khớp Base Domain (Ví dụ: m.facebook.com khớp với login.facebook.com)
        const getBase = host => {
          const parts = host.split('.');
          if (parts.length > 2) {
            const penult = parts[parts.length - 2];
            // Hỗ trợ đuôi mở rộng 2 cấp như .com.vn, .co.uk
            if (['com', 'co', 'net', 'org', 'edu', 'gov'].includes(penult) && parts.length > 3) {
              return parts.slice(-3).join('.');
            }
            return parts.slice(-2).join('.');
          }
          return host;
        };
        
        return getBase(itemHost) === getBase(normOriginHost);
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return false;
  }
}
