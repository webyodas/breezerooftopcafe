# Breeze The Roof-Top Café 🌇☕

Official modern website for **Breeze The Roof-Top Café**, Palghar's premier open-air rooftop dining terrace located on the 5th Floor of Kanchan Aura, Mahim Road, Palghar, Maharashtra.

[![Cloudflare Pages](https://img.shields.io/badge/Deploy-Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

---

## 🌟 Features

- **Live Operating Hours Status**: Automatically checks local time and displays whether the cafe is open (11:00 AM – 11:00 PM).
- **Direct Takeaway & Table Booking**: Instant reservations and takeaways handled directly via WhatsApp (+91 9623999095).
- **Embedded Google Map**: Pinned location on the 5th Floor of Kanchan Aura, Palghar with one-click directions.
- **Interactive Food & Drink Menu**: 9 categorized tabs with instant real-time search, vegetarian indicators, authentic prices, and descriptions.
- **Printed Menu Modal Viewer**: Inspect the official printed cafe menu card with high-resolution modal zoom.
- **Breeze Video Reels**: Interactive video showcase playing real cafe moments, barista brewing, table feasts, and mocktail craft with audio/playback toggles.
- **Table Reservation Form**: Instant table booking directly formatted into a WhatsApp message sent to the cafe manager (+91 9623999095).
- **Responsive & Modern Design**: Built with HTML5, CSS3 Custom Properties, Glassmorphism, and Vanilla JavaScript with zero bloated dependencies.

---

## ☁️ Deploying to Cloudflare Pages

This repository is pre-configured for **zero-config instant deployment on Cloudflare Pages**:

### Option 1: Git Integration (Recommended)
1. Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Select repository: `webyodas-wq/breezecafe`.
3. In the setup screen:
   - **Framework preset**: `None`
   - **Build command**: *(leave blank)*
   - **Build output directory**: `.` (or `/`)
4. Click **Save and Deploy**. Your site will be live on `https://breezecafe.pages.dev` in seconds!

### Option 2: Direct Wrangler CLI Deployment
```bash
npx wrangler pages deploy . --project-name=breezecafe
```

---

## 📁 Repository Structure

```
├── index.html              # Main website entry point
├── css/
│   └── style.css           # Custom responsive styles & animations
├── js/
│   └── main.js             # Menu filters, search, reels player, WhatsApp booking
├── assets/                 # High-resolution videos, photos, and branding
│   ├── logo-transparent.png
│   ├── combo-dish.mp4
│   ├── drinks.mp4
│   ├── dish-show.mp4
│   ├── influencer-vibe.mp4
│   ├── signature-combo.jpg
│   ├── rooftop-night.jpg
│   ├── rooftop-daylight.jpg
│   └── menu.avif
├── _headers                # Cloudflare Pages caching, security, and video streaming rules
├── _redirects              # Clean URL redirects
├── wrangler.toml           # Cloudflare Pages project configuration
└── README.md
```

---

## 📍 Cafe Information

- **Name**: Breeze The Roof-Top Café
- **Address**: 5th Floor Kanchan Aura, Mahim Rd, Palghar, Maharashtra 401404
- **Timings**: 11:00 AM – 11:00 PM Daily
- **Phone**: +91 9623999095
- **Instagram**: [@breezetherooftopcafe](https://www.instagram.com/breezetherooftopcafe/?hl=en)
- **Google Maps**: [maps.app.goo.gl/2LKpvN9paxTDa77ZA](https://maps.app.goo.gl/2LKpvN9paxTDa77ZA)
