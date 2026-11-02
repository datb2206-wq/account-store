// Dùng được ở cả client lẫn server
export function explorerTxUrl(network: string | null, txHash: string) {
  return network === 'BEP20' ? `https://bscscan.com/tx/${txHash}` : `https://tronscan.org/#/transaction/${txHash}`;
}

export function shortHash(hash: string, size = 8) {
  return hash.length > size * 2 + 3 ? `${hash.slice(0, size)}…${hash.slice(-size)}` : hash;
}
