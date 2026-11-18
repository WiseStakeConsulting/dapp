// Wise Stake dapp - everything as a token.
// ethers v5.7.2 (same proven stack as the website).

const A = CONFIG;
let provider, signer, account;
let lastWiseUsd = 0; // live USD price from DexScreener (for the fee display)

// Public read nodes - let the page read contract state BEFORE any wallet
// connects. Tested Nov 18: all three answer eth_call without an API key.
const READ_RPCS = ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://eth-mainnet.public.blastapi.io"];
let readProvider = null;
function bootRead() {
  if (readProvider) return readProvider;
  readProvider = new ethers.providers.JsonRpcProvider(READ_RPCS[0]);
  return readProvider;
}

const ABI_MINT = ["function mint(string) returns (uint256)","function mintPrice() view returns (uint256)","function owner() view returns (address)"];
const ABI_721 = ["function balanceOf(address) view returns (uint256)","function tokenOfOwnerByIndex(address,uint256) view returns (uint256)","function walletOfOwner(address) view returns (uint256[])","function ownerOf(uint256) view returns (address)","function setApprovalForAll(address,bool)","function isApprovedForAll(address,address) view returns (bool)","function transferFrom(address,address,uint256)","function name() view returns (string)"];
const ABI_20 = ["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)","function allowance(address,address) view returns (uint256)","function decimals() view returns (uint8)","function symbol() view returns (string)"];
const ABI_MKT = ["function list(address,uint256,uint256)","function cancel(address,uint256)","function buy(address,uint256)","function listings(address,uint256) view returns (address,uint256,bool)","function feeBps() view returns (uint16)","function treasury() view returns (address)","function salesOpen() view returns (bool)"];
const ABI_SOON = ["function signal(address,uint256)","function withdraw(address,uint256)","function collectionCount() view returns (uint256)","function tokensSignaled(address) view returns (uint256[])","function isActive(address,uint256) view returns (bool)","function signals(address,uint256) view returns (address,uint256,bool)"];
const ABI_BUNDLE = ["function wrapCard(uint256,address,uint256,address,uint16,address,string) returns (uint256)","function wrapVault(address,uint256,address,uint16,address,string) returns (uint256)","function attachVault(uint256,address,uint256)","function scrape(uint256,uint64)","function scrapeVault(uint256)","function compoundVault(uint256)","function closeBundle(uint256)","function setArt(uint256,string)","function bundleInfo(uint256) view returns (uint256,address,uint256,address,uint256,address,uint16,bool)","function bundleMeta(uint256) view returns (address,string,string)","function balanceOf(address) view returns (uint256)","function ownerOf(uint256) view returns (address)","function setApprovalForAll(address,bool)","function isApprovedForAll(address,address) view returns (bool)","function feeBps() view returns (uint16)","function nextId() view returns (uint256)"];

const $ = id => document.getElementById(id);
const fmt = ethers.utils.formatEther;
const short = a => a ? a.slice(0,6) + "..." + a.slice(-4) : "";
const ZERO = ethers.constants.AddressZero;
const isWscWallet = a => a && A.WSC_WALLETS.some(w => w.toLowerCase() === a.toLowerCase());

// ---------- wallet ----------
async function connect() {
  if (!window.ethereum) { $("walletBtn").textContent = "Install MetaMask"; return; }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
    account = await signer.getAddress();
    const net = await provider.getNetwork();
    if (net.chainId !== A.CHAIN_ID) {
      $("walletBtn").textContent = "Wrong network - switch to Ethereum";
      alert("Please switch MetaMask to Ethereum Mainnet.");
      return;
    }
    $("walletBtn").textContent = short(account);
    loadPositions();
    loadFee();
    checkMarketGate();
    loadDirectory();
    loadBundles();
    loadBundleForm();
  } catch (e) { console.error(e); }
}

// ---------- tabs ----------
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  ["mint","positions","bundles","directory","market","swap"].forEach(t =>
    $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
  if (b.dataset.tab === "swap" && !$("dexFrame").src) {
    // DexScreener allows embedding; load the WISE pair chart on first open
    $("dexFrame").src = "https://dexscreener.com/ethereum/" + A.WISE + "?embed=1&theme=dark";
  }
  if (b.dataset.tab === "positions" && account) loadPositions();
  if (b.dataset.tab === "directory" && provider) loadDirectory();
  if (b.dataset.tab === "bundles" && provider) { loadBundles(); loadBundleForm(); }
});

// ---------- swap (Uniswap blocks iframes - open in own tab, pre-filled) ----------
$("uniSwapBtn").addEventListener("click", () =>
  window.open("https://app.uniswap.org/swap?outputCurrency=" + A.WISE, "_blank", "noopener"));
$("uniSwapEthBtn").addEventListener("click", () =>
  window.open("https://app.uniswap.org/swap", "_blank", "noopener"));

// ---------- USD ticker (DexScreener - live Uniswap pair) ----------
(async () => {
  try {
    const r = await fetch(A.DEXSCREENER + A.WISE);
    const j = await r.json();
    const pair = (j.pairs || []).find(p => p.chainId === "ethereum" && p.dexId === "uniswap");
    if (pair && pair.priceUsd) {
      lastWiseUsd = parseFloat(pair.priceUsd);
      $("priceTag").innerHTML = "WISE <b>$" + lastWiseUsd.toLocaleString(undefined,{maximumFractionDigits:4}) + "</b>";
      loadFee(); // refresh the mint fee display with a live USD hint
    }
  } catch (e) {}
})();

// ---------- referral rail ----------
let rail = { address: "", label: "", custom: false };

function railMatch(v) {
  v = (v || "").trim().toLowerCase();
  if (!v) return -1;
  return A.RAILS.findIndex(r => r.address.toLowerCase() === v || r.label.toLowerCase().split(" ")[0] === v);
}

function initRail() {
  const q = new URLSearchParams(location.search).get("rail");
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("ws_rail")); } catch (e) {}
  const i = railMatch(q);
  if (i >= 0) {
    rail = { address: A.RAILS[i].address, label: A.RAILS[i].label.split(" ")[0], custom: false };
  } else if (saved && saved.address) {
    rail = saved;
  } else {
    rail = { address: A.RAILS[0].address, label: A.RAILS[0].label.split(" ")[0], custom: false };
  }
}

function renderRail() {
  const sel = $("railSel");
  sel.innerHTML = "";
  A.RAILS.forEach((r, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = r.label;
    sel.appendChild(o);
  });
  const oc = document.createElement("option");
  oc.value = "custom";
  oc.textContent = "Custom - address or ENS";
  sel.appendChild(oc);

  if (rail.custom) {
    sel.value = "custom";
    $("railCustom").classList.remove("hidden");
    $("railCustomVal").value = rail.label.endsWith(".eth") ? rail.label : rail.address;
  } else {
    const i = A.RAILS.findIndex(r => r.address.toLowerCase() === rail.address.toLowerCase());
    sel.value = String(Math.max(i, 0));
    $("railCustom").classList.add("hidden");
  }
  const share = location.origin + location.pathname + "?rail=" + (rail.custom ? rail.address : rail.label);
  $("railLink").textContent = share;
  $("railLink").href = share;
}

function railDoor() {
  if (!rail.custom) {
    const r = A.RAILS.find(x => x.address.toLowerCase() === rail.address.toLowerCase());
    if (r && r.url) return r.url;
  }
  return A.STAKE_BASE;
}

async function saveRail() {
  const sel = $("railSel");
  const s = $("railStatus");
  if (sel.value === "custom") {
    let v = $("railCustomVal").value.trim();
    if (!v) { s.className = "status err"; s.textContent = "Enter an address or ENS first."; return; }
    try {
      if (v.endsWith(".eth") && provider) { const a = await provider.resolveName(v); if (a) v = a; }
    } catch (e) {}
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) { s.className = "status err"; s.textContent = "That is not a valid address or ENS."; return; }
    rail = { address: v, label: $("railCustomVal").value.trim(), custom: true };
  } else {
    const r = A.RAILS[Number(sel.value)];
    rail = { address: r.address, label: r.label.split(" ")[0], custom: false };
  }
  localStorage.setItem("ws_rail", JSON.stringify(rail));
  renderRail();
  s.className = "status ok";
  s.textContent = "Rail set: " + rail.label + (rail.custom ? " (custom)" : "");
}

// ---------- mint (priced in WISE) ----------
function mintReady() { return !!A.WSA_MINT; }

function usdHint(wiseAmount) {
  if (!lastWiseUsd) return "";
  const u = parseFloat(wiseAmount) * lastWiseUsd;
  // whole dollars at gift-card scale, cents only when small
  return " (~$" + (u >= 10 ? Math.round(u) : u.toFixed(2)) + ")";
}

function feeText(p) {
  const wise = fmt(p);
  $("feeDisplay").textContent = wise + " WISE" + usdHint(wise);
  $("mintApproveBtn").disabled = false;
  $("mintBtn").disabled = false;
}

async function loadFee() {
  if (!mintReady()) { $("feeDisplay").textContent = "deploys with the batch"; return; }
  try {
    const c = new ethers.Contract(A.WSA_MINT, ABI_MINT, bootRead());
    const p = await c.mintPrice();
    if (p.isZero()) { $("feeDisplay").textContent = "mints paused"; return; }
    feeText(p);
  } catch (e) {
    // try the fallback nodes before showing an error
    for (const rpc of READ_RPCS.slice(1)) {
      try {
        const c = new ethers.Contract(A.WSA_MINT, ABI_MINT, new ethers.providers.JsonRpcProvider(rpc));
        const p = await c.mintPrice();
        if (p.isZero()) { $("feeDisplay").textContent = "mints paused"; return; }
        feeText(p);
        return;
      } catch (err) { continue; }
    }
    $("feeDisplay").textContent = "read error";
  }
}

async function bMintApprove() {
  if (!signer) return alert("Connect your wallet first.");
  if (!mintReady()) return alert("Mint contract not deployed yet (DEPLOY.md).");
  const s = $("mintStatus"); s.className = "status wait"; s.textContent = "Approving WISE for the mint...";
  try {
    const c = new ethers.Contract(A.WISE, ABI_20, signer);
    const tx = await c.approve(A.WSA_MINT, ethers.constants.MaxUint256);
    await tx.wait();
    s.className = "status ok"; s.textContent = "WISE approved. Now Mint My Work.";
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0, 120); }
}

async function doMint() {
  if (!signer) return alert("Connect your wallet first.");
  if (!mintReady()) return alert("Mint contract not deployed yet (DEPLOY.md).");
  const title = $("mintTitle").value.trim() || "Untitled";
  const s = $("mintStatus"); s.className = "status wait"; s.textContent = "Preparing...";
  try {
    const c = new ethers.Contract(A.WSA_MINT, ABI_MINT, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.mint(title);
    s.textContent = "Minting... tx " + tx.hash;
    await tx.wait();
    s.className = "status ok";
    s.innerHTML = "Minted. Your work is on-chain from your own wallet. View: <a style='color:var(--ok)' target='_blank' href='https://etherscan.io/tx/" + tx.hash + "'>" + tx.hash + "</a>";
  } catch (e) { s.className = "status err"; s.textContent = "Mint failed: " + (e.data ? e.data.message : e.message); }
}

// ---------- positions ----------
async function loadPositions() {
  const g = $("posGrid"); g.innerHTML = "";
  const add = (title, sub, tag) => {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = "<h4>" + title + "</h4><p class='sub'>" + sub + "</p>" + (tag ? "<span class='tag'>" + tag + "</span>" : "");
    g.appendChild(d);
  };
  try {
    const sig = new ethers.Contract(A.SIG_STAKES, ABI_721, provider);
    let ids = [];
    try { ids = await sig.walletOfOwner(account); }
    catch (e) {
      const n = (await sig.balanceOf(account)).toNumber();
      for (let i = 0; i < Math.min(n, 50); i++) ids.push(await sig.tokenOfOwnerByIndex(account, i));
    }
    ids.forEach(id => add("Signature Stake #" + id.toString(), "Wise One - transferable, earns daily interest", "YIELD"));
  } catch (e) { add("Signature Stakes", "Could not read: " + e.message.slice(0,80), ""); }
  for (const v of A.VAULTS) {
    try {
      const c = new ethers.Contract(v.address, ABI_20, provider);
      const bal = await c.balanceOf(account);
      if (bal.gt(0)) add(v.name, "Holdings: " + fmt(bal) + " receipts - a live USDC-backed position", "YIELD");
    } catch (e) {}
  }
  if (!g.children.length) g.innerHTML = "<p class='note'>No Signature Stakes or vault receipts found in this wallet. Starting a stake? Use the Bundles tab pre-flight and turn ON transferable - only Signature Stakes can be bundled or sold here.</p>";
}

// ---------- bundle engine ----------
// The bundle takes CUSTODY of what you already hold (stake card, optional
// rider NFT, vault receipts) and mints ONE receipt NFT as the title. The
// receipt holder scrapes yield - patron share paid automatically. Selling
// or moving the receipt moves the whole bundle, atomically. Closing
// returns every component and burns the receipt. The referrer recorded
// on the bundle is the rail picked above.
function bundleReady() { return !!A.BUNDLE_NFT; }

async function loadBundles() {
  const g = $("bundleGrid");
  if (!bundleReady()) {
    g.innerHTML = "<p class='note'>The bundle engine is not deployed yet - see DEPLOY.md. When it is, your bundles appear here: create, scrape, compound, close - all from this page.</p>";
    return;
  }
  if (!provider || !account) { g.innerHTML = "<p class='note'>Connect your wallet to read your bundles.</p>"; return; }
  g.innerHTML = "";
  const b = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, provider);
  const n = (await b.nextId()).toNumber();
  const fee = await b.feeBps();
  let count = 0;
  for (let i = 1; i < n; i++) {
    let holder; try { holder = await b.ownerOf(i); } catch (e) { continue; }
    if (holder.toLowerCase() !== account.toLowerCase()) continue;
    count++;
    const info = await b.bundleInfo(i);
    const meta = await b.bundleMeta(i);
    const parts = [];
    if (info[0].gt(0)) parts.push("Signature Stake card #" + info[0].toString());
    if (info[1] !== ZERO) parts.push("Rider NFT #" + info[2].toString() + " (" + short(info[1]) + ")");
    if (info[3] !== ZERO) parts.push(fmt(info[4]) + " vault receipts (" + short(info[3]) + ")");
    const patronTxt = info[5] === ZERO ? "none - all yield to holder" : short(info[5]) + " at " + (info[6] / 100) + "%";
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = "<h4>Bundle #" + i + (meta[1] ? " - " + meta[1] : "") + "</h4>" +
      "<p class='sub'>" + parts.join(" + ") + "</p>" +
      "<p class='sub'>Patron: " + patronTxt +
      (meta[0] !== ZERO ? " &middot; Referrer: " + short(meta[0]) : "") +
      " &middot; WSC scrape fee: " + (fee / 100) + "%</p>" +
      (meta[2] ? "<img src='" + meta[2] + "' alt='bundle art' style='max-width:100%;border-radius:8px;margin-top:8px'>" : "") +
      "<span class='tag'>ACTIVE</span><br>" +
      (info[0].gt(0) ? "<button class='ghost' onclick=\"doScrape(" + i + ")\">Scrape stake</button> " : "") +
      (info[3] !== ZERO ? "<button class='ghost' onclick=\"doScrapeVault(" + i + ")\">Scrape vault</button> <button class='ghost' onclick=\"doCompoundVault(" + i + ")\">Compound vault</button> " : "") +
      "<button class='ghost' onclick=\"doCloseBundle(" + i + ")\">Close bundle</button>" +
      "<input type='text' id='art" + i + "' placeholder='Art URL (optional)' style='margin-top:8px'>" +
      "<button class='ghost' onclick=\"doSetArt(" + i + ")\">Set art</button>" +
      "<div class='status' id='bstat" + i + "'></div>";
    g.appendChild(d);
  }
  if (!count) g.innerHTML = "<p class='note'>No bundles yet. Create one below - your positions move into the bundle's custody and the receipt NFT becomes the title. Close it any time to get every piece back.</p>";
}

async function loadBundleForm() {
  if (!provider || !account) return;
  const sel = $("cbCard"); sel.innerHTML = "";
  try {
    const sig = new ethers.Contract(A.SIG_STAKES, ABI_721, provider);
    const ids = await sig.walletOfOwner(account);
    ids.forEach(id => {
      const o = document.createElement("option");
      o.value = id.toString();
      o.textContent = "Card #" + id.toString();
      sel.appendChild(o);
    });
  } catch (e) {}
  if (!sel.children.length) sel.innerHTML = "<option value=''>No Signature Stakes in this wallet</option>";
  const vsel = $("wvVault"); vsel.innerHTML = "";
  A.VAULTS.forEach(v => {
    const o = document.createElement("option");
    o.value = v.address; o.textContent = v.name;
    vsel.appendChild(o);
  });
}

async function bApproveCard() {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("cbStatus"); s.className = "status wait"; s.textContent = "Approving Signature Stakes for the bundle engine...";
  try {
    const c = new ethers.Contract(A.SIG_STAKES, ABI_721, signer);
    const tx = await c.setApprovalForAll(A.BUNDLE_NFT, true);
    await tx.wait(); s.className = "status ok"; s.textContent = "Card approved. Rider next (if any), then Wrap."
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0, 120); }
}

async function bApproveRider() {
  if (!signer) return alert("Connect your wallet first.");
  const col = $("cbRider").value.trim();
  if (!col) { alert("Enter the rider collection address first (or leave the rider out)."); return; }
  const s = $("cbStatus"); s.className = "status wait"; s.textContent = "Approving rider collection...";
  try {
    const c = new ethers.Contract(col, ABI_721, signer);
    const tx = await c.setApprovalForAll(A.BUNDLE_NFT, true);
    await tx.wait(); s.className = "status ok"; s.textContent = "Rider approved. Now Wrap."
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0, 120); }
}

async function bWrapCard() {
  if (!signer) return alert("Connect your wallet first.");
  if (!bundleReady()) return alert("Bundle engine not deployed yet (DEPLOY.md).");
  const s = $("cbStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    const cardId = $("cbCard").value.trim();
    if (!cardId) { s.className = "status err"; s.textContent = "No stake card selected."; return; }
    const rider = $("cbRider").value.trim();
    const riderId = $("cbRiderId").value.trim() || "0";
    let patron = $("cbPatron").value.trim();
    if (patron.endsWith(".eth") && provider) { const r = await provider.resolveName(patron); if (r) patron = r; }
    const bps = $("cbBps").value;
    const label = $("cbLabel").value.trim() || "My bundle";
    s.textContent = "Confirm in your wallet...";
    const tx = await c.wrapCard(cardId, rider || ZERO, riderId, patron || ZERO, bps, rail.address, label);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Bundle created. Your card (and rider) are in custody; the receipt NFT is the title.";
    loadBundles();
  } catch (e) { s.className = "status err"; s.textContent = "Wrap failed: " + e.message.slice(0, 120); }
}

async function bApproveVault() {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("wvStatus"); s.className = "status wait"; s.textContent = "Approving vault receipts...";
  try {
    const c = new ethers.Contract($("wvVault").value, ABI_20, signer);
    const tx = await c.approve(A.BUNDLE_NFT, ethers.constants.MaxUint256);
    await tx.wait(); s.className = "status ok"; s.textContent = "Vault receipts approved. Now Wrap."
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0, 120); }
}

async function bWrapVault() {
  if (!signer) return alert("Connect your wallet first.");
  if (!bundleReady()) return alert("Bundle engine not deployed yet (DEPLOY.md).");
  const s = $("wvStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    const amount = $("wvAmount").value.trim();
    if (!amount || Number(amount) <= 0) { s.className = "status err"; s.textContent = "Enter a receipt amount."; return; }
    let patron = $("wvPatron").value.trim();
    if (patron.endsWith(".eth") && provider) { const r = await provider.resolveName(patron); if (r) patron = r; }
    const label = $("wvLabel").value.trim() || "My vault bundle";
    s.textContent = "Confirm in your wallet...";
    const tx = await c.wrapVault($("wvVault").value, amount, patron || ZERO, $("wvBps").value, rail.address, label);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Vault bundle created. The receipts are in custody; the receipt NFT is the title.";
    loadBundles();
  } catch (e) { s.className = "status err"; s.textContent = "Wrap failed: " + e.message.slice(0, 120); }
}

async function doScrape(id) {
  if (!signer) return alert("Connect your wallet first.");
  const days = prompt("Days of yield to scrape (capped automatically at what's available):", "1");
  if (!days) return;
  const s = $("bstat" + id); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.scrape(id, days);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Scraped. Split paid: patron share + holder share, WSC fee off the top.";
  } catch (e) { s.className = "status err"; s.textContent = "Scrape failed: " + e.message.slice(0, 120); }
}

async function doScrapeVault(id) {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("bstat" + id); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.scrapeVault(id);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Vault interest claimed and split (paid in the deposit asset, e.g. USDC).";
  } catch (e) { s.className = "status err"; s.textContent = "Vault scrape failed: " + e.message.slice(0, 120); }
}

async function doCompoundVault(id) {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("bstat" + id); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.compoundVault(id);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Compounded - accrued interest converted into more receipt principal.";
    loadBundles();
  } catch (e) { s.className = "status err"; s.textContent = "Compound failed: " + e.message.slice(0, 120); }
}

async function doCloseBundle(id) {
  if (!signer) return alert("Connect your wallet first.");
  if (!confirm("Close Bundle #" + id + "? Every component (stake card, rider, vault receipts) returns to your wallet and the receipt NFT is burned. The stake itself is untouched - it keeps earning in your wallet.")) return;
  const s = $("bstat" + id); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.closeBundle(id);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Bundle closed. Components returned, receipt burned.";
    loadBundles();
  } catch (e) { s.className = "status err"; s.textContent = "Close failed: " + e.message.slice(0, 120); }
}

async function doSetArt(id) {
  if (!signer) return alert("Connect your wallet first.");
  const uri = $("art" + id).value.trim();
  if (!uri) { alert("Paste an art URL first (pin an image, or host it in the dapp repo's /art/ folder)."); return; }
  const s = $("bstat" + id); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.BUNDLE_NFT, ABI_BUNDLE, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.setArt(id, uri);
    await tx.wait();
    s.className = "status ok"; s.textContent = "Art set - it now shows on the bundle and in its metadata.";
    loadBundles();
  } catch (e) { s.className = "status err"; s.textContent = "Set art failed: " + e.message.slice(0, 120); }
}

// ---------- directory (Coming Soon) ----------
// A holder can signal a token they own MIGHT be for sale someday. The
// ComingSoon contract has no price field and no payment path - it cannot
// express an offer. Copy stays descriptive; no promises of any kind.
function dirCollections() {
  return [
    A.SIG_STAKES && { name: "Signature Stakes", address: A.SIG_STAKES },
    A.POSITION_NFT && { name: "Wise Positions", address: A.POSITION_NFT },
    A.BUNDLE_NFT && { name: "Wise Bundles", address: A.BUNDLE_NFT },
    A.WSA_MINT && { name: "Wise Stake Artist", address: A.WSA_MINT }
  ].filter(Boolean);
}

async function loadDirectory() {
  const g = $("dirGrid");
  if (!A.COMING_SOON) {
    g.innerHTML = "<p class='note'>The Coming Soon registry is not deployed yet - see DEPLOY.md. It is a separate, tiny contract: a sell-intent registry with no price field and no payment path.</p>";
    return;
  }
  g.innerHTML = "";
  let found = 0;
  const soon = new ethers.Contract(A.COMING_SOON, ABI_SOON, provider);
  for (const col of dirCollections()) {
    let ids = [];
    try { ids = await soon.tokensSignaled(col.address); } catch (e) { continue; }
    for (const id of ids) {
      const tid = id.toString();
      let active, holder;
      try {
        active = await soon.isActive(col.address, id);
        holder = (await soon.signals(col.address, id))[0];
      } catch (e) { continue; }
      if (!active) continue;
      found++;
      const d = document.createElement("div"); d.className = "card";
      d.innerHTML = "<h4>" + col.name + " #" + tid + "</h4>" +
        "<p class='sub'>Held by " + short(holder) + " - holder signaled interest in selling. " +
        "No price, no promise - purchases open after legal review.</p>" +
        "<span class='tag'>COMING SOON</span> " +
        "<a target='_blank' rel='noopener' style='font-family:Helvetica,Arial,sans-serif;font-size:.75rem;color:var(--gold2)' href='https://etherscan.io/token/" + col.address + "?a=" + tid + "'>Etherscan</a>";
      g.appendChild(d);
    }
  }
  if (!found) g.innerHTML = "<p class='note'>No signals yet. If you hold a token and might sell it someday, signal it below - one transaction, no price, no commitment.</p>";
}

async function doSignal() {
  if (!signer) return alert("Connect your wallet first.");
  if (!A.COMING_SOON) return alert("Coming Soon registry not deployed yet (DEPLOY.md).");
  const s = $("dirStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.COMING_SOON, ABI_SOON, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.signal($("dirToken").value.trim(), $("dirId").value.trim());
    await tx.wait();
    s.className = "status ok"; s.textContent = "Signal posted. It appears in the directory - withdraw it any time.";
    loadDirectory();
  } catch (e) { s.className = "status err"; s.textContent = "Signal failed (must own the token): " + e.message.slice(0,110); }
}

async function doWithdrawSignal() {
  if (!signer) return alert("Connect your wallet first.");
  if (!A.COMING_SOON) return alert("Coming Soon registry not deployed yet (DEPLOY.md).");
  const s = $("dirStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.COMING_SOON, ABI_SOON, signer);
    s.textContent = "Confirm in your wallet...";
    const tx = await c.withdraw($("dirToken").value.trim(), $("dirId").value.trim());
    await tx.wait();
    s.className = "status ok"; s.textContent = "Signal withdrawn.";
    loadDirectory();
  } catch (e) { s.className = "status err"; s.textContent = "Withdraw failed (must be your signal): " + e.message.slice(0,110); }
}

// ---------- marketplace ----------
function mktReady() { return !!A.MARKETPLACE; }

function mktInit() {
  if (mktReady()) { $("mktGate").classList.add("hidden"); $("mktApp").classList.remove("hidden"); }
}
mktInit();

// Sales gate: read salesOpen from the contract. OFF = no list, no buy, on-chain.
async function checkMarketGate() {
  if (!mktReady()) return;
  const p = provider || bootRead();
  try {
    const c = new ethers.Contract(A.MARKETPLACE, ABI_MKT, p);
    const open = await c.salesOpen();
    const g = $("gateStatus");
    if (open) {
      g.className = "status ok";
      g.textContent = "Sales open - the attorney gate has been lifted.";
      ["listBtn","buyBtn"].forEach(id => $(id).disabled = false);
    } else {
      g.className = "status err";
      g.textContent = "Sales gate is ON: buying and listing are disabled on-chain until the attorney reliance letter. Browsing is open.";
      ["listBtn","buyBtn"].forEach(id => $(id).disabled = true);
    }
  } catch (e) { console.error(e); }
}

// WSC wallet warning: WSC inventory never lists before the letter.
function wscListGuard() {
  if (isWscWallet(account)) {
    $("wscWarn").classList.remove("hidden");
    return confirm("This wallet is on the WSC wallets list. WSC inventory sales stay closed until the attorney reliance letter. Continue anyway?");
  }
  $("wscWarn").classList.add("hidden");
  return true;
}

async function doApprove() {
  if (!signer) return alert("Connect your wallet first.");
  if (!wscListGuard()) return;
  const s = $("listStatus"); s.className = "status wait"; s.textContent = "Approving collection for the marketplace...";
  try {
    const c = new ethers.Contract($("listToken").value.trim(), ABI_721, signer);
    const tx = await c.setApprovalForAll(A.MARKETPLACE, true);
    await tx.wait(); s.className = "status ok"; s.textContent = "Approved. Now set your price and List.";
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0,120); }
}

async function doList() {
  if (!signer) return alert("Connect your wallet first.");
  if (!wscListGuard()) return;
  const s = $("listStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.MARKETPLACE, ABI_MKT, signer);
    const price = ethers.utils.parseEther($("listPrice").value.trim());
    s.textContent = "Confirm in your wallet...";
    const tx = await c.list($("listToken").value.trim(), $("listId").value.trim(), price);
    await tx.wait(); s.className = "status ok"; s.textContent = "Listed for " + $("listPrice").value + " WISE.";
  } catch (e) { s.className = "status err"; s.textContent = "List failed: " + e.message.slice(0,120); }
}

async function doApproveWise() {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("buyStatus"); s.className = "status wait"; s.textContent = "Approving WISE...";
  try {
    const c = new ethers.Contract(A.WISE, ABI_20, signer);
    const tx = await c.approve(A.MARKETPLACE, ethers.constants.MaxUint256);
    await tx.wait(); s.className = "status ok"; s.textContent = "WISE approved. Buy when ready.";
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0,120); }
}

async function doBuy() {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("buyStatus"); s.className = "status wait";
  try {
    const c = new ethers.Contract(A.MARKETPLACE, ABI_MKT, signer);
    const [seller, price, active] = await c.listings($("buyToken").value.trim(), $("buyId").value.trim());
    if (!active) { s.className = "status err"; s.textContent = "No active listing for that item."; return; }
    s.textContent = "Buying for " + fmt(price) + " WISE - confirm in your wallet...";
    const tx = await c.buy($("buyToken").value.trim(), $("buyId").value.trim());
    await tx.wait(); s.className = "status ok"; s.textContent = "Bought. The token is yours - atomically.";
  } catch (e) { s.className = "status err"; s.textContent = "Buy failed: " + e.message.slice(0,120); }
}

// ---------- boot ----------
initRail();
renderRail();
$("railSel").addEventListener("change", () => {
  $("railCustom").classList.toggle("hidden", $("railSel").value !== "custom");
});
$("railSave").addEventListener("click", saveRail);
$("railStakeBtn").addEventListener("click", () => window.open(railDoor(), "_blank", "noopener"));
loadFee();       // fee reads through public nodes - no wallet needed
checkMarketGate(); // gate status also reads before connect
