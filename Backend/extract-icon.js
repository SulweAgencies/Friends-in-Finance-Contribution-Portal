// extract-icon.js
const fs = require('fs');
const path = require('path');

// Custom site icon SVG path from SVG Repo
const HAND_HOLDING_USD_SVG = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">

<!-- Uploaded to: SVG Repo, www.svgrepo.com, Transformed by: SVG Repo Mixer Tools -->
<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">

<g id="SVGRepo_bgCarrier" stroke-width="0"/>

<g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"/>

<g id="SVGRepo_iconCarrier"> <path d="M11.25 7.84748C10.3141 8.10339 9.75 8.82154 9.75 9.5C9.75 10.1785 10.3141 10.8966 11.25 11.1525V7.84748Z" fill="#2563eb"/> <path d="M12.75 12.8475V16.1525C13.6859 15.8966 14.25 15.1785 14.25 14.5C14.25 13.8215 13.6859 13.1034 12.75 12.8475Z" fill="#2563eb"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM12 5.25C12.4142 5.25 12.75 5.58579 12.75 6V6.31673C14.3804 6.60867 15.75 7.83361 15.75 9.5C15.75 9.91421 15.4142 10.25 15 10.25C14.5858 10.25 14.25 9.91421 14.25 9.5C14.25 8.82154 13.6859 8.10339 12.75 7.84748V11.3167C14.3804 11.6087 15.75 12.8336 15.75 14.5C15.75 16.1664 14.3804 17.3913 12.75 17.6833V18C12.75 18.4142 12.4142 18.75 12 18.75C11.5858 18.75 11.25 18.4142 11.25 18V17.6833C9.61957 17.3913 8.25 16.1664 8.25 14.5C8.25 14.0858 8.58579 13.75 9 13.75C9.41421 13.75 9.75 14.0858 9.75 14.5C9.75 15.1785 10.3141 15.8966 11.25 16.1525V12.6833C9.61957 12.3913 8.25 11.1664 8.25 9.5C8.25 7.83361 9.61957 6.60867 11.25 6.31673V6C11.25 5.58579 11.5858 5.25 12 5.25Z" fill="#2563eb"/> </g>

</svg>`;

const CONFIG = {
    primaryColor: '#2563eb',
    appName: 'Friends in Finance',
    shortName: 'FiF',
    themeColor: '#2563eb'
};

// State file to track if icons have been generated
const STATE_FILE = path.join(__dirname, '.icon-state.json');

function shouldRunExtraction() {
    try {
        // Check if state file exists
        if (fs.existsSync(STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            const assetsDir = path.join(__dirname, '..', 'Frontend', 'assets');
            
            // Check if assets directory exists and has files
            if (fs.existsSync(assetsDir)) {
                const files = fs.readdirSync(assetsDir);
                const requiredFiles = [
                    'hand-holding-usd-colored.svg',
                    'site.webmanifest'
                ];
                
                // Check if all required files exist
                const allFilesExist = requiredFiles.every(file => 
                    files.includes(file)
                );
                
                // If files exist and state is less than 1 day old, skip
                if (allFilesExist && (Date.now() - state.timestamp) < 86400000) {
                    console.log('⏭️  Icons already generated recently, skipping extraction...');
                    return false;
                }
            }
        }
        return true;
    } catch (error) {
        console.log('⚠️  State check failed, running extraction...');
        return true;
    }
}

function updateState() {
    const state = {
        timestamp: Date.now(),
        version: '1.0.0'
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Ensure assets directory exists
const assetsDir = path.join(__dirname, '..', 'Frontend', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
console.log('✅ Created assets directory');

// Save SVG files
function saveSvgIcon() {
    const svgPath = path.join(assetsDir, 'hand-holding-usd.svg');
    fs.writeFileSync(svgPath, HAND_HOLDING_USD_SVG);
    console.log('✅ Saved hand-holding-usd.svg');
    
    const coloredSvgPath = path.join(assetsDir, 'hand-holding-usd-colored.svg');
    fs.writeFileSync(coloredSvgPath, HAND_HOLDING_USD_SVG);
    console.log('✅ Saved colored SVG icon');
}

// Generate site.webmanifest
function generateManifest() {
    const manifestPath = path.join(assetsDir, 'site.webmanifest');
    const manifest = {
        name: CONFIG.appName,
        short_name: CONFIG.shortName,
        icons: [
            {
                src: "/assets/hand-holding-usd-colored.svg",
                sizes: "any",
                type: "image/svg+xml"
            }
        ],
        theme_color: CONFIG.themeColor,
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/index.html"
    };
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✅ Generated site.webmanifest');
}

// Update HTML files if they haven't been updated
function updateHtmlFiles() {
    const frontendDir = path.join(__dirname, '..', 'Frontend');
    
    if (!fs.existsSync(frontendDir)) {
        console.log('⚠️ Frontend directory not found, skipping HTML updates');
        return;
    }
    
    const htmlFiles = fs.readdirSync(frontendDir)
        .filter(file => file.endsWith('.html'));

    const metaTags = `
    <!-- Site Identity - Custom Icon -->
    <link rel="icon" type="image/svg+xml" href="/assets/hand-holding-usd-colored.svg">
    <link rel="apple-touch-icon" href="/assets/hand-holding-usd-colored.svg">
    <link rel="manifest" href="/assets/site.webmanifest">
    <meta name="theme-color" content="${CONFIG.themeColor}">
    <meta name="apple-mobile-web-app-title" content="${CONFIG.appName}">
    <meta name="application-name" content="${CONFIG.appName}">
    `;

    for (const file of htmlFiles) {
        const filePath = path.join(frontendDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // Check if site identity already exists
        if (content.includes('Site Identity - Custom Icon')) {
            continue;
        }

        // Remove any existing favicon links
        content = content.replace(/<link rel="icon"[^>]*>/g, '');
        content = content.replace(/<link rel="apple-touch-icon"[^>]*>/g, '');
        content = content.replace(/<link rel="manifest"[^>]*>/g, '');
        content = content.replace(/<meta name="theme-color"[^>]*>/g, '');

        // Insert after meta charset
        content = content.replace(
            '<meta charset="UTF-8">',
            '<meta charset="UTF-8">' + metaTags
        );

        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated ${file} with hand-holding-usd icon`);
    }
}

// Main function
function main() {
    console.log('\n🔧 Running pre-start icon extraction...\n');
    
    // Check if we should run
    if (!shouldRunExtraction()) {
        return;
    }
    
    // Save SVG files
    saveSvgIcon();
    
    // Generate manifest
    generateManifest();
    
    // Update HTML files
    updateHtmlFiles();
    
    // Update state
    updateState();
    
    console.log('\n✅ Icon extraction complete!\n');
}

// Run the script
main();