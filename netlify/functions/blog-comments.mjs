import { createHash, randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const allowedSlugs = new Set([
  "seo-basics",
  "local-seo",
  "homepage-copy",
  "website-speed",
  "social-media-plan",
]);
const commentsPrefix = "comments/";
const rateLimitKey = "rate-limits";
const rateLimitWindowMs = 60 * 60 * 1000;
const maxCommentsPerWindow = 5;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isAllowedSlug(slug) {
  return typeof slug === "string" && allowedSlugs.has(slug);
}

async function listComments(store, slug) {
  const { blobs } = await store.list({ prefix: `${commentsPrefix}${slug}/` });
  const latestBlobs = blobs.sort(function (a, b) {
    return b.key.localeCompare(a.key);
  }).slice(0, 100);
  const comments = await Promise.all(latestBlobs.map(async function (blob) {
    const comment = await store.get(blob.key, { type: "json" });
    if (!comment) throw new Error(`Missing stored comment: ${blob.key}`);
    return {
      id: blob.key.slice(`${commentsPrefix}${slug}/`.length),
      name: comment.name,
      comment: comment.comment,
      createdAt: comment.createdAt,
    };
  }));
  return comments.sort(function (a, b) {
    return b.createdAt.localeCompare(a.createdAt);
  });
}

async function isRateLimited(store, ip, now) {
  const ipHash = createHash("sha256").update(ip).digest("hex");
  const rateLimits = (await store.get(rateLimitKey, { type: "json" })) || {};
  const cutoff = now - rateLimitWindowMs;

  Object.keys(rateLimits).forEach(function (key) {
    const recent = rateLimits[key].filter(function (timestamp) {
      return timestamp > cutoff;
    });
    if (recent.length) rateLimits[key] = recent;
    else delete rateLimits[key];
  });

  const recentForIp = rateLimits[ipHash] || [];
  if (recentForIp.length >= maxCommentsPerWindow) {
    await store.setJSON(rateLimitKey, rateLimits);
    return true;
  }

  rateLimits[ipHash] = recentForIp.concat(now);
  await store.setJSON(rateLimitKey, rateLimits);
  return false;
}

export function createBlogCommentsHandler(getCommentsStore = function () {
  return getStore("zain-blog-comments");
}) {
  return async function handler(request, context) {
    if (request.method !== "GET" && request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed." }, 405);
    }

    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!isAllowedSlug(slug)) {
      return jsonResponse({ error: "Choose a valid blog article." }, 400);
    }

    try {
      const store = getCommentsStore();
      if (request.method === "GET") {
        return jsonResponse({ comments: await listComments(store, slug) });
      }

      const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (contentType !== "application/json") {
        return jsonResponse({ error: "Send the comment as JSON." }, 415);
      }

      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 6000) {
        return jsonResponse({ error: "Your comment is too long." }, 413);
      }

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ error: "The comment could not be read." }, 400);
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return jsonResponse({ error: "The comment could not be read." }, 400);
      }

      if (typeof payload.website === "string" && payload.website.trim()) {
        return jsonResponse({ message: "Thanks for your comment." }, 201);
      }

      const name = typeof payload.name === "string" ? payload.name.trim() : "";
      const comment = typeof payload.comment === "string" ? payload.comment.trim() : "";
      if (name.length < 2 || name.length > 60) {
        return jsonResponse({ error: "Name must be between 2 and 60 characters." }, 400);
      }
      if (comment.length < 5 || comment.length > 2000) {
        return jsonResponse({ error: "Comment must be between 5 and 2,000 characters." }, 400);
      }

      const ip = context.ip;
      if (typeof ip !== "string" || !ip) {
        console.error("Netlify did not provide a client IP for comment rate limiting.");
        return jsonResponse({ error: "Comments are temporarily unavailable. Please try again later." }, 503);
      }
      if (await isRateLimited(store, ip, Date.now())) {
        return jsonResponse({ error: "Please wait before posting another comment." }, 429);
      }

      const createdAt = new Date().toISOString();
      const id = `${Date.now()}-${randomUUID()}`;
      await store.setJSON(`${commentsPrefix}${slug}/${id}`, { name, comment, createdAt });
      return jsonResponse({ message: "Your comment is now public." }, 201);
    } catch (error) {
      console.error("Blog comments request failed:", error);
      return jsonResponse({ error: "Comments are temporarily unavailable. Please try again later." }, 500);
    }
  };
}

export default createBlogCommentsHandler();
