'use client';

import { useEffect, useState } from 'react';

const utc = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' });
const local = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

// Ngày giờ theo múi giờ máy khách (máy chủ Vercel chạy UTC -> lệch giờ VN 7 tiếng).
// Server render bản UTC để HTML khớp lúc hydrate, sau đó đổi sang giờ địa phương.
export function LocalTime({ value }: { value: Date | string | null | undefined }) {
  const date = value ? new Date(value) : null;
  const [text, setText] = useState(() => (date ? utc.format(date) : '—'));
  const ms = date?.getTime();
  useEffect(() => {
    if (ms !== undefined) setText(local.format(ms));
  }, [ms]);
  return (
    <time dateTime={date?.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}
