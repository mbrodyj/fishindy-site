// FishINDY Analytics Tracker — ultralight, zero-dependency
// Fires a single page view beacon on load. No cookies. No visible UI.
(function() {
    'use strict';

    // Stable fingerprint (non-identifying hash of device signals)
    function fp() {
        var s = (navigator.userAgent || '') + (navigator.language || '') + screen.width + 'x' + screen.height + (new Date().getTimezoneOffset());
        var h = 0;
        for (var i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
        return Math.abs(h).toString(16).toUpperCase().padStart(8, '0');
    }

    // Session ID (per tab visit)
    function sid() {
        var k = '_fi_sid';
        var v = sessionStorage.getItem(k);
        if (!v) {
            v = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            try { sessionStorage.setItem(k, v); } catch(e) {}
        }
        return v;
    }

    // Device type from viewport
    function dtype() {
        var w = window.innerWidth || screen.width;
        if (w <= 768) return 'mobile';
        if (w <= 1024) return 'tablet';
        return 'desktop';
    }

    // Fire page view
    function fire() {
        var payload = {
            type: 'pageview',
            page: location.pathname + (location.search || ''),
            referrer: document.referrer || null,
            device_type: dtype(),
            fingerprint: fp(),
            session_id: sid(),
            metadata: {
                viewport: window.innerWidth + 'x' + window.innerHeight,
                lang: navigator.language || null,
                tz: (function() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e) { return null; } })()
            }
        };

        try {
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/beacon', JSON.stringify(payload));
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/beacon', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify(payload));
            }
        } catch(e) { /* silent */ }
    }

    // Fire on load (deferred so it doesn't block rendering)
    if (document.readyState === 'complete') {
        fire();
    } else {
        window.addEventListener('load', fire);
    }

    // Expose for lead capture calls from other scripts
    window._fi_beacon = function(data) {
        try {
            var payload = JSON.stringify(data);
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/beacon', payload);
            } else {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/beacon', true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(payload);
            }
        } catch(e) { /* silent */ }
    };
})();
