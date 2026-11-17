# Deploy Guide - Remix, click by click

Two contracts, about 10-15 minutes. Do it on desktop with MetaMask installed. Gas should cost under a few dollars total at normal times.

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

## Deploy 2 - WisePositionNFT

1. New file `WisePositions.sol`, paste the contents of `contracts/WisePositions.sol`, compile, deploy. No constructor arguments.
2. Copy the deployed address.

(Do NOT deploy WiseBundleNFT yet - same file, but we deploy it when the first bundle is ready to mint, so its numbering starts at #1 with a real bundle.)

## Wire it up (2 minutes)

1. On GitHub, open this repo, then `js/config.js`, click the pencil icon.
2. Paste each address into its matching empty quotes: `MARKETPLACE`, `POSITION_NFT`.
3. Commit (green button, commit to main).
4. Refresh the dapp - the Marketplace tab comes alive.

## Go live on dapp.wisestake.consulting

1. GitHub repo > Settings > Pages > Source: **Deploy from a branch** > Branch: `main` / root > Save.
2. At your domain registrar, add this DNS record (type CNAME):
   - Name/host: `dapp`
   - Value: `wisestakeconsulting.github.io`
3. Wait for DNS (minutes to a few hours). GitHub Pages will issue the HTTPS certificate automatically. Add `dapp.wisestake.consulting` under Settings > Pages > Custom domain, and tick "Enforce HTTPS".

## First test (do this before showing anyone)

1. Mint a throwaway NFT on the Mint tab (fee is small).
2. List it on the Marketplace tab for 1 WISE from your admin wallet.
3. Buy it from Denise's wallet - this proves the whole atomic loop: list, pay in WISE, fee split to treasury, token moves.
4. Check the treasury received its 2%.
