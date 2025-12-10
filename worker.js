const MIRROR_HOSTS = [
    "h5.aoneroom.com",
    "movieboxapp.in", 
    "moviebox.pk",
    "moviebox.ph",
    "moviebox.id",
    "v.moviebox.ph",
    "netnaija.video"
];

const SELECTED_HOST = "h5.aoneroom.com";
const HOST_URL = `https://${SELECTED_HOST}`;

const DEFAULT_HEADERS = {
    'X-Client-Info': '{"timezone":"Africa/Nairobi"}',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept': 'application/json',
    'User-Agent': 'okhttp/4.12.0',
    'Referer': HOST_URL,
    'Host': SELECTED_HOST,
    'Connection': 'keep-alive',
    'X-Forwarded-For': '1.1.1.1',
    'CF-Connecting-IP': '1.1.1.1',
    'X-Real-IP': '1.1.1.1'
};

const SubjectType = {
    ALL: 0,
    MOVIES: 1,
    TV_SERIES: 2,
    MUSIC: 6
};

let cookieCache = null;
let cookieCacheTime = 0;
const COOKIE_CACHE_DURATION = 3600000; // 1 hour

function processApiResponse(data) {
    if (data && data.data) {
        return data.data;
    }
    return data;
}

async function getCookies() {
    const now = Date.now();
    if (cookieCache && (now - cookieCacheTime) < COOKIE_CACHE_DURATION) {
        return cookieCache;
    }

    try {
        const response = await fetch(`${HOST_URL}/wefeed-h5-bff/app/get-latest-app-pkgs?app_name=moviebox`, {
            headers: DEFAULT_HEADERS
        });

        // Get all Set-Cookie headers properly
        // Use getSetCookie() if available (newer Workers API) or manually parse
        let setCookieHeaders = [];
        if (typeof response.headers.getSetCookie === 'function') {
            setCookieHeaders = response.headers.getSetCookie();
        } else {
            // Fallback: get all set-cookie headers manually
            const allHeaders = [...response.headers];
            setCookieHeaders = allHeaders
                .filter(([key]) => key.toLowerCase() === 'set-cookie')
                .map(([, value]) => value);
        }
        
        if (setCookieHeaders.length > 0) {
            // Extract just name=value from each Set-Cookie header
            // Format: "name=value; Path=/; Max-Age=3600; HttpOnly"
            // We need: "name=value"
            const cookies = setCookieHeaders.map(cookie => {
                const parts = cookie.split(';');
                return parts[0].trim();
            }).join('; ');
            
            cookieCache = cookies;
            cookieCacheTime = now;
        }
        
        return cookieCache;
    } catch (error) {
        console.error('Failed to get cookies:', error.message);
        return null;
    }
}

async function makeApiRequest(url, options = {}) {
    const cookies = await getCookies();
    
    const headers = { ...DEFAULT_HEADERS, ...options.headers };
    if (cookies) {
        headers['Cookie'] = cookies;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    return response;
}

function sanitizeFilename(filename) {
    return filename
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .trim();
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    };
}

async function handleHomepage() {
    const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/home`);
    const data = await response.json();
    const content = processApiResponse(data);
    
    return new Response(JSON.stringify({
        status: 'success',
        data: content
    }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function handleTrending(url) {
    const urlObj = new URL(url);
    const page = parseInt(urlObj.searchParams.get('page')) || 0;
    const perPage = parseInt(urlObj.searchParams.get('perPage')) || 18;
    
    const params = new URLSearchParams({
        page: page,
        perPage: perPage,
        uid: '5591179548772780352'
    });
    
    const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/subject/trending?${params}`);
    const data = await response.json();
    const content = processApiResponse(data);
    
    return new Response(JSON.stringify({
        status: 'success',
        data: content
    }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function handleSearch(query, url) {
    const urlObj = new URL(url);
    const page = parseInt(urlObj.searchParams.get('page')) || 1;
    const perPage = parseInt(urlObj.searchParams.get('perPage')) || 24;
    const subjectType = parseInt(urlObj.searchParams.get('type')) || SubjectType.ALL;
    
    const payload = {
        keyword: query,
        page,
        perPage,
        subjectType
    };
    
    const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/subject/search`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    let content = processApiResponse(data);
    
    if (subjectType !== SubjectType.ALL && content.items) {
        content.items = content.items.filter(item => item.subjectType === subjectType);
    }
    
    if (content.items) {
        content.items.forEach(item => {
            if (item.cover && item.cover.url) {
                item.thumbnail = item.cover.url;
            }
            if (item.stills && item.stills.url && !item.thumbnail) {
                item.thumbnail = item.stills.url;
            }
        });
    }
    
    return new Response(JSON.stringify({
        status: 'success',
        data: content
    }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function handleInfo(movieId) {
    const params = new URLSearchParams({ subjectId: movieId });
    const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/subject/detail?${params}`);
    const data = await response.json();
    const content = processApiResponse(data);
    
    if (content.subject) {
        if (content.subject.cover && content.subject.cover.url) {
            content.subject.thumbnail = content.subject.cover.url;
        }
        if (content.subject.stills && content.subject.stills.url && !content.subject.thumbnail) {
            content.subject.thumbnail = content.subject.stills.url;
        }
    }
    
    return new Response(JSON.stringify({
        status: 'success',
        data: content
    }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function handleSources(movieId, url, request) {
    const urlObj = new URL(url);
    const season = parseInt(urlObj.searchParams.get('season')) || 0;
    const episode = parseInt(urlObj.searchParams.get('episode')) || 0;
    
    const infoParams = new URLSearchParams({ subjectId: movieId });
    const infoResponse = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/subject/detail?${infoParams}`);
    const infoData = await infoResponse.json();
    const movieInfo = processApiResponse(infoData);
    
    const detailPath = movieInfo?.subject?.detailPath;
    if (!detailPath) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Could not get movie detail path'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    const refererUrl = `https://fmoviesunblocked.net/spa/videoPlayPage/movies/${detailPath}?id=${movieId}&type=/movie/detail`;
    
    const params = new URLSearchParams({
        subjectId: movieId,
        se: season,
        ep: episode
    });
    
    const response = await makeApiRequest(`${HOST_URL}/wefeed-h5-bff/web/subject/download?${params}`, {
        headers: {
            'Referer': refererUrl,
            'Origin': 'https://fmoviesunblocked.net'
        }
    });
    
    const data = await response.json();
    const content = processApiResponse(data);
    
    if (content && content.downloads) {
        const title = movieInfo?.subject?.title || 'video';
        const isEpisode = season > 0 && episode > 0;
        
        const protocol = request.headers.get('x-forwarded-proto') || 'https';
        const host = request.headers.get('host');
        const baseUrl = `${protocol}://${host}`;
        
        const sources = content.downloads.map(file => {
            const downloadParams = new URLSearchParams({
                url: file.url,
                title: title,
                quality: file.resolution || 'Unknown'
            });
            
            if (isEpisode) {
                downloadParams.append('season', season);
                downloadParams.append('episode', episode);
            }
            
            return {
                id: file.id,
                quality: file.resolution || 'Unknown',
                directUrl: file.url,
                downloadUrl: `${baseUrl}/api/download?${downloadParams.toString()}`,
                streamUrl: `${baseUrl}/api/stream?url=${encodeURIComponent(file.url)}`,
                size: file.size,
                format: 'mp4'
            };
        });
        
        content.processedSources = sources;
    }
    
    return new Response(JSON.stringify({
        status: 'success',
        data: content
    }), {
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

async function handleStream(url, request) {
    const urlObj = new URL(url);
    const streamUrl = urlObj.searchParams.get('url');
    
    if (!streamUrl || (!streamUrl.startsWith('https://bcdnw.hakunaymatata.com/') && !streamUrl.startsWith('https://valiw.hakunaymatata.com/'))) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Invalid stream URL'
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    const range = request.headers.get('range');
    
    // Get file size with HEAD request
    const headResponse = await fetch(streamUrl, {
        method: 'HEAD',
        headers: {
            'User-Agent': 'okhttp/4.12.0',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net'
        }
    });
    
    const fileSize = parseInt(headResponse.headers.get('content-length'));
    const contentType = headResponse.headers.get('content-type') || 'video/mp4';
    
    if (!fileSize || isNaN(fileSize)) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Could not determine file size'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (isNaN(start) && !isNaN(end)) {
            start = fileSize - end;
            end = fileSize - 1;
        }
        
        if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Range not satisfiable'
            }), {
                status: 416,
                headers: {
                    'Content-Range': `bytes */${fileSize}`,
                    'Content-Type': 'application/json',
                    ...corsHeaders()
                }
            });
        }
        
        const chunkSize = (end - start) + 1;
        
        const response = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Referer': 'https://fmoviesunblocked.net/',
                'Origin': 'https://fmoviesunblocked.net',
                'Range': `bytes=${start}-${end}`
            }
        });
        
        return new Response(response.body, {
            status: 206,
            headers: {
                'Content-Type': contentType,
                'Content-Length': chunkSize,
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                ...corsHeaders()
            }
        });
        
    } else {
        const response = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Referer': 'https://fmoviesunblocked.net/',
                'Origin': 'https://fmoviesunblocked.net'
            }
        });
        
        return new Response(response.body, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': fileSize,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache',
                ...corsHeaders()
            }
        });
    }
}

async function handleDownload(url, request) {
    const urlObj = new URL(url);
    const downloadUrl = urlObj.searchParams.get('url');
    const title = urlObj.searchParams.get('title') || 'video';
    const season = urlObj.searchParams.get('season');
    const episode = urlObj.searchParams.get('episode');
    const quality = urlObj.searchParams.get('quality') || '';
    
    if (!downloadUrl || (!downloadUrl.startsWith('https://bcdnw.hakunaymatata.com/') && !downloadUrl.startsWith('https://valiw.hakunaymatata.com/'))) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Invalid download URL'
        }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    let filename = sanitizeFilename(title);
    
    if (season && episode) {
        filename += `_S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    }
    
    if (quality) {
        filename += `_${quality}`;
    }
    
    filename += '.mp4';
    
    // Check if client sent a Range header for resumable downloads
    const range = request.headers.get('range');
    
    // Get file size first with HEAD request
    const headResponse = await fetch(downloadUrl, {
        method: 'HEAD',
        headers: {
            'User-Agent': 'okhttp/4.12.0',
            'Referer': 'https://fmoviesunblocked.net/',
            'Origin': 'https://fmoviesunblocked.net'
        }
    });
    
    const fileSize = parseInt(headResponse.headers.get('content-length'));
    const contentType = headResponse.headers.get('content-type') || 'video/mp4';
    
    if (!fileSize || isNaN(fileSize)) {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Could not determine file size'
        }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                ...corsHeaders()
            }
        });
    }
    
    if (range) {
        // Parse range header
        const parts = range.replace(/bytes=/, '').split('-');
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        // Handle suffix-byte-range
        if (isNaN(start) && !isNaN(end)) {
            start = fileSize - end;
            end = fileSize - 1;
        }
        
        // Validate range
        if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Range not satisfiable'
            }), {
                status: 416,
                headers: {
                    'Content-Range': `bytes */${fileSize}`,
                    'Content-Type': 'application/json',
                    ...corsHeaders()
                }
            });
        }
        
        const chunkSize = (end - start) + 1;
        
        // Fetch with range
        const response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Referer': 'https://fmoviesunblocked.net/',
                'Origin': 'https://fmoviesunblocked.net',
                'Range': `bytes=${start}-${end}`
            }
        });
        
        return new Response(response.body, {
            status: 206,
            headers: {
                'Content-Type': contentType,
                'Content-Length': chunkSize,
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Accept-Ranges': 'bytes',
                ...corsHeaders()
            }
        });
        
    } else {
        // No range, serve full file
        const response = await fetch(downloadUrl, {
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Referer': 'https://fmoviesunblocked.net/',
                'Origin': 'https://fmoviesunblocked.net'
            }
        });
        
        return new Response(response.body, {
            headers: {
                'Content-Type': contentType,
                'Content-Length': fileSize,
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Accept-Ranges': 'bytes',
                ...corsHeaders()
            }
        });
    }
}

function getHomePage() {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MovieBox API - Cloudflare Workers</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 700;
        }
        .header p {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .badge {
            display: inline-block;
            background: #48bb78;
            color: white;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            margin-top: 10px;
        }
        .content { padding: 30px; }
        .feature-box {
            background: #e6fffa;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border-left: 5px solid #48bb78;
        }
        .feature-box h3 {
            color: #48bb78;
            margin-bottom: 15px;
        }
        .feature-box ul {
            list-style: none;
            padding-left: 0;
        }
        .feature-box li {
            padding: 5px 0;
            color: #2d3748;
        }
        .feature-box li:before {
            content: "✓ ";
            color: #48bb78;
            font-weight: bold;
        }
        .endpoint {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 5px solid #667eea;
        }
        .endpoint h3 {
            color: #667eea;
            margin-bottom: 10px;
        }
        .status {
            display: inline-block;
            background: #48bb78;
            color: white;
            padding: 4px 8px;
            border-radius: 3px;
            font-size: 0.8em;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎬 MovieBox API</h1>
            <p>Powered by Cloudflare Workers</p>
            <span class="badge">✨ Streaming Optimized</span>
            <span class="badge">⚡ Resumable Downloads</span>
        </div>
        
        <div class="content">
            <div class="feature-box">
                <h3>🚀 Cloudflare Workers Features</h3>
                <ul>
                    <li>No timeout limits - stream files of any size</li>
                    <li>Resumable downloads with HTTP range requests</li>
                    <li>Global CDN distribution for fast access worldwide</li>
                    <li>Efficient streaming without memory buffering</li>
                    <li>Works great even on slow networks</li>
                </ul>
            </div>
            
            <div class="endpoint">
                <h3>📥 API Endpoints</h3>
                <p><strong>All endpoints fully operational with streaming support:</strong></p>
                <ul style="list-style: none; padding-left: 0; margin-top: 10px;">
                    <li>🔍 <code>GET /api/search/:query</code> - Search movies & TV series</li>
                    <li>📋 <code>GET /api/info/:movieId</code> - Get detailed information</li>
                    <li>📥 <code>GET /api/sources/:movieId</code> - Get download sources</li>
                    <li>🏠 <code>GET /api/homepage</code> - Featured content</li>
                    <li>🔥 <code>GET /api/trending</code> - Trending content</li>
                    <li>📺 <code>GET /api/stream?url=...</code> - Video streaming (with seeking)</li>
                    <li>⚡ <code>GET /api/download?url=...</code> - Download proxy (resumable)</li>
                </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding: 20px; background: #f7fafc; border-radius: 10px;">
                <h3 style="color: #2d3748; margin-bottom: 10px;">Ready for Cloudflare Deployment</h3>
                <p style="color: #666;">Deploy with: <code>wrangler deploy</code></p>
            </div>
        </div>
    </div>
</body>
</html>`;
    
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html',
            ...corsHeaders()
        }
    });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders()
            });
        }
        
        try {
            if (url.pathname === '/') {
                return getHomePage();
            }
            
            if (url.pathname === '/api/homepage') {
                return await handleHomepage();
            }
            
            if (url.pathname === '/api/trending') {
                return await handleTrending(request.url);
            }
            
            if (url.pathname.startsWith('/api/search/')) {
                const query = url.pathname.split('/api/search/')[1];
                return await handleSearch(decodeURIComponent(query), request.url);
            }
            
            if (url.pathname.startsWith('/api/info/')) {
                const movieId = url.pathname.split('/api/info/')[1];
                return await handleInfo(movieId);
            }
            
            if (url.pathname.startsWith('/api/sources/')) {
                const movieId = url.pathname.split('/api/sources/')[1];
                return await handleSources(movieId, request.url, request);
            }
            
            if (url.pathname === '/api/stream') {
                return await handleStream(request.url, request);
            }
            
            if (url.pathname === '/api/download') {
                return await handleDownload(request.url, request);
            }
            
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Endpoint not found',
                availableEndpoints: [
                    'GET /api/homepage',
                    'GET /api/trending',
                    'GET /api/search/:query',
                    'GET /api/info/:movieId',
                    'GET /api/sources/:movieId',
                    'GET /api/stream?url=...',
                    'GET /api/download?url=...'
                ]
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders()
                }
            });
            
        } catch (error) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Internal server error',
                error: error.message
            }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders()
                }
            });
        }
    }
};
