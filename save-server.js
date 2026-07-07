const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Simple file paths
const DATA_FILE = path.join(__dirname, 'data', 'projects.json');
const DATA_JS_FILE = path.join(__dirname, 'data.js');
const WRITING_DIR = path.join(__dirname, 'writing');
const BASE_DIR = __dirname;

console.log('========================================');
console.log('📁 Written Admin Server');
console.log('========================================');
console.log('📍 Data file:', DATA_FILE);
console.log('📍 Data JS file:', DATA_JS_FILE);
console.log('📍 Writing directory:', WRITING_DIR);
console.log('');

// Ensure directories exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(WRITING_DIR)) {
    fs.mkdirSync(WRITING_DIR, { recursive: true });
}

// Initialize projects.json if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
        projects: [],
        genres: ['sci-fi', 'ya', 'article', 'poetry', 'essay', 'guide'],
        themes: ['technology', 'writing', 'post-apocalyptic', 'publishing', 'autobiographical'],
        series: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    console.log('✅ Created default projects.json');
}

// Function to generate data.js from projects.json
function generateDataJs() {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        const jsContent = `// Auto-generated from projects.json\n// Do not edit directly - changes will be overwritten\nwindow.__WRITTEN_DATA__ = ${JSON.stringify(data, null, 2)};`;
        fs.writeFileSync(DATA_JS_FILE, jsContent, 'utf8');
        console.log('✅ Generated data.js');
        return true;
    } catch (err) {
        console.log('⚠️ Could not generate data.js:', err.message);
        return false;
    }
}

// Generate data.js on startup
generateDataJs();

// Create the server
const server = http.createServer((req, res) => {
    const url = req.url;
    const method = req.method;

    console.log('📥', method, url);

    // ========== CORS ==========
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ========== API: GET /api/projects ==========
    if (method === 'GET' && url === '/api/projects') {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
            console.log('✅ GET /api/projects');
        } catch (err) {
            console.log('❌ Error:', err.message);
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ========== API: GET /api/data-js ==========
    if (method === 'GET' && url === '/api/data-js') {
        try {
            const data = fs.readFileSync(DATA_JS_FILE, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(data);
            console.log('✅ GET /api/data-js');
        } catch (err) {
            console.log('❌ Error:', err.message);
            res.writeHead(500);
            res.end('// Error loading data');
        }
        return;
    }

    // ========== API: POST /api/save-projects ==========
    if (method === 'POST' && url === '/api/save-projects') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                // Format the JSON nicely
                const parsed = JSON.parse(body);
                fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
                // Generate data.js
                generateDataJs();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                console.log('✅ POST /api/save-projects');
            } catch (err) {
                console.log('❌ Error:', err.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ========== API: POST /api/save-html ==========
    if (method === 'POST' && url === '/api/save-html') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { filePath, content } = data;
                
                if (!filePath || !content) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: 'Missing filePath or content' }));
                    return;
                }
                
                // Build the full file path
                const fullPath = path.join(BASE_DIR, filePath);
                const dir = path.dirname(fullPath);
                
                // Ensure directory exists
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Write the file
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log('✅ Saved HTML:', filePath);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.log('❌ Error saving HTML:', err.message);
                res.writeHead(500);
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ========== Static Files ==========
    // Build the file path
    let filePath;
    if (url === '/') {
        filePath = path.join(BASE_DIR, 'index.html');
    } else {
        let relativePath = url.substring(1);
        filePath = path.join(BASE_DIR, relativePath);
    }

    // If file doesn't exist, try with /written prefix
    if (!fs.existsSync(filePath)) {
        const altPath = path.join(BASE_DIR, 'written', url.substring(1));
        if (fs.existsSync(altPath)) {
            filePath = altPath;
        }
    }

    // If it's a directory, try index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        console.log('❌ 404:', url, '->', filePath);
        res.writeHead(404);
        res.end('File not found: ' + url);
        return;
    }

    // Serve the file
    const ext = path.extname(filePath);
    const types = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.webp': 'image/webp'
    };

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.log('❌ Error reading:', filePath);
            res.writeHead(500);
            res.end('Server error');
            return;
        }
        res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
        res.end(data);
        console.log('✅', url, '->', path.basename(filePath));
    });
});

server.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('✅ SERVER RUNNING!');
    console.log('========================================');
    console.log('🌐 Admin: http://localhost:' + PORT + '/admin/admin.html');
    console.log('📝 API: http://localhost:' + PORT + '/api/projects');
    console.log('📄 Data JS: http://localhost:' + PORT + '/data.js');
    console.log('💾 Save HTML: POST /api/save-html');
    console.log('========================================');
    console.log('');
});