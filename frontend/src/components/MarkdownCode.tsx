import { useState, useRef, useEffect, Fragment, useCallback } from "react";
import { getCodeString } from "rehype-rewrite";
import mermaid from "mermaid";
import panzoom from "panzoom";

let mermaidInitialized = false;
function ensureMermaidInit() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      fontFamily: "inherit",
    });
    mermaidInitialized = true;
  }
}

const randomid = () => parseInt(String(Math.random() * 1e15), 10).toString(36);

/**
 * Clean mermaid code: fix common LLM output issues that cause parse errors.
 * Applies progressively — level 1 is gentle, level 2 is aggressive.
 */
function cleanMermaidCode(raw: string, aggressive = false): string {
  let code = raw.trim();

  // Remove markdown backtick fences if accidentally included
  code = code.replace(/^```mermaid\s*/i, '').replace(/```\s*$/, '');

  // Remove HTML entities that sneak in
  code = code.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

  // Remove <br/> and <br> tags
  code = code.replace(/<br\s*\/?>/gi, ' ');

  // Remove trailing semicolons from lines
  code = code.replace(/;\s*$/gm, '');

  // Strip markdown links: [text]("url"), [text](url), [text]('url') → text
  // Handles all variations: with/without quotes around URL
  code = code.replace(/\[([^\]]+)\]\(["']?https?:\/\/[^)]*["']?\)/g, '$1');
  // Also catch relative markdown links: [text](path/to/file)
  code = code.replace(/\[([^\]]+)\]\((?!["'])[^)]*\/[^)]+\)/g, '$1');

  // Remove bare URLs from anywhere in quoted labels
  code = code.replace(/(["'])([^"']*)(https?:\/\/\S+)([^"']*)\1/g, (_m, q, before, _url, after) => {
    return `${q}${before.trim()} ${after.trim()}${q}`.replace(/\s+/g, ' ');
  });

  // Fix unquoted labels with special chars: A[Label: thing] → A["Label: thing"]
  code = code.replace(/\[([^\]"]*[:()][^\]"]*)\]/g, '["$1"]');
  // Fix unquoted round labels with special chars
  code = code.replace(/\(([^)"]*[:[\]{}][^)"]*)\)/g, '("$1")');

  // Clean up nested brackets inside quoted labels: ["text [inner] more"] → ["text inner more"]
  code = code.replace(/\["([^"]*)"\]/g, (_, label: string) => {
    const cleaned = label.replace(/\[([^\]]*)\]/g, '$1');
    return `["${cleaned}"]`;
  });

  // Remove stray double-double quotes from over-quoting
  code = code.replace(/\[""/g, '["').replace(/""\]/g, '"]');
  code = code.replace(/\(""/g, '("').replace(/""\)/g, '")');

  if (aggressive) {
    // Strip ALL special chars from labels, keep only alphanumeric, spaces, hyphens, dots
    code = code.replace(/\["([^"]*)"\]/g, (_match, label: string) => {
      const simplified = label
        .replace(/[^a-zA-Z0-9\s.\-,]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      return `["${simplified}"]`;
    });
    code = code.replace(/\("([^"]*)"\)/g, (_match, label: string) => {
      const simplified = label
        .replace(/[^a-zA-Z0-9\s.\-,]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      return `("${simplified}")`;
    });
    code = code.replace(/\{"([^"]*)"\}/g, (_match, label: string) => {
      const simplified = label
        .replace(/[^a-zA-Z0-9\s.\-,?]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      return `{"${simplified}"}`;
    });
  }

  return code.trim();
}

/**
 * Try to render mermaid code. Returns SVG string on success, null on failure.
 */
async function tryRender(code: string): Promise<string | null> {
  ensureMermaidInit();
  try {
    const renderId = `mermaid-${randomid()}`;
    const { svg } = await mermaid.render(renderId, code);
    // Clean up temp element
    const tempEl = document.getElementById(renderId);
    if (tempEl) tempEl.remove();
    return svg;
  } catch {
    // Clean up any broken mermaid elements from the DOM
    document.querySelectorAll('[id^="mermaid-"][id$="-svg"]').forEach(el => {
      if (!el.closest('[data-name="mermaid"]')) el.remove();
    });
    return null;
  }
}

/**
 * Sanitize SVG string by removing script tags, event handlers, and dangerous elements.
 */
function sanitizeSvg(svgString: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");

  // Remove script elements
  const scripts = doc.querySelectorAll("script");
  scripts.forEach((s) => s.remove());

  // Sanitize foreignObject elements (used by Mermaid for text labels)
  const foreignObjects = doc.querySelectorAll("foreignObject");
  foreignObjects.forEach((fo) => {
    fo.querySelectorAll("script").forEach((s) => s.remove());
    const foEls = fo.querySelectorAll("*");
    foEls.forEach((el) => {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  // Remove all event handler attributes (on*)
  const allElements = doc.querySelectorAll("*");
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name.startsWith("on") || attr.name === "href" || attr.name === "xlink:href") {
        if ((attr.name === "href" || attr.name === "xlink:href")) {
          const val = attr.value.trim().toLowerCase();
          if (val.startsWith("javascript:") || val.startsWith("data:") || val.startsWith("vbscript:")) {
            el.removeAttribute(attr.name);
          }
        } else {
          el.removeAttribute(attr.name);
        }
      }
    }
  });

  const serializer = new XMLSerializer();
  return serializer.serializeToString(doc.documentElement);
}

export const MarkdownCode = ({ children = [], className, ...props }: any) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const isMermaid = className && /^language-mermaid/.test(className.toLocaleLowerCase());
  const rawCode = props.node && props.node.children ? getCodeString(props.node.children) : children[0] || '';
  const panzoomInstance = useRef<ReturnType<typeof panzoom> | null>(null);
  const [renderState, setRenderState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorCode, setErrorCode] = useState<string>('');

  const reRender = useCallback(async () => {
    if (!container || !isMermaid) return;

    const codeStr = typeof rawCode === 'string' ? rawCode : '';

    // Skip rendering empty or obviously incomplete code (during streaming)
    if (!codeStr.trim() || codeStr.trim().length < 10) {
      setRenderState('loading');
      return;
    }

    ensureMermaidInit();

    // Attempt 1: gentle clean → render directly (no parse pre-check)
    const gentleCode = cleanMermaidCode(codeStr, false);
    let svg = await tryRender(gentleCode);

    // Attempt 2: aggressive clean → render
    if (!svg) {
      const aggressiveCode = cleanMermaidCode(codeStr, true);
      svg = await tryRender(aggressiveCode);
    }

    if (svg) {
      const sanitized = sanitizeSvg(svg);
      container.innerHTML = sanitized;
      setRenderState('success');

      // Enable panzoom on the SVG
      const svgEl = container.querySelector('svg');
      if (svgEl) {
        svgEl.style.width = '100%';
        svgEl.style.maxWidth = '100%';
        svgEl.style.display = 'block';
        svgEl.style.margin = '0 auto';
        if (panzoomInstance.current) {
          panzoomInstance.current.dispose();
        }
        panzoomInstance.current = panzoom(svgEl, {
          maxZoom: 8,
          minZoom: 0.2,
          bounds: true,
          boundsPadding: 0.2,
          zoomDoubleClickSpeed: 1,
        });
      }
    } else {
      setRenderState('error');
      setErrorCode(gentleCode);
    }
  }, [container, isMermaid, rawCode]);

  useEffect(() => {
    reRender();
    return () => {
      if (panzoomInstance.current) {
        panzoomInstance.current.dispose();
        panzoomInstance.current = null;
      }
    };
  }, [reRender]);

  const refElement = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      setContainer(node);
    }
  }, []);

  if (isMermaid) {
    return (
      <Fragment>
        {renderState === 'loading' && (
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: '1rem' }}>
            Rendering diagram...
          </div>
        )}
        {renderState === 'error' && (
          <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
            <div style={{ background: '#fef2f2', padding: '0.5rem 1rem', fontSize: 12, color: '#991b1b', borderBottom: '1px solid #e5e7eb' }}>
              Diagram syntax not supported — showing raw code
            </div>
            <pre style={{ fontSize: 13, padding: '1rem', overflowX: 'auto', background: '#f9fafb', margin: 0 }}>
              <code>{errorCode}</code>
            </pre>
          </div>
        )}
        <div
          ref={refElement}
          data-name="mermaid"
          style={{
            width: '100%',
            minHeight: renderState === 'success' ? 100 : 0,
            height: renderState === 'success' ? 'min(600px, 60vh)' : 0,
            maxWidth: '100%',
            margin: '0 auto',
            overflow: renderState === 'success' ? 'auto' : 'hidden',
            border: renderState === 'success' ? '1px solid #e5e7eb' : 'none',
            borderRadius: 8,
            background: renderState === 'success' ? '#fff' : 'transparent',
            cursor: renderState === 'success' ? 'grab' : 'default',
          }}
        />
      </Fragment>
    );
  }
  return <code className={className}>{children}</code>;
};
