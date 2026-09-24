// Read-only Raydium CPMM PoolState decoder.
// Layout and discriminator are pinned to Raydium's published CPMM PoolState.

export const RAYDIUM_CPMM_PROGRAM_ID = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
export const RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR = Object.freeze([247, 237, 227, 245, 215, 195, 222, 70]);

const LP_MINT_OFFSET = 8 + (32 * 4);
const TOKEN_0_MINT_OFFSET = LP_MINT_OFFSET + 32;
const TOKEN_1_MINT_OFFSET = TOKEN_0_MINT_OFFSET + 32;
const MIN_POOL_STATE_BYTES = TOKEN_1_MINT_OFFSET + 32;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {Uint8Array} bytes @returns {string} */
function base58Encode(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be Uint8Array');
  if (bytes.length === 0) return '';
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) { digits.push(carry % 58); carry = Math.floor(carry / 58); }
  }
  let output = '';
  for (const byte of bytes) { if (byte !== 0) break; output += '1'; }
  for (let i = digits.length - 1; i >= 0; i -= 1) output += BASE58_ALPHABET[digits[i]];
  return output;
}

/** @param {unknown} raw */
function decodePoolState(raw) {
  if (!raw || typeof raw !== 'object' || !('exists' in raw) || !('address' in raw) || !('contextSlot' in raw) ||
      typeof raw.address !== 'string' || !raw.address.trim() || typeof raw.contextSlot !== 'number' ||
      !Number.isSafeInteger(raw.contextSlot) || raw.contextSlot < 0) throw new Error('Invalid raw pool account');
  if (raw.exists !== true) return Object.freeze({ exists: false, address: raw.address, contextSlot: raw.contextSlot });
  if (!('owner' in raw) || typeof raw.owner !== 'string' || raw.owner !== RAYDIUM_CPMM_PROGRAM_ID) throw new Error('Raydium CPMM program owner mismatch');
  if (!('executable' in raw) || raw.executable !== false) throw new Error('Pool state account must not be executable');
  if (!('dataBase64' in raw) || typeof raw.dataBase64 !== 'string') throw new Error('Invalid pool account base64');
  const data = Buffer.from(raw.dataBase64, 'base64');
  if (data.toString('base64') !== raw.dataBase64) throw new Error('Invalid pool account base64');
  if (data.length < MIN_POOL_STATE_BYTES) throw new Error('Raydium CPMM PoolState account is too short');
  for (let i = 0; i < RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR.length; i += 1) {
    if (data[i] !== RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR[i]) throw new Error('Raydium CPMM PoolState discriminator mismatch');
  }
  return Object.freeze({
    exists: true, address: raw.address, owner: raw.owner,
    lpMint: base58Encode(data.subarray(LP_MINT_OFFSET, LP_MINT_OFFSET + 32)),
    mintA: base58Encode(data.subarray(TOKEN_0_MINT_OFFSET, TOKEN_0_MINT_OFFSET + 32)),
    mintB: base58Encode(data.subarray(TOKEN_1_MINT_OFFSET, TOKEN_1_MINT_OFFSET + 32)),
    contextSlot: raw.contextSlot, poolType: 'RAYDIUM_CPMM', payoutAuthorized: false,
  });
}

/** @param {{readRawAccount?: (poolId: string) => Promise<unknown>}} [options] */
export function createRaydiumCpmmPoolReader({ readRawAccount } = {}) {
  if (typeof readRawAccount !== 'function') throw new TypeError('readRawAccount must be a function');
  return Object.freeze({
    /** @param {string} poolId */
    readPoolAccount: async (poolId) => {
      const decoded = decodePoolState(await readRawAccount(poolId));
      if (decoded.address !== poolId) throw new Error('Pool account address mismatch');
      return decoded;
    },
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
