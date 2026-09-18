// Read-only Solana JSON-RPC account reader.
// This transport only calls getAccountInfo and cannot build, sign, or send transactions.

const clean = (value) => typeof value === 'string' ? value.trim() : '';

export function createSolanaJsonRpcAccountReader({ rpcUrl, fetchImpl = globalThis.fetch } = {}) {
  const endpoint = clean(rpcUrl);
  if (!endpoint) throw new TypeError('rpcUrl is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  let requestId = 0;

  const readRawAccount = async (address) => {
    const accountAddress = clean(address);
    if (!accountAddress) throw new TypeError('account address is required');

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'getAccountInfo',
        params: [accountAddress, { encoding: 'base64', commitment: 'finalized' }],
      }),
    });

    if (!response?.ok) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
    const payload = await response.json();
    if (payload?.error) throw new Error('Solana RPC returned an error');

    const contextSlot = payload?.result?.context?.slot;
    const value = payload?.result?.value;
    if (value == null) return Object.freeze({ exists: false, address: accountAddress, contextSlot });

    const owner = clean(value.owner);
    const encoded = Array.isArray(value.data) ? value.data[0] : '';
    if (!owner || typeof encoded !== 'string' || !encoded) throw new Error('Malformed Solana account response');

    return Object.freeze({
      exists: true,
      address: accountAddress,
      owner,
      dataBase64: encoded,
      contextSlot,
      lamports: value.lamports,
      executable: value.executable === true,
      rentEpoch: value.rentEpoch,
    });
  };

  return Object.freeze({
    readRawAccount,
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
