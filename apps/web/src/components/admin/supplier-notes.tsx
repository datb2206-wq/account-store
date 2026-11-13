import Link from 'next/link';
import { Panel } from './ui';

// Khung "Lưu ý" bên phải trang thêm/sửa kết nối API
export function SupplierNotes() {
  return (
    <Panel title="Lưu ý" bodyClassName="space-y-3 text-sm">
      <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-800">
        💡 <b>Mục đích:</b> tự động lấy sản phẩm của web nguồn về bán lại trên web này. Khách mua là hệ thống tự đặt hàng bên nguồn và giao tài khoản ngay.
      </p>
      <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
        <p className="font-semibold">⚠️ Lưu ý quan trọng!</p>
        <p>Số dư của bạn ở web nguồn phải luôn còn tiền: mỗi đơn của khách sẽ trừ giá gốc từ số dư đó. Hết tiền thì đơn của khách tự hoàn tiền.</p>
        <p>Sản phẩm mới đồng bộ về ở trạng thái <b>ẩn</b>: kiểm tra giá rồi bấm &quot;Bật bán&quot; ở trang chi tiết kết nối.</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-3">
        <span className="text-2xl" aria-hidden>🤝</span>
        <div>
          <p className="font-semibold text-zinc-800">AccsZone API v1</p>
          <p className="text-xs text-zinc-500">
            Lấy API key ở{' '}
            <a href="https://accszone.com/user/api-details" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">accszone.com/user/api-details</a>{' '}
            (cần số dư tối thiểu $10 lúc đăng ký).
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-3">
        <span className="text-2xl" aria-hidden>🔗</span>
        <div>
          <p className="font-semibold text-zinc-800">API khác (chuẩn chung)</p>
          <p className="text-xs text-zinc-500">Web nguồn cần có GET /products và POST /orders theo định dạng chung.</p>
        </div>
      </div>
      <Link href="/admin/products?status=inactive" className="block rounded-lg border border-indigo-300 px-3 py-2 text-center font-medium text-indigo-700 hover:bg-indigo-50">
        Xem sản phẩm đang ẩn
      </Link>
    </Panel>
  );
}
