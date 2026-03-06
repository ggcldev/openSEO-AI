import { describe, expect, it } from "vitest";
import { extractHeadMeta, splitHtmlDocument, stripPageChrome } from "@/lib/htmlUtils";

describe("htmlUtils", () => {
  it("splitHtmlDocument extracts body and template shell", () => {
    const input = "<html><head><title>A</title></head><body><main><p>Hello</p></main></body></html>";
    const result = splitHtmlDocument(input);

    expect(result.template.prefix).toContain("<body>");
    expect(result.template.suffix).toContain("</body>");
    expect(result.editableHtml).toBe("<main><p>Hello</p></main>");
  });

  it("extractHeadMeta decodes HTML entities", () => {
    const input =
      "<html><head><title>Sun &amp; Rain</title><meta name=\"description\" content=\"Line &quot;One&quot; &amp; More\"></head><body></body></html>";
    const meta = extractHeadMeta(input);

    expect(meta.title).toBe("Sun & Rain");
    expect(meta.description).toBe('Line "One" & More');
  });

  it("stripPageChrome removes nav/footer and keeps main content", () => {
    const input = `
      <header><a href=\"/\">Home</a></header>
      <nav><a href=\"/a\">A</a><a href=\"/b\">B</a></nav>
      <main>
        <h1>Primary Topic</h1>
        <p>This is the main body content with enough text to survive extraction heuristics.</p>
      </main>
      <footer><a href=\"/privacy\">Privacy</a></footer>
    `;

    const cleaned = stripPageChrome(input);

    expect(cleaned).toContain("Primary Topic");
    expect(cleaned).toContain("main body content");
    expect(cleaned).not.toContain("Privacy");
    expect(cleaned).not.toContain("<nav");
  });

  it("stripPageChrome removes large link-cluster footer blocks", () => {
    const input = `
      <div class="page-shell">
        <main>
          <h1>Chemical and Petrochemical</h1>
          <h2>Chemical Energy Solutions</h2>
          <p>Our power quality solutions reliably and efficiently power the chemical and petrochemical industries.</p>
        </main>
        <div class="footer-links">
          <a href="/home">Home</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/news">News</a>
          <a href="/careers">Careers</a>
          <a href="/investors">Investors</a>
          <a href="/support">Support</a>
          <a href="/locations">Locations</a>
          <a href="/sitemap">Sitemap</a>
          <a href="/legal">Legal</a>
        </div>
      </div>
    `;

    const cleaned = stripPageChrome(input);

    expect(cleaned).toContain("Chemical and Petrochemical");
    expect(cleaned).toContain("Chemical Energy Solutions");
    expect(cleaned).not.toContain("Sitemap");
    expect(cleaned).not.toContain("footer-links");
  });

  it("stripPageChrome removes menu/search/region overlays and keeps page body", () => {
    const input = `
      <main>
        <section class="megaMenuOverlay">
          <button>Login</button>
          <button>Contact us</button>
          <div>Global | EN</div>
          <div>Choose your region and language</div>
          <div>What are you looking for?</div>
          <ul>
            <li>Top Searches</li>
            <li>Transformers</li>
            <li>HVDC</li>
            <li>Renewable Energy</li>
            <li>Top Pages</li>
            <li>Digitalization</li>
            <li>Cybersecurity</li>
            <li>Products & Solutions</li>
            <li>Services & Consulting</li>
            <li>Menu</li>
          </ul>
        </section>
        <article>
          <h1>Chemical and Petrochemical</h1>
          <h2>Our key sustainability products & solutions</h2>
          <p>Our power quality solutions reliably and efficiently power the chemical and petrochemical industries.</p>
        </article>
      </main>
    `;

    const cleaned = stripPageChrome(input);

    expect(cleaned).toContain("Chemical and Petrochemical");
    expect(cleaned).toContain("Our key sustainability products");
    expect(cleaned).not.toContain("Top Searches");
    expect(cleaned).not.toContain("Choose your region and language");
    expect(cleaned).not.toContain("Global | EN");
  });
});
