# Advanced WebRTC IP Geolocation & Leak Detector for Ome.tv

## 🌟 Overview

This is an advanced userscript designed to enhance your experience on **Ome.tv** by providing real-time WebRTC IP detection and geolocation. It is built upon a proven, reliable core logic and features a modern, persistent, and interactive user interface.

## ✨ Features

*   **Real-Time IP Detection:** Uses a highly reliable WebRTC hook to detect the public IP address of the connected peer.
*   **Targeted Logic:** Specifically configured to use the most reliable `srflx` (Server Reflexive) ICE candidates, ensuring accurate detection in the Ome.tv environment.
*   **Advanced Geolocation:** Fetches detailed information including **Country, Region, City, ISP/Organization, Hostname**, and a basic **VPN/Proxy** check.
*   **Persistent & Interactive UI:**
    *   **Draggable and Resizable Panel** with a modern dark theme.
    *   **State Persistence:** The panel's position and collapsed state are saved across sessions.
    *   **IP History:** Tracks and displays the last 5 unique public IPs detected.
*   **Stealth & Stability:** Includes logic to block common page reload attempts and uses robust error handling to ensure the script does not interfere with the site's functionality.

## 🚀 Installation

### Prerequisites

You need a userscript manager installed in your browser, such as:
*   [**Tampermonkey**](https://www.tampermonkey.net/) (Recommended)
*   [**Greasemonkey**](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)

### Steps

1.  **Click the Installation Link:**
    [**Click here to install the script**](https://raw.githubusercontent.com/tyroxcc/ome-tv-ip-geolocator/main/enhanced_ip_geolocator.user.js)
2.  Your userscript manager will open a new tab asking for confirmation.
3.  Click **Install** to add the script to your browser.
4.  Reload the Ome.tv page. The panel will appear in the bottom-right corner.

## 🛠️ Development

The main script file is located in the repository root:
*   [`enhanced_ip_geolocator.user.js`](./enhanced_ip_geolocator.user.js)

### Metadata

| Field | Value |
| :--- | :--- |
| **Name** | Advanced WebRTC IP Geolocation & Leak Detector (ome.tv) |
| **Author** | tyroxcc |
| **Version** | 1.0.5 |
| **Match** | `*://*.ome.tv/*` |

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
