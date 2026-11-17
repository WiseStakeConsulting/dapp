// Wise Stake dapp configuration.
// Addresses verified on-chain Nov 2025-2026. Fill the EMPTY strings after
// deploying the contracts (see DEPLOY.md), commit, done.

const CONFIG = {
  CHAIN_ID: 1, // Ethereum mainnet only

  // WISE token + staking engine (same contract)
  WISE: "0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6",

  // Signature Stakes collection - transferable stake NFTs. A stake is a
  // Signature Stake only when "I prefer this stake to be transferable" is
  // turned ON at creation (Wise One UI, off by default).
  SIG_STAKES: "0x48791DbDFB38bAA58e48329148C321bF33B3c1e1",

  // Vault receipts (yield-bearing ERC-20 positions) + their deposit asset
  VAULTS: [
    { name: "wtnUSDC - World Mobile Nodes (USDC)", address: "0x7e1EFF4301defc24936470B30bd1c686D2a295dc", underlying: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { name: "wsnUSDC - Sovren (USDC)", address: "0x50bae2675A6D7D9CADf9e2Ec96c7e45897Be8603", underlying: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }
  ],

  // The artist mint collection (live, ETH fee)
  WSA_MINT: "0x0E3A2A1f2146d86A604adc220b4967A898D7FE07",

  // WSC treasury - receives marketplace and scrape fees. Baked into the
  // contracts at deploy; kept here for display and reference.
  TREASURY: "0xA4452c06D9Fe04dD1cEe1f952DE85198d59BfB32",

  // WSC-owned wallets. The offeror line: listings from these wallets are
  // WSC inventory sales and stay closed until the attorney reliance letter.
  // The UI warns when a connected wallet appears here. Personal wallets
  // never go in this list - see the wallet schedule (LLC records).
  WSC_WALLETS: [
    "0xA4452c06D9Fe04dD1cEe1f952DE85198d59BfB32" // treasury
  ],

  // Referral rails - whose name is on the teaching. Stakes are created in
  // Wise One through the rail's referral door; the door link carries the
  // referral credit, so visitors leave Wise One's team referral address
  // field BLANK. The rail also becomes the referrer of record on bundles
  // created through the dapp.
  // Rail owners share ?rail=<ens-or-address> on the dapp URL.
  // REMINDER (WISE rules): a referrer earns only after Critical Mass -
  // $10,000 USD of referred stakes, valued at each stake's creation day.
  // Stakes referred before reaching $10k never earn retroactively.
  RAILS: [
    { label: "wisestake.eth (English rail)", address: "0x142A534C60e16695cfE2aBab86f8DEcb85d568c0", url: "https://pro.wise.one/r/wisestake.eth" },
    { label: "wisestakes.eth (Denise's rail)", address: "0x84EBf885B2655e8be3D3492ca81DFaCad04B5e7f", url: "https://pro.wise.one/r/wisestakes.eth" }
  ],
  STAKE_BASE: "https://pro.wise.one/", // custom rails ride the generic door; credit comes from the dapp rail pick

  // FILL AFTER DEPLOY (DEPLOY.md walks through it):
  COMING_SOON: "",  // ComingSoon - sell-intent registry, no prices, no offers
  POSITION_NFT: "", // WisePositionNFT - yield-bearing position receipts
  BUNDLE_NFT: "",   // WiseBundleNFT - custody bundle engine, receipt = title, scrape + close
  MARKETPLACE: "",  // WiseMarketplace - atomic WISE sales, 2% to treasury, salesOpen gate OFF at deploy

  // USD ticker
  COINGECKO_ID: "wise-token"
};
