# The Wise Stake Dapp

One wallet. Everything as a token. Mint, hold yield-bearing positions, bundle them, trade them atomically.

- **Mint** - mint from your own wallet (Wise Stake Artist collection, live)
- **Positions** - your Signature Stakes and vault receipts, read live from chain
- **Bundles** - bundles born as NFTs (PPS-1, token form)
- **Marketplace** - atomic WISE sales, 2% treasury / 98% seller
- **Swap** - ETH to WISE, embedded Uniswap

## Status

Frontend live. Contracts (`contracts/`) ready for Remix deploy - see **DEPLOY.md**.
After deploying, paste the three addresses into `js/config.js` and commit.

## Honest limits (v0)

- Fork-tested, not audited. Start small.
- Position and Bundle minting is owner-only (white-glove) until the automated backing flow ships.
- Real marketplace sales are gated pending the attorney reliance letter.
- Vault deposits earn referral credit only when routed through Wise Soft first (engine limitation).
