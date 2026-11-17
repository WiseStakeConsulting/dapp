# Deploy Guide - Remix, click by click

Three contracts, about 15 minutes. Do it on desktop with MetaMask installed. Gas should cost under a few dollars total at normal times.

## Before you start

1. MetaMask on **Ethereum Mainnet** (this dapp is mainnet-only).
2. Use your admin wallet (getyousome.eth, 0xF2aC...97BF). Check you have a little ETH for gas.
3. Keep the "Verify Contract on Explorers" toggle ON for every deploy - same as last time.

## Deploy 1 - WiseMarketplace

1. Open https://app.remix.live
2. In the file explorer, create a new file: `WiseMarketplace.sol`. Copy the contents of `contracts/WiseMarketplace.sol` from this repo and paste it in.
3. Solidity Compiler tab: compiler `0.8.24` or newer, then **Compile**.
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

(Do NOT deploy WiseBundleNFT yet - same file as WisePositions, but we deploy it when the first bundle is ready to mint, so its numbering starts at #1 with a real bundle.)

## Wire it up (2 minutes)

1. On GitHub, open this repo, then `js/config.js`, click the pencil icon.
2. Paste each address into its matching empty quotes: `MARKETPLACE`, `POSITION_NFT`, `COMING_SOON`.
3. Commit (green button, commit to main).
4. Refresh the dapp - the Marketplace and Coming Soon tabs come alive.

## Go live on dapp.wisestake.consulting

1. GitHub repo > Settings > Pages > Source: **Deploy from a branch** > Branch: `main` / root > Save.
2. At your domain registrar, add this DNS record (type CNAME):
   - Name/host: `dapp`
   - Value: `wisestakeconsulting.github.io`
3. Wait for DNS (minutes to a few hours). GitHub Pages will issue the HTTPS certificate automatically. Add `dapp.wisestake.consulting` under Settings > Pages > Custom domain, and tick "Enforce HTTPS".

## First test (under the sales gate - do this before showing anyone)

1. Mint a throwaway NFT on the Mint tab (fee is small).
2. Signal it on the Coming Soon tab - confirm it appears in the directory, then withdraw the signal and confirm it disappears. This proves the registry loop end to end.
3. Bundles tab: flip the rail from wisestake.eth to wisestakes.eth and back - share link should follow.
4. Click "Open Wise One - this rail's door" on Denise's rail: the 10% referral bonus should show on arrival.
5. Marketplace tab: the gate status should read ON and the List/Buy buttons should be disabled. That is correct under the gate.

## After the attorney letter (later, not now)

1. From the deployer wallet, call `openSales()` on the marketplace contract.
2. List the throwaway NFT for 1 WISE from a personal wallet.
3. Buy it from Denise's wallet - this proves the whole atomic loop: list, pay in WISE, fee split to treasury, token moves.
4. Check the treasury received its 2%.
