// Chọn adapter theo Supplier.adapter (Admin > Nhà cung cấp).
import { accszoneAdapter } from './accszone-adapter';
import { genericAdapter, type SupplierAdapter } from './generic-adapter';

export function getAdapter(kind: string): SupplierAdapter {
  return kind === 'accszone' ? accszoneAdapter : genericAdapter;
}
