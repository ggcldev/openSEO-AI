export interface HtmlTemplate {
  prefix: string;
  suffix: string;
}

const SHARED_DOM_PARSER = typeof DOMParser === "undefined" ? null : new DOMParser();

/**
 * Normalizes text by collapsing whitespace and trimming edges.
 * @param value Input text.
 * @returns Whitespace-normalized text.
 */
export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function linkTextLength(root: ParentNode): number {
  return Array.from(root.querySelectorAll("a"))
    .map((node) => normalizeText(node.textContent || "").length)
    .reduce((sum, current) => sum + current, 0);
}

const CHROME_TEXT_PATTERN =
  /\b(login|log in|sign in|contact us|top searches|top pages|choose your region|region and language|region|languages|what are you looking for|menu|search)\b/i;

function interactionCount(root: ParentNode): number {
  return root.querySelectorAll("a,button,[role='button'],input,select,summary").length;
}

function containsChromeMarker(text: string): boolean {
  return CHROME_TEXT_PATTERN.test(text);
}

/**
 * Splits a full HTML document into non-editable shell fragments and editable body markup.
 * @param rawHtml Complete source HTML document.
 * @returns Template shell and editable body HTML.
 */
export function splitHtmlDocument(rawHtml: string): { template: HtmlTemplate; editableHtml: string } {
  const openMatch = /<body[^>]*>/i.exec(rawHtml);
  if (!openMatch || openMatch.index === undefined) {
    return { template: { prefix: "", suffix: "" }, editableHtml: rawHtml };
  }

  const openEnd = openMatch.index + openMatch[0].length;
  const closeMatch = /<\/body>/i.exec(rawHtml.slice(openEnd));
  if (!closeMatch || closeMatch.index === undefined) {
    return { template: { prefix: "", suffix: "" }, editableHtml: rawHtml };
  }

  const closeStart = openEnd + closeMatch.index;
  return {
    template: {
      prefix: rawHtml.slice(0, openEnd),
      suffix: rawHtml.slice(closeStart),
    },
    editableHtml: rawHtml.slice(openEnd, closeStart),
  };
}

/**
 * Merges editable body HTML back into its original document shell.
 * @param template Prefix/suffix shell captured from the original document.
 * @param editableHtml Updated body HTML authored in the editor.
 * @returns Full merged HTML document.
 */
export function mergeHtmlDocument(template: HtmlTemplate, editableHtml: string): string {
  if (!template.prefix && !template.suffix) return editableHtml;
  return `${template.prefix}${editableHtml}${template.suffix}`;
}

/**
 * Removes navigation/chrome blocks and keeps likely main-content markup for editing.
 * @param editableHtml Raw body HTML extracted from the source document.
 * @returns Cleaned content-focused HTML block.
 */
export function stripPageChrome(editableHtml: string): string {
  if (!editableHtml.trim() || !SHARED_DOM_PARSER) {
    return editableHtml;
  }

  const parsed = SHARED_DOM_PARSER.parseFromString(`<!doctype html><html><body>${editableHtml}</body></html>`, "text/html");
  const body = parsed.body;

  body.querySelectorAll("script,style,noscript,template,iframe").forEach((node) => node.remove());
  body.querySelectorAll("[hidden],[aria-hidden='true'],[role='dialog'],[aria-modal='true']").forEach((node) => node.remove());

  const hardRemove =
    "header,nav,footer,aside,[role='navigation'],[role='banner'],[role='contentinfo']," +
    ".breadcrumb,.breadcrumbs,.site-header,.site-footer,.top-nav,.main-nav,.footer-links,.toc,.table-of-contents";
  body.querySelectorAll(hardRemove).forEach((node) => node.remove());

  const chromePattern = /(nav|menu|footer|header|breadcrumb|cookie|sidebar|social|newsletter|search|language|region|account|login)/i;
  body.querySelectorAll<HTMLElement>("[class],[id],[aria-label],[role]").forEach((node) => {
    const classValue = node.getAttribute("class") || "";
    const idValue = node.getAttribute("id") || "";
    const labelValue = node.getAttribute("aria-label") || "";
    const roleValue = node.getAttribute("role") || "";
    const marker = `${classValue} ${idValue} ${labelValue} ${roleValue}`;
    if (chromePattern.test(marker)) {
      node.remove();
    }
  });

  let contentRoot =
    body.querySelector<HTMLElement>(
      "main,article,[role='main'],#main,#content,.main-content,.content-area,.post-content,.entry-content",
    ) || null;

  if (!contentRoot) {
    let best: HTMLElement | null = null;
    let bestScore = 0;

    body.querySelectorAll<HTMLElement>("article,main,section,div").forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (text.length < 240) return;

      const paragraphCount = node.querySelectorAll("p").length;
      const linkDensity = text.length > 0 ? linkTextLength(node) / text.length : 0;
      const score = text.length + paragraphCount * 220 - linkDensity * 1200;

      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });

    contentRoot = best || body;
  }

  const clone = contentRoot.cloneNode(true) as HTMLElement;

  const attributePattern = /(menu|nav|footer|header|sidebar|breadcrumb|share|social|related|newsletter|subscribe|cookie|legal|sitemap|toc)/i;
  clone.querySelectorAll<HTMLElement>("[class],[id],[role],[aria-label]").forEach((node) => {
    const classValue = node.getAttribute("class") || "";
    const idValue = node.getAttribute("id") || "";
    const roleValue = node.getAttribute("role") || "";
    const labelValue = node.getAttribute("aria-label") || "";
    const marker = `${classValue} ${idValue} ${roleValue} ${labelValue}`;
    if (attributePattern.test(marker)) {
      node.remove();
    }
  });

  clone
    .querySelectorAll<HTMLElement>("nav,header,footer,aside,ul,ol,section,div,form")
    .forEach((node) => {
      const text = normalizeText(node.textContent || "");
      if (!text) return;

      const paragraphs = node.querySelectorAll("p").length;
      const headings = node.querySelectorAll("h1,h2,h3,h4,h5,h6").length;
      const links = node.querySelectorAll("a").length;
      const listItems = node.querySelectorAll("li").length;
      const interactions = interactionCount(node);
      const ratio = text.length > 0 ? linkTextLength(node) / text.length : 0;
      const hasChromeMarker = containsChromeMarker(text);
      const linkHeavy = (links >= 4 && ratio > 0.45) || (links >= 7 && text.length < 420);
      const largeLinkCluster = links >= 10 && ratio > 0.28;
      const extremeLinkCluster = links >= 20;
      const interactionCluster = interactions >= 8 && paragraphs === 0 && headings <= 1;
      const menuListCluster = listItems >= 8 && paragraphs === 0 && headings <= 1;
      const markerCluster = hasChromeMarker && (interactions >= 3 || links >= 2 || listItems >= 3);
      const legalLike =
        /(terms|privacy|cookie|sitemap|copyright|all rights reserved)/i.test(text) &&
        links >= 3 &&
        paragraphs === 0;
      const weakContent = paragraphs === 0 && headings === 0 && links >= 3;
      if (
        linkHeavy ||
        largeLinkCluster ||
        extremeLinkCluster ||
        interactionCluster ||
        menuListCluster ||
        markerCluster ||
        legalLike ||
        weakContent
      ) {
        node.remove();
      }
    });

  // Drop obvious top/bottom chrome siblings around the main heading region.
  const allHeadings = clone.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6");
  if (allHeadings.length > 0) {
    const firstHeading = allHeadings.item(0);
    const lastHeading = allHeadings.item(allHeadings.length - 1);
    if (!firstHeading || !lastHeading) {
      const result = clone.innerHTML.trim();
      if (result) return result;
      const fallbackText = normalizeText(clone.textContent || "");
      return fallbackText ? `<p>${fallbackText}</p>` : "<p></p>";
    }

    let previous = firstHeading.previousElementSibling as HTMLElement | null;
    while (previous) {
      const candidate = previous;
      previous = previous.previousElementSibling as HTMLElement | null;
      const text = normalizeText(candidate.textContent || "");
      const links = candidate.querySelectorAll("a").length;
      const paragraphs = candidate.querySelectorAll("p").length;
      const ratio = text.length > 0 ? linkTextLength(candidate) / text.length : 0;
      if ((links >= 3 && ratio > 0.3) || (paragraphs === 0 && links >= 2)) {
        candidate.remove();
      } else {
        break;
      }
    }

    let next = lastHeading.nextElementSibling as HTMLElement | null;
    while (next) {
      const candidate = next;
      next = next.nextElementSibling as HTMLElement | null;
      const text = normalizeText(candidate.textContent || "");
      const links = candidate.querySelectorAll("a").length;
      const paragraphs = candidate.querySelectorAll("p").length;
      const ratio = text.length > 0 ? linkTextLength(candidate) / text.length : 0;
      if ((links >= 3 && ratio > 0.25) || (paragraphs === 0 && links >= 2)) {
        candidate.remove();
      } else {
        break;
      }
    }
  }

  clone.querySelectorAll<HTMLElement>("p,div,section,article").forEach((node) => {
    const text = normalizeText(node.textContent || "");
    if (!text && !node.querySelector("img,video,iframe")) {
      node.remove();
    }
  });

  const result = clone.innerHTML.trim();
  if (result) return result;

  const fallbackText = normalizeText(clone.textContent || "");
  return fallbackText ? `<p>${fallbackText}</p>` : "<p></p>";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("\n", " ");
}

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

function decodeHtmlEntity(entity: string): string | null {
  if (!entity) return null;
  const normalized = entity.toLowerCase();
  if (HTML_ENTITY_MAP[normalized]) return HTML_ENTITY_MAP[normalized];

  if (normalized.startsWith("#x")) {
    const value = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(value) ? String.fromCodePoint(value) : null;
  }

  if (normalized.startsWith("#")) {
    const value = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : null;
  }

  return null;
}

function decodeEntities(value: string): string {
  if (!value) return "";
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity) => {
    const decoded = decodeHtmlEntity(entity);
    return decoded ?? match;
  });
}

/**
 * Extracts title and meta description values from document head markup.
 * @param rawHtml Full HTML document string.
 * @returns Parsed title/description values (decoded and normalized).
 */
export function extractHeadMeta(rawHtml: string): { title: string; description: string } {
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(normalizeText(titleMatch?.[1] || ""));

  const descriptionMatch =
    rawHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i) ||
    rawHtml.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);

  const description = decodeEntities(normalizeText(descriptionMatch?.[1] || ""));
  return { title, description };
}

function upsertTitle(rawHtml: string, title: string): string {
  const nextTitle = normalizeText(title);
  if (!nextTitle) return rawHtml;
  const safeTitle = escapeHtml(nextTitle);

  if (/<title[^>]*>[\s\S]*?<\/title>/i.test(rawHtml)) {
    return rawHtml.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
  }

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `  <title>${safeTitle}</title>\n</head>`);
  }

  return rawHtml;
}

function upsertMetaDescription(rawHtml: string, description: string): string {
  const nextDescription = normalizeText(description);
  if (!nextDescription) return rawHtml;
  const safeDescription = escapeAttribute(nextDescription);
  const tag = `<meta name="description" content="${safeDescription}">`;

  const hasDescriptionMeta =
    /<meta[^>]*name=["']description["'][^>]*>/i.test(rawHtml) ||
    /<meta[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/i.test(rawHtml);

  if (hasDescriptionMeta) {
    return rawHtml
      .replace(/<meta[^>]*name=["']description["'][^>]*>/i, tag)
      .replace(/<meta[^>]*content=["'][^"']*["'][^>]*name=["']description["'][^>]*>/i, tag);
  }

  if (/<\/head>/i.test(rawHtml)) {
    return rawHtml.replace(/<\/head>/i, `  ${tag}\n</head>`);
  }

  return rawHtml;
}

/**
 * Upserts title and description metadata in a full HTML document.
 * @param rawHtml Full HTML document.
 * @param title New title value.
 * @param description New description value.
 * @returns Updated HTML document.
 */
export function applyHeadMeta(rawHtml: string, title: string, description: string): string {
  let next = rawHtml;
  next = upsertTitle(next, title);
  next = upsertMetaDescription(next, description);
  return next;
}

/**
 * Converts HTML markup into normalized plain text.
 * @param html HTML fragment or document string.
 * @returns Space-normalized text content.
 */
export function stripHtml(html: string): string {
  if (!html) return "";

  if (!SHARED_DOM_PARSER) {
    return normalizeText(html.replace(/<[^>]*>/g, " "));
  }

  const parsed = SHARED_DOM_PARSER.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  return normalizeText(parsed.body.textContent || "");
}
