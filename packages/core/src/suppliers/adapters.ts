// Chọn adapter theo Supplier.adapter (Admin > Nhà cung cấp).
import { accszoneAdapter } from './accszone-adapter';
import { genericAdapter, type SupplierAdapter } from './generic-adapter';
import { via79Adapter } from './via79-adapter';

export function getAdapter(kind: string): SupplierAdapter {
  if (kind === 'accszone') return accszoneAdapter;
  if (kind === 'via79') return via79Adapter;
  return genericAdapter;
}
