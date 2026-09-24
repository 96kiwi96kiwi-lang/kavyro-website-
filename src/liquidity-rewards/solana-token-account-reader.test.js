import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPL_TOKEN_PROGRAM_ID,
  decodeSolanaTokenAccount,
  createSolanaTokenAccountReader,
} from './solana-token-account-reader.js';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {Uint8Array} bytes */
function base58Encode(bytes) {
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

function fixture() {
  const data = Buffer.alloc(165);
  const mint = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1));
  const wallet = Buffer.from(Array.from({ length: 32 }, (_, i) => 100 + i));
  mint.copy(data, 0);
  wallet.copy(data, 32);
  data.writeBigUInt64LE(123456789n, 64);
  return {
    raw: { exists: true, address: 'LpTokenAccount111', owner: SPL_TOKEN_PROGRAM_ID, executable: false, dataBase64: data.toString('base64'), contextSlot: 987 },
    mint: base58Encode(mint), wallet: base58Encode(wallet),
  };
}

test('decodes mint, wallet owner and amount from raw on-chain token-account bytes', () => {
  const { raw, mint, wallet } = fixture();
  const decoded = decodeSolanaTokenAccount(raw);
  assert.equal(decoded.exists, true);
  if (!decoded.exists) return;
  assert.equal(decoded.mint, mint);
  assert.equal(decoded.walletOwner, wallet);
  assert.equal(decoded.amountBaseUnits, 123456789n);
  assert.equal(decoded.contextSlot, 987);
  assert.equal(decoded.payoutAuthorized, false);
});

test('fails closed on caller-shaped account not owned by an SPL token program', () => {
  const { raw } = fixture();
  assert.throws(() => decodeSolanaTokenAccount({ ...raw, owner: 'CallerControlledProgram111' }), /program owner mismatch/);
});

test('fails closed on executable or truncated accounts', () => {
  const { raw } = fixture();
  assert.throws(() => decodeSolanaTokenAccount({ ...raw, executable: true }), /must not be executable/);
  assert.throws(() => decodeSolanaTokenAccount({ ...raw, dataBase64: Buffer.alloc(64).toString('base64') }), /too short/);
});

test('reader exposes read-only capabilities and delegates to finalized raw-account reader', async () => {
  const { raw } = fixture();
  /** @type {string[]} */
  const seen = [];
  const reader = createSolanaTokenAccountReader({ readRawAccount: async (address) => { seen.push(address); return raw; } });
  const decoded = await reader.readTokenAccount('LpTokenAccount111');
  assert.equal(decoded.exists, true);
  assert.deepEqual(seen, ['LpTokenAccount111']);
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});
