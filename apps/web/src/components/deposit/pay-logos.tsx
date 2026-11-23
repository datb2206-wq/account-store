// Logo màu cho phương thức nạp (PIX, USDT, mạng TRON / BNB Chain), vẽ bằng SVG inline, không tải ảnh ngoài
type P = { size?: number; className?: string };

export const PixLogo = ({ size = 28, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className={className}>
    <g fill="#32BCAD">
      <path d="M36.6 35.4a5.9 5.9 0 0 1-4.2-1.7l-6-6a1.2 1.2 0 0 0-1.6 0l-6.1 6.1a5.9 5.9 0 0 1-4.2 1.7h-1.2l7.7 7.7a6.2 6.2 0 0 0 8.7 0l7.7-7.8h-.8Z" />
      <path d="M14.5 12.6a5.9 5.9 0 0 1 4.2 1.7l6.1 6.1c.4.4 1.1.4 1.6 0l6-6a5.9 5.9 0 0 1 4.2-1.8h.8l-7.7-7.7a6.2 6.2 0 0 0-8.7 0l-7.7 7.7h1.2Z" />
      <path d="m43.1 19.6-4.7-4.7a.9.9 0 0 1-.3.1h-2.1a4.2 4.2 0 0 0-2.9 1.2l-6 6a2.9 2.9 0 0 1-4.1 0l-6.1-6.1a4.2 4.2 0 0 0-2.9-1.2h-2.6a.9.9 0 0 1-.3 0l-4.7 4.7a6.2 6.2 0 0 0 0 8.7l4.7 4.7h2.9a4.2 4.2 0 0 0 2.9-1.2l6.1-6.1a3 3 0 0 1 4.1 0l6 6a4.2 4.2 0 0 0 2.9 1.2h2.1l.3.1 4.7-4.7a6.2 6.2 0 0 0 0-8.7Z" />
    </g>
  </svg>
);

export const UsdtLogo = ({ size = 28, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <circle cx="16" cy="16" r="16" fill="#26A17B" />
    <path
      fill="#fff"
      d="M17.9 17.4v0c-.1 0-.7.1-1.9.1-1 0-1.7 0-1.9-.1v0c-3.7-.2-6.4-.8-6.4-1.6s2.7-1.4 6.4-1.6v2.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-2.5c3.7.2 6.4.8 6.4 1.6s-2.7 1.4-6.4 1.6Zm0-3.4v-2.2h5.1V8.4H9v3.4h5.1V14c-4.2.2-7.3 1-7.3 2s3.1 1.8 7.3 2v7h3.8v-7c4.1-.2 7.2-1 7.2-2s-3.1-1.8-7.2-2Z"
    />
  </svg>
);

export const TronLogo = ({ size = 22, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <circle cx="16" cy="16" r="16" fill="#EB0029" />
    <path fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" d="M8.5 8.5 24 11.4l-8.6 12.1L8.5 8.5Zm0 0 7 6.2L24 11.4M15.5 14.7l-.1 8.8" />
  </svg>
);

export const BnbLogo = ({ size = 22, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
    <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
    <g fill="#fff" transform="translate(16 16) scale(1.4) translate(-16 -16)">
      <path d="m16 8.6 3.3 3.3-1.4 1.4-1.9-1.9-1.9 1.9-1.4-1.4L16 8.6Z" />
      <path d="m16 23.4-3.3-3.3 1.4-1.4 1.9 1.9 1.9-1.9 1.4 1.4-3.3 3.3Z" />
      <path d="m8.6 16 1.4-1.4 1.4 1.4-1.4 1.4L8.6 16ZM20.6 16l1.4-1.4 1.4 1.4-1.4 1.4-1.4-1.4Z" />
      <path d="m16 14.6 1.4 1.4-1.4 1.4-1.4-1.4 1.4-1.4Z" />
    </g>
  </svg>
);
