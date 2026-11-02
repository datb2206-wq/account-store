// Worker gọi mỗi phút:
//  1) Yêu cầu đã gắn TxID nhưng chưa đủ confirmations -> kiểm tra lại, đủ thì cộng tiền.
//  2) Tự phát hiện: đọc các giao dịch USDT chuyển vào ví, khớp SỐ TIỀN LẺ DUY NHẤT với yêu cầu đang mở
//     -> khách không cần dán TxID. Mọi bước xác minh/cộng tiền vẫn đi qua verifyUsdtDeposit().
import { prisma } from '@accszone/database';
import { bscBlockNumber, ChainError, listIncomingBep20, listIncomingTrc20, toRawUnits, USDT_DECIMALS, type IncomingTransfer, type UsdtNetwork } from './chain';
import { getConfig } from './config';
import { USDT_METHOD, verifyUsdtDeposit } from './deposits';
import { DomainError } from './errors';

const OPEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface ScanLogger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface ScanResult {
  rechecked: number;
  autoMatched: number;
  credited: number;
  errors: number;
}

// Con trỏ block đã quét của BSC (giữ trong RAM của process worker)
let bscCursor: bigint | null = null;
const BSC_LOOKBACK = BigInt(process.env.BSC_SCAN_LOOKBACK_BLOCKS || 2000);
const BSC_CHUNK = BigInt(process.env.BSC_LOGS_CHUNK || 500);
const BSC_MAX_PER_RUN = 5_000n;

async function tryVerify(id: string, txHash: string | undefined, result: ScanResult, log: ScanLogger) {
  try {
    const r = await verifyUsdtDeposit(id, null, txHash);
    if (r.status === 'completed') {
      result.credited++;
      log.info(`credited deposit ${id}${txHash ? ` (tx ${txHash})` : ''}`);
    }
  } catch (err) {
    if (!DomainError.is(err)) {
      result.errors++;
      log.warn(`verify ${id} failed: ${err}`);
    } else if (err.status >= 500) {
      result.errors++;
      log.warn(`verify ${id}: ${err.message}`);
    }
    // Lỗi nghiệp vụ (sai số tiền, TxID đã dùng...) -> bỏ qua, admin xem ở trang Giao dịch
  }
}

async function incomingTransfers(network: UsdtNetwork, wallet: string, contract: string, sinceMs: number, log: ScanLogger) {
  if (network === 'TRC20') return listIncomingTrc20(wallet, contract, sinceMs);

  const head = await bscBlockNumber();
  let from = bscCursor === null ? head - BSC_LOOKBACK : bscCursor + 1n;
  if (head - from > BSC_MAX_PER_RUN) from = head - BSC_MAX_PER_RUN;
  const out: IncomingTransfer[] = [];
  for (let start = from; start <= head; start += BSC_CHUNK) {
    const end = start + BSC_CHUNK - 1n < head ? start + BSC_CHUNK - 1n : head;
    try {
      out.push(...(await listIncomingBep20(wallet, contract, start, end)));
    } catch (err) {
      // Dừng ở đây, lần sau quét tiếp từ block đã quét xong
      log.warn(`BSC eth_getLogs failed at block ${start}: ${err instanceof Error ? err.message : err}`);
      return out;
    }
    bscCursor = end;
  }
  return out;
}

export async function scanUsdtDeposits(log: ScanLogger): Promise<ScanResult> {
  const result: ScanResult = { rechecked: 0, autoMatched: 0, credited: 0, errors: 0 };

  // 1) Đang chờ confirmations
  const confirming = await prisma.transaction.findMany({
    where: { type: 'DEPOSIT', method: { in: ['USDT_TRC20', 'USDT_BEP20'] }, status: { in: ['PENDING', 'EXPIRED'] }, txHash: { not: null } },
    select: { id: true },
    take: 50,
  });
  for (const t of confirming) {
    result.rechecked++;
    await tryVerify(t.id, undefined, result, log);
  }

  // 2) Tự phát hiện theo số tiền
  for (const network of ['TRC20', 'BEP20'] as const) {
    const cfg = await getConfig(network === 'TRC20' ? 'usdt.trc20' : 'usdt.bep20');
    if (!cfg.enabled || !cfg.wallet) continue;

    const open = await prisma.transaction.findMany({
      where: {
        type: 'DEPOSIT',
        method: USDT_METHOD[network],
        status: { in: ['PENDING', 'EXPIRED'] },
        txHash: null,
        createdAt: { gt: new Date(Date.now() - OPEN_WINDOW_MS) },
      },
      select: { id: true, originalAmount: true, createdAt: true },
    });
    if (open.length === 0) continue; // không có ai đang chờ -> khỏi gọi API blockchain

    const decimals = USDT_DECIMALS[network];
    const byAmount = new Map(open.map((d) => [toRawUnits(d.originalAmount!.toString(), decimals).toString(), d]));
    const since = Math.min(...open.map((d) => d.createdAt.getTime())) - CLOCK_SKEW_MS;

    let transfers: IncomingTransfer[];
    try {
      transfers = await incomingTransfers(network, cfg.wallet, cfg.contract, since, log);
    } catch (err) {
      result.errors++;
      log.warn(`${network} scan failed: ${err instanceof ChainError ? err.message : err}`);
      continue;
    }

    // Bỏ các TxID đã được ghi nhận
    const used = new Set(
      (
        await prisma.transaction.findMany({
          where: { network, txHash: { in: transfers.map((t) => t.txHash) } },
          select: { txHash: true },
        })
      ).map((t) => t.txHash),
    );

    for (const tr of transfers) {
      if (used.has(tr.txHash)) continue;
      const deposit = byAmount.get(tr.amount.toString());
      if (!deposit) continue;
      byAmount.delete(tr.amount.toString()); // 1 yêu cầu chỉ khớp 1 giao dịch
      result.autoMatched++;
      log.info(`${network}: matched tx ${tr.txHash} -> deposit ${deposit.id}`);
      await tryVerify(deposit.id, tr.txHash, result, log);
    }
  }

  return result;
}
