# Deploy Guide - Remix, click by click

Four contracts, about 25 minutes. Do it on desktop with MetaMask installed. Gas should cost under a few dollars total at normal times.

## Before you start

1. MetaMask on **Ethereum Mainnet** (this dapp is mainnet-only).
2. Use your admin wallet (getyousome.eth, 0xF2aC...97BF). Check you have a little ETH for gas.
3. Keep the "Verify Contract on Explorers" toggle ON for every deploy - same as last time.
4. Honest status: the bundle engine is ported from the fork-tested V2 wrapper, but this exact file has not itself been fork-tested. Follow the tiny-first test below before putting anything valuable in a bundle.

## Deploy 1 - WiseMarketplace

1. Open https://app.remix.live
2. In the file explorer, create a new file: `WiseMarketplace.sol`. Copy the contents of `contracts/WiseMarketplace.sol` from this repo and paste it in.
3. Solidity Compiler tab: compiler `0.8.25` or newer, then **Compile**.
4. Deploy tab: environment **Injected Provider - MetaMask**. Confirm MetaMask shows Ethereum Mainnet.
5. The constructor asks for two addresses:
   - `wise_`: `0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6` (the WISE token)
   - `treasury_`: `0xA4452c06D9Fe04dD1cEe1f952DE85198d59BfB32` (the WSC treasury)
6. Click **Deploy**, confirm in MetaMask, and WAIT for the Activity check to turn green before touching anything (the double-click lesson from Bundle #0001).
7. Copy the deployed contract address.

**Note the sales gate:** the marketplace deploys with `salesOpen = false`. Listing and buying revert on-chain until you call `openSales()` (owner only) - that call happens the day the attorney reliance letter lands, not before. No config change needed.

## Deploy 2 - WisePositionNFT

1. New file `WisePositions.sol`, paste the contents of `contracts/WisePositions.sol`, compile, deploy. No constructor arguments.
2. Copy the deployed address.

## Deploy 3 - ComingSoon

1. New file `ComingSoon.sol`, paste the contents of `contracts/ComingSoon.sol`, compile, deploy. No constructor arguments.
2. Copy the deployed address. This one is the sell-intent registry behind the Coming Soon tab - no prices, no payment path, safe to open immediately.

## Deploy 4 - WiseBundleNFT (the bundle engine)

1. New file `WiseBundleNFT.sol`, paste the contents of `contracts/WiseBundleNFT.sol`, compile (0.8.25). One constructor argument:
   - `_treasury`: `0xA4452c06D9Fe04dD1cEe1f952DE85198d59BfB32`
2. Deploy, confirm, wait for the green check. Copy the address.
3. One setup step (only if you will bundle vault receipts): on the deployed contract's **Write Contract** page (Etherscan or Remix), connected as the owner, call `addVaultToken` twice:
   - `addVaultToken(0x7e1EFF4301defc24936470B30bd1c686D2a295dc, 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)` (wtnUSDC, USDC)
   - `addVaultToken(0x50bae2675A6D7D9CADf9e2Ec96c7e45897Be8603, 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)` (wsnUSDC, USDC)

What this contract is: a bundle takes CUSTODY of what you already hold - a Signature Stake card, an optional rider NFT (kitty, artist mint, any ERC-721), and/or vault receipts - and mints ONE receipt NFT as the title. The title holder scrapes yield; patron and WSC fee shares pay automatically. Selling the receipt on the marketplace moves the whole bundle atomically. Closing returns every component to your wallet and burns the receipt - the stake itself is untouched and keeps earning. The referrer you picked in the dapp is recorded on each bundle.

(The old wrapper at 0xD4007 is retired in place: untouched, unmentioned by this dapp, its three bundles keep scraping exactly as they always have.)

## Wire it up (2 minutes)

1. On GitHub, open this repo, then `js/config.js`, click the pencil icon.
2. Paste each address into its matching empty quotes: `MARKETPLACE`, `POSITION_NFT`, `COMING_SOON`, `BUNDLE_NFT`.
3. Commit (green button, commit to main).
4. Refresh the dapp - all four tabs come alive.

## Go live on dapp.wisestake.consulting

1. GitHub repo > Settings > Pages > Source: **Deploy from a branch** > Branch: `main` / root > Save.
2. At your domain registrar, add this DNS record (type CNAME):
   - Name/host: `dapp`
   - Value: `wisestakeconsulting.github.io`
3. Wait for DNS (minutes to a few hours). GitHub Pages will issue the HTTPS certificate automatically. Add `dapp.wisestake.consulting` under Settings > Pages > Custom domain, and tick "Enforce HTTPS".

## First test (tiny-first - do this before showing anyone)

1. Mint a throwaway NFT on the Mint tab (fee is small).
2. Signal it on the Coming Soon tab - confirm it appears in the directory, then withdraw the signal and confirm it disappears. This proves the registry loop end to end.
3. Bundles tab: flip the rail from wisestake.eth to wisestakes.eth and back - share link should follow.
4. Click "Open Wise One - this rail's door" on Denise's rail: the 10% referral bonus should show on arrival.
5. Marketplace tab: the gate status should read ON and the List/Buy buttons should be disabled. That is correct under the gate.
6. Bundle engine loop, with your SMALLEST stake card (nothing valuable yet):
   - Wrap it into a bundle (no rider). The card moves into custody and Bundle #1 appears on your tab.
   - Scrape 1 day. Check the split: 1% to treasury, patron share (0% = none), rest to you.
   - Close the bundle. The card must come back to your wallet, receipt burned.
   - Only after that loop is clean: try a wrap with a rider NFT, then a vault wrap with a small receipt amount.
7. Scrape-day note: the contract caps scrape days at what is actually available, so oversized requests pay what exists instead of reverting. If a scrape pays less than you expected, that is the cap working.

## After the attorney letter (later, not now)

1. From the deployer wallet, call `openSales()` on the marketplace contract.
2. List the throwaway NFT for 1 WISE from a personal wallet.
3. Buy it from Denise's wallet - this proves the whole atomic loop: list, pay in WISE, fee split to treasury, token moves.
4. Check the treasury received its 2%.
5. The real prize: list a bundle receipt. The buyer receives the whole bundle - stake, rider, vault - in one transaction.
