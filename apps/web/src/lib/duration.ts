// "604800" giây -> "7 ngày" (dùng được cả server lẫn client)
export function humanizeSeconds(sec: number) {
  if (sec > 0 && sec % 86400 === 0) return `${sec / 86400} ngày`;
  if (sec > 0 && sec % 3600 === 0) return `${sec / 3600} giờ`;
  return `${sec} giây`;
}
