// Đọc giao dịch USDT trên blockchain (chỉ đọc, không cần private key). Chỉ dùng phía server.
import { createHash } from 'node:crypto';

export type UsdtNetwork = 'TRC20' | 'BEP20';

export const USDT_DECIMALS: Record<UsdtNetwork, number> = { TRC20: 6, BEP20: 18 };

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const TRON_API = process.env.TRONGRID_API_URL || 'https://api.trongrid.io';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.bnbchain.org';

export class ChainError extends Error {}

export interface OnchainTransfer {
  from: string;
  to: string;
  amount: bigint; // đơn vị nhỏ nhất của token
}

export interface OnchainTx {
  found: boolean;
  success: boolean;
  confirmations: number;
  timestamp: Date | null;
  transfers: OnchainTransfer[]; // chỉ các Transfer của đúng contract USDT
}

const NOT_FOUND: OnchainTx = { found: false, success: false, confirmations: 0, timestamp: null, transfers: [] };

const strip0x = (h: string) => h.toLowerCase().replace(/^0x/, '');
const last40 = (h: string) => strip0x(h).slice(-40);

// ---------- Địa chỉ TRON: base58check <-> hex ----------
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();

export function tronToHex(address: string) {
  let n = 0n;
  for (const c of address) {
    const i = B58.indexOf(c);
    if (i < 0) throw new ChainError('Địa chỉ TRON không hợp lệ');
    n = n * 58n + BigInt(i);
  }
  const buf = Buffer.from(n.toString(16).padStart(50, '0'), 'hex');
  const body = buf.subarray(0, 21);
  if (buf.length !== 25 || body[0] !== 0x41 || !sha256(sha256(body)).subarray(0, 4).equals(buf.subarray(21))) {
    throw new ChainError('Địa chỉ TRON không hợp lệ');
  }
  return body.subarray(1).toString('hex');
}

export function hexToTron(hex40: string) {
  const body = Buffer.concat([Buffer.from([0x41]), Buffer.from(last40(hex40), 'hex')]);
  let n = BigInt('0x' + Buffer.concat([body, sha256(sha256(body)).subarray(0, 4)]).toString('hex'));
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  return out;
}

export function sameAddress(network: UsdtNetwork, a: string, b: string) {
  if (network === 'BEP20') return a.toLowerCase() === b.toLowerCase();
  try {
    return (a.startsWith('T') ? tronToHex(a) : last40(a)) === (b.startsWith('T') ? tronToHex(b) : last40(b));
  } catch {
    return false;
  }
}

// TxID chuẩn hóa: TRC20 = 64 hex (không 0x), BEP20 = 0x + 64 hex. Luôn lowercase.
export function normalizeTxHash(network: UsdtNetwork, input: string) {
  const hex = strip0x(input.trim());
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return network === 'BEP20' ? `0x${hex}` : hex;
}

// "25.0037" -> 25003700n (6 decimals). Không dùng float.
export function toRawUnits(amount: string, decimals: number) {
  const [int = '0', frac = ''] = amount.split('.');
  if (frac.replace(/0+$/, '').length > decimals) throw new Error(`Số lẻ vượt quá ${decimals} chữ số`);
  return BigInt(int + frac.padEnd(decimals, '0').slice(0, decimals));
}

export function fromRawUnits(raw: bigint, decimals: number) {
  const s = raw.toString().padStart(decimals + 1, '0');
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
}

// ---------- TRC20 qua TronGrid ----------
async function tron<T>(path: string, body: unknown): Promise<T> {
  const key = process.env.TRONGRID_API_KEY;
  const res = await fetch(TRON_API + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key && { 'TRON-PRO-API-KEY': key }) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch((e) => {
    throw new ChainError(`Không kết nối được TronGrid: ${e}`);
  });
  if (!res.ok) throw new ChainError(`TronGrid HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface TronTxInfo {
  id?: string;
  blockNumber?: number;
  blockTimeStamp?: number;
  receipt?: { result?: string };
  log?: { address: string; topics?: string[]; data?: string }[];
}

async function fetchTrc20(txHash: string, contract: string): Promise<OnchainTx> {
  const info = await tron<TronTxInfo>('/wallet/gettransactioninfobyid', { value: txHash });
  if (!info.id || info.blockNumber === undefined) return NOT_FOUND;
  const now = await tron<{ block_header?: { raw_data?: { number?: number } } }>('/wallet/getnowblock', {});
  const head = now.block_header?.raw_data?.number ?? info.blockNumber;
  const contractHex = tronToHex(contract);

  return {
    found: true,
    // Giao dịch TRC20 thành công có receipt.result = SUCCESS
    success: info.receipt?.result === 'SUCCESS',
    confirmations: Math.max(0, head - info.blockNumber),
    timestamp: info.blockTimeStamp ? new Date(info.blockTimeStamp) : null,
    transfers: (info.log ?? [])
      .filter((l) => last40(l.address) === contractHex && strip0x(l.topics?.[0] ?? '') === TRANSFER_TOPIC && (l.topics?.length ?? 0) >= 3)
      .map((l) => ({ from: hexToTron(l.topics![1]!), to: hexToTron(l.topics![2]!), amount: BigInt('0x' + (strip0x(l.data ?? '') || '0')) })),
  };
}

// ---------- BEP20 qua JSON-RPC ----------
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(BSC_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
    cache: 'no-store',
  }).catch((e) => {
    throw new ChainError(`Không kết nối được BSC RPC: ${e}`);
  });
  if (!res.ok) throw new ChainError(`BSC RPC HTTP ${res.status}`);
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new ChainError(`BSC RPC: ${json.error.message}`);
  return json.result as T;
}

interface EvmReceipt {
  status: string;
  blockNumber: string;
  logs: { address: string; topics: string[]; data: string }[];
}

async function fetchBep20(txHash: string, contract: string): Promise<OnchainTx> {
  const receipt = await rpc<EvmReceipt | null>('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return NOT_FOUND; // chưa vào block hoặc không tồn tại
  const [head, block] = await Promise.all([
    rpc<string>('eth_blockNumber', []),
    rpc<{ timestamp: string } | null>('eth_getBlockByNumber', [receipt.blockNumber, false]),
  ]);

  return {
    found: true,
    success: receipt.status === '0x1',
    confirmations: Math.max(0, Number(BigInt(head) - BigInt(receipt.blockNumber))),
    timestamp: block ? new Date(Number(BigInt(block.timestamp)) * 1000) : null,
    transfers: receipt.logs
      .filter((l) => l.address.toLowerCase() === contract.toLowerCase() && strip0x(l.topics[0] ?? '') === TRANSFER_TOPIC && l.topics.length >= 3)
      .map((l) => ({ from: `0x${last40(l.topics[1]!)}`, to: `0x${last40(l.topics[2]!)}`, amount: BigInt(l.data === '0x' ? 0 : l.data) })),
  };
}

export function fetchUsdtTx(network: UsdtNetwork, txHash: string, contract: string) {
  return network === 'TRC20' ? fetchTrc20(txHash, contract) : fetchBep20(txHash, contract);
}

// ---------- Liệt kê USDT chuyển VÀO ví (dùng cho worker tự phát hiện thanh toán) ----------
export interface IncomingTransfer {
  txHash: string;
  amount: bigint;
  timestamp: Date | null;
}

interface TronTrc20Page {
  data?: { transaction_id: string; to: string; value: string; block_timestamp: number }[];
  meta?: { fingerprint?: string };
}

// TronGrid: lịch sử TRC20 của 1 địa chỉ, chỉ chiều nhận, đã solidified. Tối đa maxPages * 200 dòng.
export async function listIncomingTrc20(wallet: string, contract: string, sinceMs: number, maxPages = 5) {
  const key = process.env.TRONGRID_API_KEY;
  const out: IncomingTransfer[] = [];
  let fingerprint: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const qs = new URLSearchParams({
      only_to: 'true',
      only_confirmed: 'true',
      limit: '200',
      contract_address: contract,
      min_timestamp: String(Math.floor(sinceMs)),
      ...(fingerprint && { fingerprint }),
    });
    const res = await fetch(`${TRON_API}/v1/accounts/${wallet}/transactions/trc20?${qs}`, {
      headers: key ? { 'TRON-PRO-API-KEY': key } : {},
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    }).catch((e) => {
      throw new ChainError(`Không kết nối được TronGrid: ${e}`);
    });
    if (!res.ok) throw new ChainError(`TronGrid HTTP ${res.status}`);
    const body = (await res.json()) as TronTrc20Page;
    for (const tr of body.data ?? []) {
      if (sameAddress('TRC20', tr.to, wallet)) {
        out.push({ txHash: tr.transaction_id.toLowerCase(), amount: BigInt(tr.value), timestamp: new Date(tr.block_timestamp) });
      }
    }
    fingerprint = body.meta?.fingerprint;
    if (!fingerprint) break;
  }
  return out;
}

export async function bscBlockNumber() {
  return BigInt(await rpc<string>('eth_blockNumber', []));
}

// eth_getLogs lọc theo topic "to" = ví nhận. LƯU Ý: RPC công khai của BNB Chain thường chặn eth_getLogs
// -> nên đặt BSC_RPC_URL là RPC riêng (QuickNode, Ankr, NodeReal...) nếu muốn tự phát hiện BEP20.
export async function listIncomingBep20(wallet: string, contract: string, fromBlock: bigint, toBlock: bigint) {
  const toTopic = '0x' + last40(wallet).padStart(64, '0');
  const logs = await rpc<{ transactionHash: string; data: string }[]>('eth_getLogs', [
    {
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock: '0x' + toBlock.toString(16),
      address: contract,
      topics: ['0x' + TRANSFER_TOPIC, null, toTopic],
    },
  ]);
  return logs.map<IncomingTransfer>((l) => ({
    txHash: l.transactionHash.toLowerCase(),
    amount: BigInt(l.data === '0x' ? 0 : l.data),
    timestamp: null,
  }));
}
