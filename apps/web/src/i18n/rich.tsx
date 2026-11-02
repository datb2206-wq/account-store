import { Fragment, type ReactNode } from 'react';

/**
 * Như fmt() nhưng placeholder có thể là phần tử React (link, chữ đậm).
 * Thứ tự từ trong câu khác nhau giữa các ngôn ngữ nên không ghép chuỗi bằng tay.
 *   rich('You can view it in {link}.', { link: <Link href="/orders">Orders</Link> })
 */
export function rich(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((chunk, i) => {
    const key = /^\{(\w+)\}$/.exec(chunk)?.[1];
    return <Fragment key={i}>{key && key in parts ? parts[key] : chunk}</Fragment>;
  });
}
