'use client';

// <select> trong form GET: đổi lựa chọn là gửi form luôn, không cần bấm nút
export function AutoSelect({ name, defaultValue, options, className = 'input w-36 py-1.5' }: { name: string; defaultValue: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
