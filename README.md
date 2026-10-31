# Zain Digital Growth

Static website for website development, SEO, social media marketing, and content copywriting services.

## Blog comments

The five blog articles use the Netlify Function in `netlify/functions/blog-comments.mjs` and the `zain-blog-comments` Netlify Blobs store. Visitors can post with a display name and comment; accepted comments appear publicly immediately. The API limits each IP to five comments per hour, includes a honeypot, and returns plain text that the browser renders as text.

Comments are public and there is not yet an owner dashboard or moderation queue. Do not post private information. Add an authenticated management dashboard before relying on comments that need routine moderation or deletion.

Install dependencies with `npm install` and run the API tests with `npm test`. Deploy the repository to Netlify so its Functions and Blobs runtime are available; the comments endpoint will not work on a static-only host.
