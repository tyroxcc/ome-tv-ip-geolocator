// ==UserScript==
// @name         Advanced WebRTC IP Geolocation & Leak Detector (ome.tv)
// @namespace    http://tampermonkey.net/
// @version      1.0.5
// @description  Detects WebRTC IP leaks, performs geolocation, and displays results in a draggable, persistent, and feature-rich panel on ome.tv.
// @author       tyroxcc
// @match        *://*.ome.tv/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration ---
    const CONFIG = {
        PANEL_ID: 'manus-geo-panel',
        API_KEY: '072a896dc04088', // ipinfo.io API key from original script
        API_URL: 'https://ipinfo.io/',
        STORAGE_KEY_STATE: 'manusGeoPanelState',
        STORAGE_KEY_IP: 'manusGeoLastIP',
        REFRESH_INTERVAL_MS: 5000, // Check for new IP every 5 seconds
        MAX_IP_HISTORY: 5,
    };

    // --- Utility Functions ---

    /**
     * Safely retrieves a value from GM_getValue, or returns a default.
     * @param {string} key
     * @param {*} defaultValue
     * @returns {*}
     */
    function getStoredValue(key, defaultValue) {
        try {
            // Check if GM_getValue is defined before calling it
            if (typeof GM_getValue === 'function') {
                const stored = GM_getValue(key);
                return stored !== undefined ? stored : defaultValue;
            }
            // Fallback for environments where GM_getValue is not available
            return defaultValue;
        } catch (e) {
            console.error(`[GeoDetector] Error reading storage key ${key}:`, e);
            return defaultValue;
        }
    }

    /**
     * Safely stores a value using GM_setValue.
     * @param {string} key
     * @param {*} value
     */
    function setStoredValue(key, value) {
        try {
            // Check if GM_setValue is defined before calling it
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
            }
        } catch (e) {
            console.error(`[GeoDetector] Error writing storage key ${key}:`, e);
        }
    }

    /**
     * Converts an object of key-value pairs into an HTML table string.
     * @param {Object} dataObj
     * @returns {string}
     */
    function createTableHTML(dataObj) {
        let html = '<table><tbody>';
        for (const [key, val] of Object.entries(dataObj)) {
            html += `<tr><th>${key}</th><td>${val}</td></tr>`;
        }
        html += '</tbody></table>';
        return html;
    }

    // --- Geolocation Service ---

    class GeolocationService {
        constructor() {
            this.apiKey = CONFIG.API_KEY;
            this.regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            this.ipHistory = getStoredValue('manusGeoIPHistory', []);
            this.lastReportedIP = getStoredValue(CONFIG.STORAGE_KEY_IP, null);
        }

        /**
         * Fetches geolocation data for a given IP address.
         * @param {string} ip
         * @returns {Promise<Object|null>}
         */
        async getGeolocation(ip) {
            if (!ip) return null;

            // CRITICAL FIX: Check for GM_xmlhttpRequest availability
            if (typeof GM_xmlhttpRequest !== 'function') {
                console.error('[GeoDetector] GM_xmlhttpRequest is not defined. Check @grant directives.');
                return null;
            }

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${CONFIG.API_URL}${ip}?token=${this.apiKey}`,
                    onload: (response) => {
                        try {
                            const json = JSON.parse(response.responseText);
                            if (json.error) {
                                console.error(`[GeoDetector] API Error for ${ip}:`, json.error.message);
                                resolve(null);
                                return;
                            }

                            const data = {
                                "IP Address": json.ip || 'N/A',
                                "Country": json.country ? this.regionNames.of(json.country) : 'N/A',
                                "Region": json.region || 'N/A',
                                "City": json.city || 'N/A',
                                "Location": json.loc || 'N/A',
                                "ISP": json.org || 'N/A',
                                "Hostname": json.hostname || 'N/A',
                                "VPN/Proxy": json.bogon ? 'Yes (Bogon)' : 'No',
                            };

                            this.updateHistory(ip, data);
                            resolve(data);
                        } catch (e) {
                            console.error(`[GeoDetector] Geolocation request failed for ${ip}:`, e);
                            resolve(null);
                        }
                    },
                    onerror: (response) => {
                        console.error(`[GeoDetector] GM_xmlhttpRequest failed for ${ip}:`, response);
                        resolve(null);
                    }
                });
            });
        }

        /**
         * Updates the IP history and stores it.
         * @param {string} ip
         * @param {Object} data
         */
        updateHistory(ip, data) {
            const existingIndex = this.ipHistory.findIndex(item => item.ip === ip);
            const timestamp = new Date().toLocaleString();

            if (existingIndex !== -1) {
                // Move to top and update timestamp
                const [item] = this.ipHistory.splice(existingIndex, 1);
                item.timestamp = timestamp;
                this.ipHistory.unshift(item);
            } else {
                // Add new entry
                this.ipHistory.unshift({ ip, data, timestamp });
            }

            // Trim history
            if (this.ipHistory.length > CONFIG.MAX_IP_HISTORY) {
                this.ipHistory.pop();
            }

            setStoredValue('manusGeoIPHistory', this.ipHistory);
            this.lastReportedIP = ip;
            setStoredValue(CONFIG.STORAGE_KEY_IP, ip);
        }

        /**
         * Gets the stored IP history.
         * @returns {Array<Object>}
         */
        getHistory() {
            return this.ipHistory;
        }

        /**
         * Gets the last reported IP.
         * @returns {string|null}
         */
        getLastReportedIP() {
            return this.lastReportedIP;
        }
    }

    // --- UI Panel Manager ---

    class PanelManager {
        constructor(geoService) {
            this.geoService = geoService;
            this.panel = null;
            this.header = null;
            this.content = null;
            this.historyButton = null;
            this.currentState = getStoredValue(CONFIG.STORAGE_KEY_STATE, {
                x: window.innerWidth - 320,
                y: 10,
                collapsed: false,
                historyView: false
            });
            this.isDragging = false;
            this.dragOffsetX = 0;
            this.dragOffsetY = 0;
        }

        init() {
            this.addStyles();
            // Use a check for body existence, falling back to DOMContentLoaded
            if (document.body) {
                this.createPanel();
                this.applyState();
                this.setupDragListeners();
                this.setupToggleListener();
                this.setupHistoryListener();
                this.updatePanelContent();
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    this.createPanel();
                    this.applyState();
                    this.setupDragListeners();
                    this.setupToggleListener();
                    this.setupHistoryListener();
                    this.updatePanelContent();
                });
            }
        }

        addStyles() {
            const style = document.createElement('style');
            style.textContent = `
                #${CONFIG.PANEL_ID} {
                    position: fixed;
                    width: 300px;
                    min-height: 50px;
                    max-height: 80%;
                    background: #282c34; /* Dark background */
                    color: #abb2bf; /* Light text */
                    border: 1px solid #3e4451;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    padding: 0;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    font-size: 12px;
                    z-index: 99999;
                    resize: both; /* Allow resizing */
                    overflow: hidden;
                    transition: width 0.2s, height 0.2s;
                }
                #${CONFIG.PANEL_ID}.collapsed {
                    height: 30px !important;
                    min-height: 30px;
                    width: 300px !important;
                    resize: none;
                }
                #${CONFIG.PANEL_ID} .header {
                    cursor: move;
                    padding: 8px;
                    background: #3e4451;
                    color: #61afef; /* Blue header text */
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    user-select: none;
                }
                #${CONFIG.PANEL_ID} .header button {
                    background: none;
                    border: none;
                    color: #98c379; /* Green button text */
                    font-size: 16px;
                    cursor: pointer;
                    margin-left: 5px;
                    padding: 0 5px;
                }
                #${CONFIG.PANEL_ID} .content {
                    padding: 8px;
                    overflow-y: auto;
                    max-height: calc(100% - 30px);
                    transition: opacity 0.3s;
                }
                #${CONFIG.PANEL_ID}.collapsed .content {
                    display: none;
                }
                #${CONFIG.PANEL_ID} table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 10px;
                }
                #${CONFIG.PANEL_ID} th, #${CONFIG.PANEL_ID} td {
                    padding: 4px 0;
                    text-align: left;
                    border-bottom: 1px solid #3e4451;
                }
                #${CONFIG.PANEL_ID} th {
                    color: #e5c07b; /* Yellow key text */
                    width: 40%;
                    font-weight: normal;
                }
                #${CONFIG.PANEL_ID} td {
                    color: #abb2bf;
                    word-break: break-all;
                }
                #${CONFIG.PANEL_ID} .history-entry {
                    border: 1px solid #3e4451;
                    border-radius: 4px;
                    padding: 5px;
                    margin-bottom: 10px;
                    background: #3e4451;
                }
                #${CONFIG.PANEL_ID} .history-entry .ip-header {
                    font-weight: bold;
                    color: #c678dd; /* Purple IP text */
                    margin-bottom: 5px;
                    display: flex;
                    justify-content: space-between;
                }
            `;
            document.documentElement.appendChild(style);
        }

        createPanel() {
            this.panel = document.createElement('div');
            this.panel.id = CONFIG.PANEL_ID;
            this.panel.innerHTML = `
                <div class="header">
                    <span>Advanced IP Geolocation</span>
                    <div>
                        <button class="history-btn" title="View History">H</button>
                        <button class="toggle-btn" title="Toggle Panel">_</button>
                    </div>
                </div>
                <div class="content">
                    Waiting for WebRTC IP detection...
                </div>
            `;
            document.body.appendChild(this.panel);
            this.header = this.panel.querySelector('.header');
            this.content = this.panel.querySelector('.content');
            this.historyButton = this.panel.querySelector('.history-btn');
        }

        applyState() {
            this.panel.style.left = `${this.currentState.x}px`;
            this.panel.style.top = `${this.currentState.y}px`;
            if (this.currentState.collapsed) {
                this.panel.classList.add('collapsed');
                this.panel.querySelector('.toggle-btn').textContent = '+';
            } else {
                this.panel.classList.remove('collapsed');
                this.panel.querySelector('.toggle-btn').textContent = '_';
            }
            if (this.currentState.historyView) {
                this.showHistory();
            } else {
                this.showCurrentIP();
            }
        }

        saveState() {
            // Check if panel is attached to DOM before trying to get offset
            if (this.panel && this.panel.parentElement) {
                this.currentState.x = this.panel.offsetLeft;
                this.currentState.y = this.panel.offsetTop;
                this.currentState.collapsed = this.panel.classList.contains('collapsed');
                setStoredValue(CONFIG.STORAGE_KEY_STATE, this.currentState);
            }
        }

        setupDragListeners() {
            this.header.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only left click
                this.isDragging = true;
                this.dragOffsetX = e.clientX - this.panel.offsetLeft;
                this.dragOffsetY = e.clientY - this.panel.offsetTop;
                this.panel.style.transition = 'none'; // Disable transition while dragging
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!this.isDragging) return;
                let newX = e.clientX - this.dragOffsetX;
                let newY = e.clientY - this.dragOffsetY;

                // Boundary checks
                newX = Math.max(0, Math.min(newX, window.innerWidth - this.panel.offsetWidth));
                newY = Math.max(0, Math.min(newY, window.innerHeight - this.panel.offsetHeight));

                this.panel.style.left = `${newX}px`;
                this.panel.style.top = `${newY}px`;
            });

            document.addEventListener('mouseup', () => {
                if (this.isDragging) {
                    this.isDragging = false;
                    this.panel.style.transition = ''; // Re-enable transition
                    this.saveState();
                }
            });
        }

        setupToggleListener() {
            this.panel.querySelector('.toggle-btn').addEventListener('click', () => {
                this.panel.classList.toggle('collapsed');
                const isCollapsed = this.panel.classList.contains('collapsed');
                this.panel.querySelector('.toggle-btn').textContent = isCollapsed ? '+' : '_';
                this.saveState();
            });
        }

        setupHistoryListener() {
            this.historyButton.addEventListener('click', () => {
                this.currentState.historyView = !this.currentState.historyView;
                this.historyButton.style.color = this.currentState.historyView ? '#e06c75' : '#98c379'; // Highlight when active
                this.updatePanelContent();
                this.saveState();
            });
        }

        /**
         * Updates the panel content based on the current view (current IP or history).
         */
        async updatePanelContent() {
            if (!this.panel) return; // Panel not yet created

            if (this.currentState.historyView) {
                this.showHistory();
            } else {
                this.showCurrentIP();
            }
        }

        async showCurrentIP() {
            this.historyButton.style.color = '#98c379';
            const currentIP = this.geoService.getLastReportedIP();
            if (!currentIP) {
                this.content.innerHTML = '<p>Waiting for WebRTC IP detection...</p>';
                return;
            }

            // Check if we have the data in history to avoid unnecessary API call
            const historyEntry = this.geoService.getHistory().find(item => item.ip === currentIP);
            let data = historyEntry ? historyEntry.data : null;

            if (!data) {
                // Fetch data if not in history
                data = await this.geoService.getGeolocation(currentIP);
            }

            if (data) {
                this.content.innerHTML = `
                    <p style="color: #61afef; font-weight: bold; margin-bottom: 5px;">Current Detected IP: ${currentIP}</p>
                    ${createTableHTML(data)}
                `;
            } else {
                this.content.innerHTML = `<p>Could not retrieve geolocation for ${currentIP}.</p>`;
            }
        }

        showHistory() {
            this.historyButton.style.color = '#e06c75';
            const history = this.geoService.getHistory();
            if (history.length === 0) {
                this.content.innerHTML = '<p>No IP history recorded yet.</p>';
                return;
            }

            let html = '<p style="color: #e06c75; font-weight: bold; margin-bottom: 10px;">IP Detection History</p>';
            history.forEach(entry => {
                html += `
                    <div class="history-entry">
                        <div class="ip-header">
                            <span>${entry.ip}</span>
                            <span style="font-size: 10px; font-weight: normal; color: #56b6c2;">${entry.timestamp}</span>
                        </div>
                        ${createTableHTML({
                            "Country": entry.data.Country,
                            "City": entry.data.City,
                            "ISP": entry.data.ISP
                        })}
                    </div>
                `;
            });
            this.content.innerHTML = html;
        }
    }

    // --- WebRTC IP Detector ---

    class WebRTCDetector {
        constructor(geoService, panelManager) {
            this.geoService = geoService;
            this.panelManager = panelManager;
            this.OriginalPC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
            this.detectedIps = new Set(); // To track IPs detected in the current session
        }

        init() {
            if (!this.OriginalPC) {
                console.warn('[GeoDetector] RTCPeerConnection not found. WebRTC detection disabled.');
                return;
            }
            this.patchAddIceCandidate();
            this.setupRefreshInterval();
        }

        /**
         * Patches RTCPeerConnection.prototype.addIceCandidate to intercept ICE candidates.
         */
        patchAddIceCandidate() {
            const self = this;
            const origAdd = this.OriginalPC.prototype.addIceCandidate;

            Object.defineProperty(this.OriginalPC.prototype, 'addIceCandidate', {
                value: function(ice, ...rest) {
                    try {
                        const cand = ice.candidate || '';
                        // Use the user's original, specific regex for srflx candidates
                        const typeMatch = cand.match(/typ\s(srflx)/);
                        const ipMatch  = cand.match(/([0-9]{1,3}(?:\.[0-9]{1,3}){3})/);

                        if (typeMatch && ipMatch) {
                            const ip = ipMatch[1];
                            
                            // FIX: Check if the IP is new to the session AND different from the last reported one
                            if (ip !== self.geoService.getLastReportedIP() && !self.detectedIps.has(ip)) {
                                console.log(`[GeoDetector] New Public IP Detected (srflx): ${ip}`);
                                
                                // Add to session set to prevent immediate duplicates
                                self.detectedIps.add(ip);

                                // Update the last reported IP and trigger geolocation/history update
                                // The GeolocationService handles the logic of calling the API and updating history
                                self.geoService.getGeolocation(ip).then(() => {
                                    self.panelManager.updatePanelContent();
                                });
                            }
                        }
                    } catch (e) {
                        // Suppress errors to avoid breaking the application
                        console.error('[GeoDetector] Error in addIceCandidate hook:', e);
                    }
                    // Call the original function
                    return origAdd.call(this, ice, ...rest);
                },
                writable: true,
                configurable: true
            });

            // Restore toString for stealth
            this.OriginalPC.prototype.addIceCandidate.toString = () => 'function addIceCandidate() { [native code] }';
        }

        /**
         * Sets up a periodic check to refresh the panel with the last known IP.
         */
        setupRefreshInterval() {
            setInterval(() => {
                // Only refresh the panel content if the panel is not in history view
                if (this.panelManager.panel && !this.panelManager.currentState.historyView) {
                    this.panelManager.updatePanelContent();
                }
            }, CONFIG.REFRESH_INTERVAL_MS);
        }
    }

    // --- Page Modification Blocker (from original script) ---

    class Blocker {
        init() {
            this.blockReload();
            // Wait for DOMContentLoaded before setting up the observer
            document.addEventListener('DOMContentLoaded', () => {
                this.hideRestartButtons();
            });
        }

        /**
         * Blocks page reload/navigation attempts.
         */
        blockReload() {
            try {
                // Block reload and assign
                window.location.reload = () => console.log('[GeoDetector] window.location.reload blocked');
                window.location.assign = () => console.log('[GeoDetector] window.location.assign blocked');

                // Block href setter
                Object.defineProperty(window.location, 'href', {
                    set: v => console.log('[GeoDetector] window.location.href change blocked to', v),
                    configurable: true
                });
            } catch (e) {
                console.warn('[GeoDetector] Could not override window.location properties:', e);
            }
        }

        /**
         * Hides elements with the text "Neustart" (Restart).
         */
        hideRestartButtons() {
            const hide = () => {
                ['button','a','div','span'].forEach(tag => {
                    document.querySelectorAll(tag).forEach(el => {
                        if (el.innerText && el.innerText.trim().toLowerCase() === 'neustart') {
                            el.style.display = 'none';
                            console.log('[GeoDetector] Hid "Neustart" element:', el);
                        }
                    });
                });
            };

            // Run once immediately
            hide();

            // Use MutationObserver for dynamic content
            new MutationObserver(hide).observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    // --- Main Execution ---

    function main() {
        const geoService = new GeolocationService();
        const panelManager = new PanelManager(geoService);
        const detector = new WebRTCDetector(geoService, panelManager);
        const blocker = new Blocker();

        // Initialize components
        panelManager.init();
        detector.init();
        blocker.init();

        console.log('[GeoDetector] Advanced WebRTC IP Geolocation & Leak Detector initialized.');
    }

    main();

})();
