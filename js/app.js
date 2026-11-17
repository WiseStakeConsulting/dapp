// Wise Stake dapp - everything as a token.
// ethers v5.7.2 (same proven stack as the website).

const A = CONFIG;
let provider, signer, account;

const ABI_MINT = ["function mint(string) payable returns (uint256)","function mintFee() view returns (uint256)"];
const ABI_721 = ["function balanceOf(address) view returns (uint256)","function tokenOfOwnerByIndex(address,uint256) view returns (uint256)","function walletOfOwner(address) view returns (uint256[])","function ownerOf(uint256) view returns (address)","function setApprovalForAll(address,bool)","function isApprovedForAll(address,address) view returns (bool)","function transferFrom(address,address,uint256)","function name() view returns (string)"];
const ABI_20 = ["function balanceOf(address) view returns (uint256)","function approve(address,uint256) returns (bool)","function allowance(address,address) view returns (uint256)","function decimals() view returns (uint8)","function symbol() view returns (string)"];
const ABI_MKT = ["function list(address,uint256,uint256)","function cancel(address,uint256)","function buy(address,uint256)","function listings(address,uint256) view returns (address,uint256,bool)","function feeBps() view returns (uint16)","function treasury() view returns (address)"];

const $ = id => document.getElementById(id);
const fmt = ethers.utils.formatEther;
const short = a => a ? a.slice(0,6) + "..." + a.slice(-4) : "";

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
  } catch (e) { console.error(e); }
}

// ---------- tabs ----------
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.remove("on"));
  b.classList.add("on");
  ["mint","positions","bundles","market","swap"].forEach(t =>
    $("tab-" + t).classList.toggle("hidden", t !== b.dataset.tab));
  if (b.dataset.tab === "swap" && !$("uniFrame").src) {
    const url = "https://app.uniswap.org/swap?outputCurrency=" + A.WISE + "&theme=dark";
    $("uniFrame").src = url; $("uniLink").href = url;
  }
  if (b.dataset.tab === "positions" && account) loadPositions();
});

// ---------- USD ticker ----------
(async () => {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + A.COINGECKO_ID + "&vs_currencies=usd");
    const j = await r.json();
    const p = j[A.COINGECKO_ID] && j[A.COINGECKO_ID].usd;
    if (p) $("priceTag").innerHTML = "WISE <b>$" + p.toLocaleString(undefined,{maximumFractionDigits:2}) + "</b>";
  } catch (e) {}
})();

// ---------- referral rail ----------
// The rail is the referrer of record on stakes and bundles created here.
// A rail owner shares their own front door: dapp URL + ?rail=<ens-or-address>
// presets it for the visitor, so her people route to her without anyone
// changing code. The choice persists in this browser.
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

// ---------- mint ----------
async function loadFee() {
  if (!A.WSA_MINT) return;
  try {
    const c = new ethers.Contract(A.WSA_MINT, ABI_MINT, provider);
    const fee = await c.mintFee();
    $("feeDisplay").textContent = fmt(fee) + " ETH";
    $("mintBtn").disabled = false;
  } catch (e) { $("feeDisplay").textContent = "read error"; }
}

async function doMint() {
  if (!signer) return alert("Connect your wallet first.");
  const title = $("mintTitle").value.trim() || "Untitled";
  const s = $("mintStatus"); s.className = "status wait"; s.textContent = "Preparing...";
  try {
    const c = new ethers.Contract(A.WSA_MINT, ABI_MINT, signer);
    const fee = await c.mintFee();
    s.textContent = "Confirm in your wallet...";
    const tx = await c.mint(title, { value: fee });
    s.textContent = "Minting... tx " + tx.hash;
    await tx.wait();
    s.className = "status ok";
    s.innerHTML = "Minted. View: <a style='color:var(--ok)' target='_blank' href='https://etherscan.io/tx/" + tx.hash + "'>" + tx.hash + "</a>";
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
  if (!g.children.length) g.innerHTML = "<p class='note'>No yield positions found in this wallet yet. Start a stake through Wise Soft (rail: " + rail.label + ") or fund a vault, then refresh.</p>";
}

// ---------- marketplace ----------
function mktReady() { return !!A.MARKETPLACE; }

function mktInit() {
  if (mktReady()) { $("mktGate").classList.add("hidden"); $("mktApp").classList.remove("hidden"); }
}
mktInit();

async function doApprove() {
  if (!signer) return alert("Connect your wallet first.");
  const s = $("listStatus"); s.className = "status wait"; s.textContent = "Approving collection for the marketplace...";
  try {
    const c = new ethers.Contract($("listToken").value.trim(), ABI_721, signer);
    const tx = await c.setApprovalForAll(A.MARKETPLACE, true);
    await tx.wait(); s.className = "status ok"; s.textContent = "Approved. Now set your price and List.";
  } catch (e) { s.className = "status err"; s.textContent = "Approve failed: " + e.message.slice(0,120); }
}

async function doList() {
  if (!signer) return alert("Connect your wallet first.");
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
