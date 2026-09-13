#!/usr/bin/env node
/*
 * Peaceland University Enugu — Electronic Library Portal
 * Build tool: encrypts portal.source.html into portal.html.
 *
 *   node build.js encrypt <password>    portal.source.html -> portal.html (+ stamps index.html)
 *   node build.js decrypt <password>    portal.html        -> portal.source.html
 *
 * portal.html holds nothing but AES-256-GCM ciphertext. The password is never
 * stored in any file; index.html only carries a "verifier" — the same password
 * encrypting a known string — so it can reject a wrong password locally.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SOURCE = path.join(ROOT, 'portal.source.html');
const PORTAL = path.join(ROOT, 'portal.html');
const LOGIN = path.join(ROOT, 'index.html');

const KDF_ITERATIONS = 250000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const VERIFIER_PLAINTEXT = 'peaceland-portal-unlock';

function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, KDF_ITERATIONS, 32, 'sha256');
}

// Layout: salt(16) || iv(12) || ciphertext || gcmTag(16) — matches WebCrypto AES-GCM.
function encrypt(password, plaintext) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([salt, iv, body, cipher.getAuthTag()]).toString('base64');
}

function decrypt(password, payloadB64) {
    const raw = Buffer.from(payloadB64, 'base64');
    const salt = raw.subarray(0, SALT_BYTES);
    const iv = raw.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const tag = raw.subarray(raw.length - 16);
    const body = raw.subarray(SALT_BYTES + IV_BYTES, raw.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(password, salt), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

function shell(payloadB64) {
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<meta content="noindex, nofollow" name="robots"/>
<title>PEACELAND UNIVERSITY ENUGU — Electronic Databases &amp; Web Resources</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&amp;display=swap" rel="stylesheet"/>
<style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background: url('dark-bg.jpg') no-repeat center center fixed;
            background-size: cover;
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 15, 35, 0.88);
            z-index: -1;
        }

        .unlock {
            text-align: center;
            max-width: 420px;
        }

        .unlock-spinner {
            width: 44px;
            height: 44px;
            margin: 0 auto 20px;
            border: 3px solid rgba(255, 255, 255, 0.12);
            border-top-color: #ffc107;
            border-radius: 50%;
            animation: unlock-spin 0.9s linear infinite;
        }

        @keyframes unlock-spin {
            to { transform: rotate(360deg); }
        }

        .unlock-text {
            color: rgba(255, 255, 255, 0.6);
            font-size: 0.85rem;
            font-weight: 500;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
    </style>
</head>
<body>
<div class="unlock">
<div class="unlock-spinner" id="unlockSpinner"></div>
<div class="unlock-text" id="unlockText">Unlocking library</div>
</div>
<script id="payload" type="application/octet-stream">${payloadB64}</script>
<script>
        const KDF_ITERATIONS = ${KDF_ITERATIONS};

        function bail(message) {
            try { sessionStorage.removeItem('pueLibraryPass'); } catch (err) {}
            if (message) {
                document.getElementById('unlockSpinner').style.display = 'none';
                document.getElementById('unlockText').textContent = message;
                return;
            }
            window.location.replace('index.html');
        }

        (async function () {
            if (!window.crypto || !crypto.subtle) {
                bail('Requires a secure connection (https)');
                return;
            }

            let password = null;
            try { password = sessionStorage.getItem('pueLibraryPass'); } catch (err) {}
            if (!password) { bail(); return; }

            try {
                const raw = Uint8Array.from(
                    atob(document.getElementById('payload').textContent.trim()),
                    c => c.charCodeAt(0));

                const baseKey = await crypto.subtle.importKey(
                    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
                const key = await crypto.subtle.deriveKey(
                    { name: 'PBKDF2', salt: raw.slice(0, ${SALT_BYTES}), iterations: KDF_ITERATIONS, hash: 'SHA-256' },
                    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
                const plain = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv: raw.slice(${SALT_BYTES}, ${SALT_BYTES + IV_BYTES}) },
                    key, raw.slice(${SALT_BYTES + IV_BYTES}));

                const html = new TextDecoder().decode(plain);
                document.open();
                document.write(html);
                document.close();
            } catch (err) {
                bail();
            }
        })();
    </script>
</body></html>
`;
}

function run() {
    const [mode, password] = process.argv.slice(2);

    if (!mode || !password || !['encrypt', 'decrypt'].includes(mode)) {
        console.error('Usage: node build.js encrypt|decrypt <password>');
        process.exit(1);
    }

    if (mode === 'encrypt') {
        if (!fs.existsSync(SOURCE)) {
            console.error(`Missing ${path.basename(SOURCE)} — run "node build.js decrypt <password>" first.`);
            process.exit(1);
        }

        fs.writeFileSync(PORTAL, shell(encrypt(password, fs.readFileSync(SOURCE, 'utf8'))), 'utf8');

        // Stamp a fresh verifier into the login page so it can reject wrong passwords.
        const login = fs.readFileSync(LOGIN, 'utf8');
        const stamped = login.replace(
            /const VERIFIER = '[^']*';/,
            `const VERIFIER = '${encrypt(password, VERIFIER_PLAINTEXT)}';`);
        if (stamped === login) {
            console.error('Could not find the VERIFIER constant in index.html.');
            process.exit(1);
        }
        fs.writeFileSync(LOGIN, stamped, 'utf8');

        console.log(`Encrypted ${path.basename(SOURCE)} -> ${path.basename(PORTAL)}`);
        console.log('Stamped verifier into index.html');
        console.log(`\nDeploy: index.html, portal.html, index_files/, dark-bg.jpg`);
        console.log(`Do NOT deploy: ${path.basename(SOURCE)} (plaintext), build.js`);
        return;
    }

    if (!fs.existsSync(PORTAL)) {
        console.error(`Missing ${path.basename(PORTAL)}.`);
        process.exit(1);
    }

    const match = fs.readFileSync(PORTAL, 'utf8')
        .match(/<script id="payload"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
        console.error('No payload found in portal.html.');
        process.exit(1);
    }

    try {
        fs.writeFileSync(SOURCE, decrypt(password, match[1].trim()), 'utf8');
    } catch (err) {
        console.error('Wrong password — could not decrypt portal.html.');
        process.exit(1);
    }

    console.log(`Decrypted ${path.basename(PORTAL)} -> ${path.basename(SOURCE)}`);
    console.log('Edit it, re-run "node build.js encrypt <password>", then delete the source file.');
}

run();
