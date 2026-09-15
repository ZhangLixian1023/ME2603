import katex from "katex";

type Segment = {
  type: "text" | "inline" | "display";
  value: string;
};

function findClosingDelimiter(text: string, start: number, delimiter: "$" | "$$") {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }

    if (delimiter === "$$") {
      if (text.startsWith("$$", index)) return index;
    } else if (text[index] === "$" && text[index + 1] !== "$") {
      return index;
    }
  }

  return -1;
}

function parseMath(text: string): Segment[] {
  const segments: Segment[] = [];
  let plainText = "";
  let index = 0;

  const flushPlainText = () => {
    if (!plainText) return;
    segments.push({ type: "text", value: plainText });
    plainText = "";
  };

  while (index < text.length) {
    if (text[index] === "\\" && text[index + 1] === "$") {
      plainText += "$";
      index += 2;
      continue;
    }

    if (text[index] !== "$") {
      plainText += text[index];
      index += 1;
      continue;
    }

    const delimiter: "$" | "$$" = text.startsWith("$$", index) ? "$$" : "$";
    const contentStart = index + delimiter.length;
    const contentEnd = findClosingDelimiter(text, contentStart, delimiter);

    if (contentEnd < 0 || contentEnd === contentStart) {
      plainText += delimiter;
      index += delimiter.length;
      continue;
    }

    flushPlainText();
    segments.push({
      type: delimiter === "$$" ? "display" : "inline",
      value: text.slice(contentStart, contentEnd),
    });
    index = contentEnd + delimiter.length;
  }

  flushPlainText();
  return segments;
}

export default function MathText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={`math-text ${className}`.trim()}>
      {parseMath(children).map((segment, index) => {
        if (segment.type === "text") return <span key={index}>{segment.value}</span>;

        let html: string;
        try {
          html = katex.renderToString(segment.value, {
            displayMode: segment.type === "display",
            throwOnError: false,
            trust: false,
            strict: "ignore",
            output: "htmlAndMathml",
            maxExpand: 1000,
          });
        } catch {
          return <span key={index}>{segment.type === "display" ? `$$${segment.value}$$` : `$${segment.value}$`}</span>;
        }

        return <span className={segment.type === "display" ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} key={index} />;
      })}
    </span>
  );
}
