import type { Field } from './quick-form';

// Các ô của form viết / sửa bài (dùng chung cho trang Viết bài mới và Sửa bài)
export function blogPostFields(
  categories: { id: string; name: string }[],
  post?: { title: string; slug: string; excerpt: string | null; content: string; coverUrl: string | null; categoryId: string | null; isPublished: boolean },
): Field[] {
  return [
    { name: 'title', label: 'Tiêu đề bài viết *', required: true, span: 2, defaultValue: post?.title },
    { name: 'slug', label: 'Đường dẫn (slug) *', required: true, placeholder: 'vd: huong-dan-mua-tai-khoan', hint: 'Bài hiện ở /blog/<slug>. Chữ thường không dấu, số và dấu -', defaultValue: post?.slug },
    {
      name: 'categoryId', label: 'Chuyên mục', type: 'select', defaultValue: post?.categoryId ?? '',
      options: [{ value: '', label: '— Không chọn —' }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    },
    { name: 'coverUrl', label: 'Ảnh nổi bật (link https://)', type: 'url', span: 2, placeholder: 'https://…/anh.jpg', defaultValue: post?.coverUrl ?? '' },
    { name: 'excerpt', label: 'Mô tả ngắn', type: 'textarea', rows: 2, span: 2, hint: 'Hiện ở danh sách bài viết và khi chia sẻ link', defaultValue: post?.excerpt ?? '' },
    {
      name: 'content', label: 'Nội dung chi tiết *', type: 'textarea', rows: 16, required: true, span: 2, defaultValue: post?.content,
      hint: 'Dòng trống = đoạn mới · "## " đầu dòng = tiêu đề · "- " đầu dòng = gạch đầu dòng · link https:// tự thành liên kết',
    },
    { name: 'isPublished', label: 'Hiển thị bài viết', type: 'checkbox', defaultValue: post?.isPublished ?? true },
  ];
}
