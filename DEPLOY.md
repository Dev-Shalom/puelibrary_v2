# Peaceland University Enugu — Electronic Library Portal

## Files

| File | Deploy? | What it is |
| --- | --- | --- |
| `index.html` | **yes** | Login page. Served at your bare domain. |
| `portal.html` | **yes** | The resources directory, AES-256-GCM encrypted. |
| `index_files/` | **yes** | Logos and database thumbnails. |
| `dark-bg.jpg` | **yes** | Portal background. |
| `build.js` | no | Encrypt/decrypt tool. Harmless if uploaded, but unnecessary. |
| `portal.source.html` | **NEVER** | Decrypted plaintext. Git-ignored. Delete it after editing. |

## Hosting

Upload the four "yes" rows to any static host — Netlify, Vercel, GitHub Pages,
Cloudflare Pages, or plain cPanel `public_html`. No build step, no server, no
database. `index.html` is served automatically at `/`, so visitors land on the
login.

**The site must be served over HTTPS** (or `localhost`, or opened directly as a
`file://`). Browsers only expose the Web Crypto API in a secure context, so a
plain `http://` deployment cannot decrypt the portal. Every host listed above
gives you HTTPS for free.

## Credentials

**The portal password is never written down in this repository, and must not
be.** It is the decryption key for `portal.html`; committing it anywhere would
undo the encryption entirely. Keep it in a password manager and hand it to
students out of band.

The username is `puelibrary`. `index.html` carries only a *verifier* — the
password encrypting a known string — which is what lets it reject a wrong
password offline without the password itself existing in any file.

## Editing the portal

`portal.html` is ciphertext, so you cannot edit it directly.

```bash
node build.js decrypt <password>       # -> portal.source.html
# edit portal.source.html (add/remove database cards, change text)
node build.js encrypt <password>       # -> portal.html, re-stamps index.html
rm portal.source.html
```

## Changing the password

Re-encrypt with the new one, then update the login hint you give students:

```bash
node build.js decrypt <current-password>
node build.js encrypt <new-password>
rm portal.source.html
```

`index.html` picks up the new verifier automatically. Nothing else to change.

## What this protects against, and what it does not

Opening `portal.html` directly, viewing its source, or scraping it gets you a
base64 blob and nothing else — no card markup, no links, none of the 40+
database usernames and passwords. That is the point.

It does not protect against someone who *has* the password: once they log in,
the decrypted page is in their browser and they can save or share it. Shared-
credential access always ends there. Rotate the password each session if that
matters.

## Never commit

Do not put the portal password, or any vendor database credential, into a file
in this repository. `portal.source.html` is git-ignored for exactly this reason
— it is the decrypted portal, and it holds every vendor credential in the clear.
Delete it as soon as you have finished editing.

Before pushing, check:

```bash
git grep -nE "password *[:=]" -- ':!DEPLOY.md'
```
