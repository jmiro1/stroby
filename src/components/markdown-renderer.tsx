/**
 * Simple server-side Markdown → HTML renderer.
 *
 * Handles: headings, paragraphs, bold, italic, links, unordered/ordered lists,
 * blockquotes, horizontal rules, inline code, code blocks, and tables.
 *
 * No external dependencies — keeps the bundle lean. For richer MDX support,
 * swap in a proper MDX compiler later.
 */

function markdownToHtml(md: string): string {
  let html = md;

  // Normalise line endings
  html = html.replace(/\r\n/g, "\n");

  // Code blocks (``` ... ```)
  html = html.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    return `<pre><code>${escapeHtml(inner)}</code></pre>`;
  });

  // Tables
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/g,
    (_match, headerRow: string, _sep: string, bodyRows: string) => {
      const headers = headerRow
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${inlineMarkdown(c.trim())}</th>`)
        .join("");
      const rows = bodyRows
        .trim()
        .split("\n")
        .map((row: string) => {
          const cells = row
            .split("|")
            .filter((c: string) => c.trim())
            .map((c: string) => `<td>${inlineMarkdown(c.trim())}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `\n<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>\n`;
    }
  );

  // Split into lines for block-level processing
  const lines = html.split("\n");
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip already-processed HTML blocks
    if (line.startsWith("<pre>") || line.startsWith("<table>")) {
      output.push(line);
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      output.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      output.push(
        `<blockquote><p>${inlineMarkdown(quoteLines.join(" "))}</p></blockquote>`
      );
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i++;
      }
      output.push(
        "<ul>" +
          items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("") +
          "</ul>"
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      output.push(
        "<ol>" +
          items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("") +
          "</ol>"
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-block lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^[-*+]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) &&
      !lines[i].startsWith("> ") &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !lines[i].startsWith("<")
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${inlineMarkdown(paraLines.join(" "))}</p>`);
    } else {
      // Pass through any HTML line as-is
      output.push(line);
      i++;
    }
  }

  return output.join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(text: string): string {
  let result = text;
  // Inline code
  result = result.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold + italic
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  result = result.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Links
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2">$1</a>'
  );
  return result;
}

export function MarkdownRenderer({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
