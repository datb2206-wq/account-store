// Hiển thị nội dung bài viết dạng văn bản đơn giản, KHÔNG dùng HTML thô (tránh chèn mã độc):
// dòng trống = đoạn mới, "## " = tiêu đề, "- " = gạch đầu dòng, link https:// tự thành liên kết.
const URL_RE = /(https:\/\/[^\s<>"')]+)/g;

function linkify(text: string) {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 underline break-all">{part}</a>
    ) : (
      part
    ),
  );
}

export function BlogContent({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-7 text-zinc-700">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        if (lines.length === 0) return null;
        if (lines.length === 1 && lines[0]!.startsWith('## ')) {
          return <h2 key={i} className="pt-2 text-xl font-semibold text-zinc-900">{lines[0]!.slice(3)}</h2>;
        }
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => <li key={j}>{linkify(l.slice(2))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>{j > 0 && <br />}{linkify(l)}</span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
