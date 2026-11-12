import { fmt } from './config';
import type { Dictionary } from './dictionaries/en';

type ErrorKey = keyof Dictionary['errors'];

// API trả thông báo lỗi tiếng Anh cố định -> map sang key từ điển. Nhóm (...) của regex
// được thay vào {1}, {2}... Lỗi không có trong danh sách thì giữ nguyên tiếng Anh.
// Sửa câu lỗi ở server thì nhớ sửa pattern tương ứng ở đây.
const PATTERNS: Array<[RegExp, ErrorKey]> = [
  [/^Network error, please try again$/, 'network'],
  [/^Invalid email or password$/, 'invalidCredentials'],
  [/^This account has been suspended$/, 'suspended'],
  [/^Please check the highlighted fields$/, 'checkFields'],
  [/^Invalid email address$/, 'invalidEmail'],
  [/^Password must be at least 8 characters$/, 'passwordShort'],
  [/^Password is too long$/, 'passwordLong'],
  [/^Password is required$/, 'passwordRequired'],
  [/^3–20 characters: letters, numbers, underscore$/, 'usernameFormat'],
  [/^This email is already registered$/, 'emailTaken'],
  [/^This username is already registered$/, 'usernameTaken'],
  [/^Too many attempts\. Try again in (\d+) minute\(s\)\.$/, 'tooManyAttempts'],
  [/^(?:Session expired|Unauthorized)$/, 'sessionExpired'],
  [/^The site is under maintenance\.$/, 'maintenance'],
  [/^Insufficient balance$/, 'insufficientBalance'],
  [/^Access from your IP address has been blocked$/, 'ipBlocked'],
  [/^Invalid coupon code$/, 'couponInvalid'],
  [/^This coupon has expired$/, 'couponExpired'],
  [/^This coupon has been fully used$/, 'couponUsedUp'],
  [/^This coupon does not apply to this product$/, 'couponProduct'],
  [/^Minimum order for this coupon is \$([\d.]+)$/, 'couponMinOrder'],
  [/^Out of stock$/, 'outOfStock'],
  [/^Only (\d+) left in stock$/, 'stockLeft'],
  [/^This product is (?:not |temporarily un)available$/, 'productUnavailable'],
  [/^Quantity must be between (\d+) and (\d+)$/, 'quantityRange'],
  [/^Enter a valid amount$/, 'validAmount'],
  [/^Whole USDT amounts only \(e\.g\. 25\)$/, 'wholeUsdt'],
  [/^Minimum deposit is ([\d.]+) USDT$/, 'minUsdt'],
  [/^Minimum deposit is \$([\d.]+) \(≈ (.+)\)$/, 'minBank'],
  [/^USDT (\w+) deposits are currently unavailable$/, 'usdtUnavailable'],
  [/^You already have (\d+) pending deposits\./, 'tooManyPending'],
  [/^Too many deposits with this amount right now\./, 'amountBusy'],
  [/^Could not reach the blockchain right now\./, 'chainUnreachable'],
  [/^Transaction not found on (\w+) yet\./, 'txNotFound'],
  [/^This TxID has already been used for another deposit$/, 'txUsed'],
  [/^This transaction failed on the blockchain$/, 'txFailed'],
  [/^This transaction did not send USDT \((\w+)\) to our deposit wallet$/, 'txWrongTarget'],
  [/^This transaction was sent before the deposit request was created$/, 'txTooEarly'],
  [/^This deposit is already linked to a different TxID$/, 'txOtherLinked'],
  [/^This deposit request is too old\./, 'depositTooOld'],
  [/^This deposit was rejected\. Please contact support\.$/, 'depositRejected'],
  [/^This deposit has already been processed$/, 'depositProcessed'],
  [/^The receipt image must be 5 MB or smaller$/, 'receiptTooLarge'],
  [/^Upload a JPG, PNG or WebP image$/, 'receiptType'],
  [/^Deposit not found$/, 'depositNotFound'],
  [/^(?:Order not found|Not found)$/, 'notFound'],
  // Yêu cầu bị chặn ở tầng kỹ thuật (form hỏng, khóa chống mua trùng, sai nguồn gửi): khách chỉ cần tải lại trang
  [/^(?:Invalid form data|Invalid order|Invalid origin|Unsupported locale|Missing or invalid Idempotency-Key header|Idempotency-Key was already used)/, 'invalidRequest'],
  [/^Amount mismatch: this transaction sent ([\d.]+) USDT but this request expects exactly ([\d.]+) USDT\./, 'amountMismatch'],
  [/^Invalid (?:\w+ )?TxID$/, 'txInvalid'],
  [/^Please enter your TxID$/, 'txRequired'],
  [/^Enter the transaction reference or upload a receipt$/, 'claimRequired'],
  [/^(?:Bank account not found|Exchange rate for \w+ is not configured|Could not generate a transfer code)/, 'tryLater'],
  // Lý do lưu trên đơn hàng (failReason) do worker ghi
  [/^The supplier could not fulfil this order\./, 'supplierRefund'],
  [/^Partially delivered: (\d+)\/(\d+)\. ([\d.]+) USD refunded to your balance\.$/, 'partialRefund'],
  [/^([\d.]+) USD has been refunded to your balance\.$/, 'refunded'],
];

export function translateError(message: string, d: Dictionary): string {
  for (const [re, key] of PATTERNS) {
    const m = re.exec(message);
    if (m) return fmt(d.errors[key], Object.fromEntries(m.slice(1).map((v, i) => [String(i + 1), v])));
  }
  return message;
}
