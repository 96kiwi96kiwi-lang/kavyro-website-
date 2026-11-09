import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT, liquidityRewardsConfig } from './config.js';
import { createCpmmOwnershipVerifier } from './cpmm-ownership-verifier.js';
import { evaluatePayoutGate } from './payout-gate.js';
import { RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR } from './raydium-cpmm-deposit-verifier.js';
import {
  RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR,
  RAYDIUM_CPMM_PROGRAM_ID,
  createRaydiumCpmmPoolReader,
} from './raydium-cpmm-pool-reader.js';
import { createSolanaFinalizedTransactionReader } from './solana-finalized-transaction-reader.js';
import { createSolanaJsonRpcAccountReader } from './solana-json-rpc-reader.js';
import {
  SPL_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createSolanaTokenAccountReader,
} from './solana-token-account-reader.js';
import { createVerifiedContributionComposition } from './verified-contribution-composition.js';

const SIGNATURE = '1'.repeat(64);
const ACCOUNT_URL = 'https://account-rpc.invalid';
const TRANSACTION_URL = 'https://tx-rpc.invalid';
const STATUS_URL = 'https://status-rpc.invalid';
const CONTRIBUTION_SLOT = 900;
const BLOCK_TIME = 1_000_000;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * @typedef {'canonical' | 'signature-status' | 'transaction'} AccountPayload
 * @typedef {'canonical' | 'account'} TransactionPayload
 * @typedef {{
 *   poolSlot?: number,
 *   tokenSlot?: number,
 *   omitPoolExecutable?: boolean,
 *   omitPoolValue?: boolean,
 *   poolValue?: null,
 *   confirmationStatus?: string,
 *   accountPayload?: AccountPayload,
 *   transactionPayload?: TransactionPayload,
 * }} EvidenceScenario
 * @typedef {{url: string, method: string, params: unknown, redirect: string | undefined}} RpcCall
 */

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

/** @param {string} value */
function base58Decode(value) {
  const bytes = [0];
  for (const char of value) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error('invalid base58');
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === '1') zeros += 1;
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

/** @param {number} byte */
function pubkey(byte) {
  return Uint8Array.from({ length: 32 }, () => byte);
}

const walletBytes = pubkey(0x11);
const lpMintBytes = pubkey(0x22);
const poolBytes = pubkey(0x33);
const tokenAccountBytes = pubkey(0x44);
const kvroSourceBytes = pubkey(0x55);
const wallet = base58Encode(walletBytes);
const lpMint = base58Encode(lpMintBytes);
const poolId = base58Encode(poolBytes);
const tokenAccount = base58Encode(tokenAccountBytes);
const kvroSource = base58Encode(kvroSourceBytes);
const depositData = base58Encode(Uint8Array.from(RAYDIUM_CPMM_DEPOSIT_DISCRIMINATOR));

function poolAccountData() {
  const data = Buffer.alloc(232);
  Buffer.from(RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR).copy(data, 0);
  Buffer.from(lpMintBytes).copy(data, 136);
  Buffer.from(base58Decode(KAVYRO_MINT)).copy(data, 168);
  Buffer.from(base58Decode(WRAPPED_SOL_MINT)).copy(data, 200);
  return data.toString('base64');
}

function tokenAccountData() {
  const data = Buffer.alloc(165);
  Buffer.from(lpMintBytes).copy(data, 0);
  Buffer.from(walletBytes).copy(data, 32);
  data.writeBigUInt64LE(42n, 64);
  data[108] = 1;
  return data.toString('base64');
}

const POOL_DATA = poolAccountData();
const TOKEN_DATA = tokenAccountData();

/**
 * @param {number} accountIndex
 * @param {string} mint
 * @param {string} owner
 * @param {bigint} amount
 */
function balance(accountIndex, mint, owner, amount) {
  return {
    accountIndex,
    mint,
    owner,
    uiTokenAmount: {
      amount: amount.toString(),
      decimals: 0,
      uiAmount: null,
      uiAmountString: amount.toString(),
    },
  };
}

function transactionResult() {
  return {
    slot: CONTRIBUTION_SLOT,
    blockTime: BLOCK_TIME,
    transaction: {
      signatures: [SIGNATURE],
      message: {
        accountKeys: [
          { pubkey: wallet, signer: true, writable: true },
          kvroSource,
          tokenAccount,
          poolId,
          RAYDIUM_CPMM_PROGRAM_ID,
        ],
        instructions: [{
          programId: RAYDIUM_CPMM_PROGRAM_ID,
          accounts: [
            wallet,
            'cpmm-authority',
            poolId,
            tokenAccount,
            kvroSource,
            'quote-source',
            'vault-0',
            'vault-1',
            SPL_TOKEN_PROGRAM_ID,
            TOKEN_2022_PROGRAM_ID,
            KAVYRO_MINT,
            WRAPPED_SOL_MINT,
            lpMint,
          ],
          data: depositData,
        }],
      },
    },
    meta: {
      err: null,
      preTokenBalances: [
        balance(1, KAVYRO_MINT, wallet, 1000n),
        balance(2, lpMint, wallet, 5n),
      ],
      postTokenBalances: [
        balance(1, KAVYRO_MINT, wallet, 700n),
        balance(2, lpMint, wallet, 25n),
      ],
    },
  };
}

/** @param {string} confirmationStatus */
function signatureStatusResult(confirmationStatus) {
  return {
    context: { slot: CONTRIBUTION_SLOT + 10 },
    value: [{
      slot: CONTRIBUTION_SLOT,
      confirmations: confirmationStatus === 'finalized' ? null : 1,
      confirmationStatus,
      err: null,
    }],
  };
}

/**
 * @param {string} address
 * @param {EvidenceScenario} scenario
 */
function accountResult(address, scenario) {
  if (scenario.accountPayload === 'signature-status') return signatureStatusResult('finalized');
  if (scenario.accountPayload === 'transaction') return transactionResult();
  if (address === poolId) {
    if (scenario.omitPoolValue) return { context: { slot: scenario.poolSlot ?? 910 } };
    if (scenario.poolValue === null) return { context: { slot: scenario.poolSlot ?? 910 }, value: null };
    /** @type {Record<string, unknown>} */
    const value = {
      owner: RAYDIUM_CPMM_PROGRAM_ID,
      data: [POOL_DATA, 'base64'],
      lamports: 1,
      rentEpoch: 0,
    };
    if (scenario.omitPoolExecutable !== true) value.executable = false;
    return { context: { slot: scenario.poolSlot ?? 910 }, value };
  }
  if (address === tokenAccount) {
    return {
      context: { slot: scenario.tokenSlot ?? 912 },
      value: {
        owner: SPL_TOKEN_PROGRAM_ID,
        data: [TOKEN_DATA, 'base64'],
        lamports: 1,
        executable: false,
        rentEpoch: 0,
      },
    };
  }
  throw new Error(`unexpected account ${address}`);
}

/** @param {unknown} envelope */
function rpcResponse(envelope) {
  const encoded = new TextEncoder().encode(JSON.stringify(envelope));
  let delivered = false;
  return {
    ok: true,
    status: 200,
    headers: {
      /** @param {string} name */
      get: (name) => {
        const normalized = name.toLowerCase();
        if (normalized === 'content-type') return 'application/json; charset=utf-8';
        if (normalized === 'content-length') return String(encoded.byteLength);
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true, value: undefined };
          delivered = true;
          return { done: false, value: encoded };
        },
        cancel: async () => {},
      }),
      cancel: async () => {},
    },
    json: async () => envelope,
  };
}

/** @param {EvidenceScenario} [scenario] */
function createPipeline(scenario = {}) {
  /** @type {RpcCall[]} */
  const calls = [];
  /**
   * @param {string} url
   * @param {{body: string, redirect?: 'error'}} init
   */
  const fetchImpl = async (url, init) => {
    const request = /** @type {{id?: unknown, method?: unknown, params?: unknown}} */ (JSON.parse(init.body));
    if (typeof request.method !== 'string') throw new Error('RPC method missing');
    calls.push({ url, method: request.method, params: request.params, redirect: init.redirect });
    if (request.method === 'getAccountInfo') {
      const params = Array.isArray(request.params) ? request.params : [];
      const address = params[0];
      if (typeof address !== 'string') throw new Error('account address missing');
      return rpcResponse({ jsonrpc: '2.0', id: request.id, result: accountResult(address, scenario) });
    }
    if (request.method === 'getTransaction') {
      const result = scenario.transactionPayload === 'account'
        ? accountResult(poolId, {})
        : transactionResult();
      return rpcResponse({ jsonrpc: '2.0', id: request.id, result });
    }
    if (request.method === 'getSignatureStatuses') {
      return rpcResponse({
        jsonrpc: '2.0',
        id: request.id,
        result: signatureStatusResult(scenario.confirmationStatus ?? 'finalized'),
      });
    }
    throw new Error(`unexpected RPC method ${request.method}`);
  };

  const accountReader = createSolanaJsonRpcAccountReader({ rpcUrl: ACCOUNT_URL, fetchImpl });
  const poolReader = createRaydiumCpmmPoolReader({
    readRawAccount: (address) => accountReader.readRawAccount(address),
  });
  const tokenAccountReader = createSolanaTokenAccountReader({
    readRawAccount: (address) => accountReader.readRawAccount(address),
  });
  const ownershipVerifier = createCpmmOwnershipVerifier({ poolReader, tokenAccountReader });
  const transactionReader = createSolanaFinalizedTransactionReader({
    rpcUrl: TRANSACTION_URL,
    statusRpcUrl: STATUS_URL,
    rpcOperator: 'operator-a',
    statusRpcOperator: 'operator-b',
    fetchImpl,
  });
  const composition = createVerifiedContributionComposition({
    ownershipVerifier,
    transactionReader,
    nowSeconds: () => BLOCK_TIME + 10,
    maxReceiptAgeSeconds: 60,
  });
  return {
    calls,
    accountReader,
    poolReader,
    tokenAccountReader,
    transactionReader,
    composition,
    request: { signature: SIGNATURE, wallet, poolId, tokenAccount },
  };
}

/** @param {readonly RpcCall[]} calls */
function methods(calls) {
  return calls.map((call) => call.method);
}

test('canonical account evidence and signature-status binding compose without authorizing payout', async () => {
  const pipeline = createPipeline();
  const result = await pipeline.composition.verify(pipeline.request);

  assert.equal(result.verified, true);
  assert.equal(result.payoutAuthorized, false);
  assert.equal(result.wallet, wallet);
  assert.equal(result.poolId, poolId);
  assert.equal(result.lpMint, lpMint);
  assert.equal(result.positionId, tokenAccount);
  assert.equal(result.contributedKvroBaseUnits, 300n);
  assert.deepEqual(result.rpcProviders, {
    transactionOperator: 'operator-a',
    statusOperator: 'operator-b',
  });
  assert.deepEqual(pipeline.accountReader.capabilities, {
    read: true, buildTransaction: false, signTransaction: false, sendTransaction: false,
  });
  assert.deepEqual(pipeline.transactionReader.capabilities, {
    read: true, buildTransaction: false, signTransaction: false, sendTransaction: false,
  });
  assert.deepEqual(pipeline.composition.capabilities, {
    read: true, buildTransaction: false, signTransaction: false, sendTransaction: false,
  });

  const accountCalls = pipeline.calls.filter((call) => call.method === 'getAccountInfo');
  const transactionCalls = pipeline.calls.filter((call) => call.method === 'getTransaction');
  const statusCalls = pipeline.calls.filter((call) => call.method === 'getSignatureStatuses');
  assert.equal(accountCalls.length, 2);
  assert.equal(transactionCalls.length, 2);
  assert.equal(statusCalls.length, 2);
  assert.deepEqual(accountCalls.map((call) => call.url), [ACCOUNT_URL, ACCOUNT_URL]);
  assert.deepEqual(new Set(transactionCalls.map((call) => call.url)), new Set([TRANSACTION_URL, STATUS_URL]));
  assert.deepEqual(new Set(statusCalls.map((call) => call.url)), new Set([TRANSACTION_URL, STATUS_URL]));
  for (const call of accountCalls) {
    assert.equal(call.redirect, undefined);
    assert.ok(Array.isArray(call.params));
    assert.equal(call.params.length, 2);
    assert.deepEqual(call.params[1], { encoding: 'base64', commitment: 'finalized' });
  }
  assert.deepEqual(
    accountCalls.map((call) => Array.isArray(call.params) ? call.params[0] : null).sort(),
    [poolId, tokenAccount].sort(),
  );
  for (const call of [...transactionCalls, ...statusCalls]) assert.equal(call.redirect, 'error');
  for (const call of transactionCalls) {
    assert.deepEqual(call.params, [SIGNATURE, {
      commitment: 'finalized',
      encoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
    }]);
  }
  for (const call of statusCalls) {
    assert.deepEqual(call.params, [[SIGNATURE], { searchTransactionHistory: true }]);
  }
  assert.deepEqual(new Set(methods(pipeline.calls)), new Set(['getAccountInfo', 'getTransaction', 'getSignatureStatuses']));

  const gate = evaluatePayoutGate({
    config: liquidityRewardsConfig,
    entitlement: {
      payoutAuthorized: result.payoutAuthorized,
      rewardBaseUnits: result.contributedKvroBaseUnits,
    },
  });
  assert.equal(liquidityRewardsConfig.enabled, false);
  assert.equal(gate.authorized, false);
  assert.equal(gate.canBuildTransaction, false);
  assert.equal(gate.canSignTransaction, false);
  assert.equal(gate.canSendTransaction, false);
  assert.ok(gate.reasons.includes('REWARDS_DISABLED'));
  assert.ok(gate.reasons.includes('PAYOUT_IMPLEMENTATION_NOT_AVAILABLE'));
});

test('a finalized signature status cannot repair non-canonical getAccountInfo evidence', async () => {
  for (const scenario of [
    { omitPoolExecutable: true },
    { omitPoolValue: true },
    { accountPayload: /** @type {const} */ ('signature-status') },
    { accountPayload: /** @type {const} */ ('transaction') },
  ]) {
    const pipeline = createPipeline(scenario);
    const tx = await pipeline.transactionReader.readFinalizedTransaction(SIGNATURE);
    assert.equal(tx.exists, true);
    if (tx.exists !== true) continue;
    assert.equal(tx.finalized, true);
    assert.equal(tx.slot, CONTRIBUTION_SLOT);
    pipeline.calls.length = 0;

    await assert.rejects(
      () => pipeline.accountReader.readRawAccount(poolId),
      /Malformed Solana account response|Malformed Solana RPC response/,
    );
    pipeline.calls.length = 0;
    await assert.rejects(
      () => pipeline.composition.verify(pipeline.request),
      /Malformed Solana account response|Malformed Solana RPC response/,
    );
    assert.equal(pipeline.calls.some((call) => call.method === 'getSignatureStatuses'), false);
    assert.equal(pipeline.calls.some((call) => call.method === 'sendTransaction'), false);
  }
});

test('canonical getAccountInfo evidence cannot supply missing signature finality', async () => {
  const pipeline = createPipeline({ confirmationStatus: 'confirmed' });
  const account = await pipeline.accountReader.readRawAccount(poolId);
  assert.equal(account.exists, true);
  if (account.exists !== true) return;
  assert.equal(account.executable, false);
  assert.equal(account.dataBase64, POOL_DATA);

  await assert.rejects(
    () => pipeline.transactionReader.readFinalizedTransaction(SIGNATURE),
    /finalized signature status/,
  );
  await assert.rejects(
    () => pipeline.composition.verify(pipeline.request),
    /finalized signature status/,
  );
  assert.ok(pipeline.calls.some((call) => call.method === 'getAccountInfo'));
  assert.ok(pipeline.calls.some((call) => call.method === 'getSignatureStatuses'));
});

test('account context slots before the signature-status slot do not compose', async () => {
  const pipeline = createPipeline({ poolSlot: 800, tokenSlot: 801 });
  const pool = await pipeline.poolReader.readPoolAccount(poolId);
  const token = await pipeline.tokenAccountReader.readTokenAccount(tokenAccount);
  const tx = await pipeline.transactionReader.readFinalizedTransaction(SIGNATURE);
  assert.equal(pool.exists, true);
  assert.equal(token.exists, true);
  if (pool.exists !== true || token.exists !== true || tx.exists !== true) return;
  assert.equal(pool.contextSlot, 800);
  assert.equal(token.contextSlot, 801);
  assert.equal(pool.mintA, KAVYRO_MINT);
  assert.equal(pool.mintB, WRAPPED_SOL_MINT);
  assert.equal(pool.lpMint, lpMint);
  assert.equal(token.mint, lpMint);
  assert.equal(token.walletOwner, wallet);
  assert.equal(tx.finalized, true);
  assert.equal(tx.slot, CONTRIBUTION_SLOT);

  await assert.rejects(
    () => pipeline.composition.verify(pipeline.request),
    /VERIFIER_OWNED_LP_PROVENANCE_PRECEDES_CONTRIBUTION/,
  );
});

test('a null account is not invented by finalized signature-status evidence', async () => {
  const pipeline = createPipeline({ poolValue: null });
  const tx = await pipeline.transactionReader.readFinalizedTransaction(SIGNATURE);
  assert.equal(tx.exists, true);
  const account = await pipeline.accountReader.readRawAccount(poolId);
  assert.deepEqual(account, { exists: false, address: poolId, contextSlot: 910 });
  await assert.rejects(
    () => pipeline.composition.verify(pipeline.request),
    /Required on-chain account is missing/,
  );
});

test('getTransaction evidence is not accepted as getAccountInfo evidence', async () => {
  const pipeline = createPipeline({ transactionPayload: 'account' });
  await assert.rejects(
    () => pipeline.transactionReader.readFinalizedTransaction(SIGNATURE),
    /Malformed Solana transaction response/,
  );
  const account = await pipeline.accountReader.readRawAccount(tokenAccount);
  assert.equal(account.exists, true);
  await assert.rejects(() => pipeline.composition.verify(pipeline.request), /Malformed Solana transaction response/);
});
