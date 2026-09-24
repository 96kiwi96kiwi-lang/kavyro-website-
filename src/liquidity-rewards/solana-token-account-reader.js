// Read-only SPL token-account decoder for LP ownership evidence.
// Decodes finalized getAccountInfo data only; it cannot build, sign, or send transactions.

export const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHn7o8x7J7YgD';

const TOKEN_ACCOUNT_BASE_BYTES = 165;
const MINT_OFFSET = 0;
const OWNER_OFFSET = 32;
const AMOUNT_OFFSET = 64;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {Uint8Array} bytes @returns {string} */
function base58Encode(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes must be Uint8Array');
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let output = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    output += '1';
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) output += BASE58_ALPHABET[digits[i]];
  return output;
}

/** @param {Buffer} data @returns {bigint} */
function readU64LE(data) {
  let value = 0n;
  for (let i = 7; i >= 0; i -= 1) value = (value << 8n) | BigInt(data[AMOUNT_OFFSET + i]);
  return value;
}

/**
 * @param {unknown} raw
 * @returns {Readonly<{exists: false, address: string, contextSlot: number}> | Readonly<{
 *   exists: true, address: string, tokenProgram: string, mint: string, walletOwner: string,
 *   amountBaseUnits: bigint, contextSlot: number, payoutAuthorized: false
 * }>}
 */
export function decodeSolanaTokenAccount(raw) {
  if (!raw || typeof raw !== 'object' || !('exists' in raw) || !('address' in raw) || !('contextSlot' in raw) ||
      typeof raw.address !== 'string' || typeof raw.contextSlot !== 'number') {
    throw new Error('Invalid raw token account');
  }
  if (raw.exists !== true) return Object.freeze({ exists: false, address: raw.address, contextSlot: raw.contextSlot });
  if (!('owner' in raw) || typeof raw.owner !== 'string' ||
      (raw.owner !== SPL_TOKEN_PROGRAM_ID && raw.owner !== TOKEN_2022_PROGRAM_ID)) {
    throw new Error('SPL token program owner mismatch');
  }
  if ('executable' in raw && raw.executable === true) throw new Error('Token account must not be executable');
  if (!('dataBase64' in raw) || typeof raw.dataBase64 !== 'string') throw new Error('Invalid token account base64');

  const data = Buffer.from(raw.dataBase64, 'base64');
  if (data.length < TOKEN_ACCOUNT_BASE_BYTES) throw new Error('SPL token account is too short');

  return Object.freeze({
    exists: true,
    address: raw.address,
    tokenProgram: raw.owner,
    mint: base58Encode(data.subarray(MINT_OFFSET, MINT_OFFSET + 32)),
    walletOwner: base58Encode(data.subarray(OWNER_OFFSET, OWNER_OFFSET + 32)),
    amountBaseUnits: readU64LE(data),
    contextSlot: raw.contextSlot,
    payoutAuthorized: false,
  });
}

/** @param {{readRawAccount: (address: string) => Promise<unknown>}} options */
export function createSolanaTokenAccountReader(options) {
  if (!options || typeof options.readRawAccount !== 'function') throw new TypeError('readRawAccount must be a function');
  const { readRawAccount } = options;
  return Object.freeze({
    /** @param {string} address */
    readTokenAccount: async (address) => decodeSolanaTokenAccount(await readRawAccount(address)),
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
