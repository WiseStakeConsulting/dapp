// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =====================================================================
// WiseBundleNFT - the Wise Stake dapp bundle engine.
// Ported from PBS1WrapperV2 (fork-tested Nov 2026, 12/12 + 9/9 vault
// tests) with the dapp decisions applied:
//   - CUSTODY: the bundle holds the actual assets. A Signature Stake
//     card (and optional rider NFT) or vault receipts are pulled into
//     this contract at creation. Transferring the receipt transfers
//     the whole bundle - atomic sales just work on the marketplace.
//   - SCRAPING: stake yield via SignatureStakes.scrapeInterest, vault
//     yield via claimInterest; split fee/patron/holder in one call.
//   - STRIPPED vs V2: no renewal escrow/pot, no categories/plates,
//     no fresh-stake minting (stakes are created in Wise One through
//     a referral rail door), no modes. Old wrapper stays untouched.
//   - ADDED: rider/membership NFT slot (kitties, artist mints) from
//     the V0 wrapper, referrer record, optional per-bundle art URI,
//     closeBundle = full undo (returns every component, burns the
//     receipt).
// Revert codes P01-P34, same spirit as the V2/V3 lineage.
// Fork-tested lineage; NOT itself fork-tested. First live test:
// tiny stake card, 1-day scrape, close - before any valuable asset.
// =====================================================================

interface IWiseToken {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IWiseCore {
    function currentWiseDay() external view returns (uint64);
    function checkStakeByID(address staker, bytes16 stakeID)
        external
        view
        returns (
            uint256 startDay,
            uint256 lockDays,
            uint256 finalDay,
            uint256 closeDay,
            uint256 scrapeDay,
            uint256 stakedAmount,
            uint256 stakesShares,
            uint256 rewardAmount,
            uint256 penaltyAmount,
            bool isActive,
            bool isMature
        );
}

interface IWiseStakingNFT {
    function scrapeInterest(uint256 tokenId, uint64 scrapeDays) external returns (uint256);
    function NFTStake(uint256 tokenId) external view returns (bytes16);
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
}

/// Minimal interface for Wise RWA vault receipt tokens (e.g. wtnUSDC):
/// standard ERC-20 plus the vault's claim/compound surface.
interface IERC20Vault {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function claimInterest() external;
    function compoundInterest() external;
}

contract WiseBundleNFT {
    // ------------------------------------------------------------------
    // Roles / admin
    // ------------------------------------------------------------------

    address public owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "P01");
        _;
    }

    uint256 private locked;
    modifier guard() {
        require(locked == 0, "P27");
        locked = 1;
        _;
        locked = 0;
    }

    // ------------------------------------------------------------------
    // Receipt NFT (minimal ERC-721). tokenId == bundleId.
    // ------------------------------------------------------------------

    string public constant name = "Wise Stake Bundle";
    string public constant symbol = "WSB";

    uint256 public nextId = 1;
    mapping(uint256 => address) private tokenOwner;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private tokenApprovals;
    mapping(address => mapping(address => bool)) private operators;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed holder, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed holder, address indexed operator, bool ok);

    function balanceOf(address o) external view returns (uint256) {
        require(o != address(0), "P02");
        return balances[o];
    }

    function ownerOf(uint256 id) public view returns (address) {
        address o = tokenOwner[id];
        require(o != address(0), "P03");
        return o;
    }

    function approve(address spender, uint256 id) external {
        address holder = ownerOf(id);
        require(msg.sender == holder || operators[holder][msg.sender], "P04");
        tokenApprovals[id] = spender;
        emit Approval(holder, spender, id);
    }

    function setApprovalForAll(address op, bool ok) external {
        operators[msg.sender][op] = ok;
        emit ApprovalForAll(msg.sender, op, ok);
    }

    function transferFrom(address from, address to, uint256 id) public {
        address holder = ownerOf(id);
        bool authorized =
            msg.sender == holder ||
            tokenApprovals[id] == msg.sender ||
            operators[holder][msg.sender];
        require(authorized, "P04");
        require(to != address(0), "P02");

        delete tokenApprovals[id];
        balances[from] -= 1;
        balances[to] += 1;
        tokenOwner[id] = to;
        emit Transfer(from, to, id);
    }

    function _mintReceipt(address to) internal returns (uint256 id) {
        id = nextId;
        nextId = nextId + 1;
        tokenOwner[id] = to;
        balances[to] += 1;
        emit Transfer(address(0), to, id);
    }

    function _burnReceipt(uint256 id) internal {
        address holder = ownerOf(id);
        balances[holder] -= 1;
        delete tokenOwner[id];
        delete tokenApprovals[id];
        emit Transfer(holder, address(0), id);
    }

    // ------------------------------------------------------------------
    // Bundle state
    // ------------------------------------------------------------------

    struct Bundle {
        uint256 cardId;       // Signature Stakes tokenId; 0 = vault-only bundle
        address membership;   // rider ERC-721 collection (kitty, artist mint); address(0) = none
        uint256 membershipId; // rider tokenId
        address vaultToken;   // ERC-20 vault receipt; address(0) = none
        uint256 vaultAmount;  // receipt amount in custody
        address patron;       // yield beneficiary (address(0) = all yield to holder)
        uint16 patronBps;     // patron share of post-fee scraped yield
        address referrer;     // referral rail of record (credit flows at stake creation)
        string label;         // plain name, no quotes/backslashes
        bool active;
    }

    mapping(uint256 => Bundle) public bundles;
    mapping(uint256 => string) public artURI; // optional art, set by receipt holder

    IWiseToken public immutable wise;
    IWiseCore public immutable wiseCore;
    IWiseStakingNFT public immutable card;
    address public immutable treasury;

    uint16 public feeBps = 100; // 1% of scraped yield
    uint16 public constant FEE_CAP_BPS = 500;
    uint16 public constant PATRON_CAP_BPS = 5000; // 50%, matching the old wrapper's 50/50

    mapping(address => bool) public isVaultToken;
    mapping(address => address) public vaultUnderlying; // vault receipt => deposit asset (e.g. USDC)

    modifier active(uint256 id) {
        require(bundles[id].active, "P26");
        _;
    }

    event BundleCreated(uint256 indexed id, address indexed creator, uint256 cardId, address membership, uint256 membershipId, address patron, uint16 patronBps, address referrer, string label);
    event VaultWrapped(uint256 indexed id, address vaultToken, uint256 amount, address referrer, string label);
    event VaultAttached(uint256 indexed id, address vaultToken, uint256 amount);
    event Scraped(uint256 indexed id, uint256 amount, address indexed caller);
    event VaultScraped(uint256 indexed id, uint256 interest, uint256 fee, uint256 patronAmt, uint256 ownerPart);
    event VaultCompounded(uint256 indexed id, uint256 added);
    event Closed(uint256 indexed id, address indexed recipient);
    event ArtSet(uint256 indexed id, string uri);
    event FeeChanged(uint16 bps);
    event VaultTokenAllowed(address indexed vaultToken, address indexed underlying);

    constructor(address _treasury) {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        wise = IWiseToken(0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6);
        card = IWiseStakingNFT(0x48791DbDFB38bAA58e48329148C321bF33B3c1e1);
        wiseCore = IWiseCore(0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6);
        treasury = _treasury;
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "P02");
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    function setFeeBps(uint16 bps) external onlyOwner {
        require(bps <= FEE_CAP_BPS, "P28");
        feeBps = bps;
        emit FeeChanged(bps);
    }

    function addVaultToken(address vaultToken, address underlying) external onlyOwner {
        require(vaultToken != address(0) && underlying != address(0), "P02");
        isVaultToken[vaultToken] = true;
        vaultUnderlying[vaultToken] = underlying;
        emit VaultTokenAllowed(vaultToken, underlying);
    }

    // ------------------------------------------------------------------
    // Creation - wrap EXISTING positions (self-custody first, always)
    // ------------------------------------------------------------------

    /// Bundle a Signature Stake card you own, with an optional rider NFT.
    /// Approve this contract for the card (and the rider collection) first.
    /// The card and rider move into custody here; the receipt is the title.
    function wrapCard(
        uint256 cardId,
        address membership,
        uint256 membershipId,
        address patron,
        uint16 patronBps,
        address referrer,
        string calldata label
    ) external guard returns (uint256 id) {
        require(patronBps <= PATRON_CAP_BPS, "P09");
        require(bytes(label).length <= 64, "P14");
        require(_cleanLabel(label), "P15");
        require(card.ownerOf(cardId) == msg.sender, "P04");

        (, , bool isActiveW, ) = _stakeState(cardId);
        require(isActiveW, "P19");

        card.transferFrom(msg.sender, address(this), cardId);
        require(card.ownerOf(cardId) == address(this), "P22");

        if (membership != address(0)) {
            IERC721Minimal(membership).transferFrom(msg.sender, address(this), membershipId);
            require(IERC721Minimal(membership).ownerOf(membershipId) == address(this), "P22");
        }

        id = _mintReceipt(msg.sender);
        Bundle storage b = bundles[id];
        b.cardId = cardId;
        b.membership = membership;
        b.membershipId = membershipId;
        b.patron = patron;
        b.patronBps = patronBps;
        b.referrer = referrer;
        b.label = label;
        b.active = true;
        emit BundleCreated(id, msg.sender, cardId, membership, membershipId, patron, patronBps, referrer, label);
    }

    /// Bundle vault receipts you already hold (wtnUSDC / wsnUSDC).
    function wrapVault(
        address vaultToken,
        uint256 receiptAmount,
        address patron,
        uint16 patronBps,
        address referrer,
        string calldata label
    ) external guard returns (uint256 id) {
        require(isVaultToken[vaultToken], "P29");
        require(receiptAmount > 0, "P33");
        require(patronBps <= PATRON_CAP_BPS, "P09");
        require(bytes(label).length <= 64, "P14");
        require(_cleanLabel(label), "P15");

        IERC20Vault(vaultToken).transferFrom(msg.sender, address(this), receiptAmount);

        id = _mintReceipt(msg.sender);
        Bundle storage b = bundles[id];
        b.cardId = 0;
        b.vaultToken = vaultToken;
        b.vaultAmount = receiptAmount;
        b.patron = patron;
        b.patronBps = patronBps;
        b.referrer = referrer;
        b.label = label;
        b.active = true;
        emit VaultWrapped(id, vaultToken, receiptAmount, referrer, label);
    }

    /// Attach a vault position to an existing card bundle (the "both" combo).
    function attachVault(uint256 id, address vaultToken, uint256 receiptAmount)
        external
        active(id)
        guard
    {
        require(ownerOf(id) == msg.sender, "P04");
        require(isVaultToken[vaultToken], "P29");
        require(receiptAmount > 0, "P33");
        require(bundles[id].vaultToken == address(0), "P30");

        IERC20Vault(vaultToken).transferFrom(msg.sender, address(this), receiptAmount);
        bundles[id].vaultToken = vaultToken;
        bundles[id].vaultAmount = receiptAmount;
        emit VaultAttached(id, vaultToken, receiptAmount);
    }

    // ------------------------------------------------------------------
    // Scraping - receipt holder (or approved) pre-maturity, anyone
    // post-maturity. The caller receives nothing; the split pays every
    // party inside the call.
    // ------------------------------------------------------------------

    /// Scrape stake yield. scrapeDays is capped at the available range
    /// (see _capScrapeDays) so oversized requests pay what exists instead
    /// of hitting the core's assert.
    function scrape(uint256 id, uint64 scrapeDays) external active(id) guard returns (uint256 amount) {
        Bundle storage b = bundles[id];
        require(b.cardId != 0, "P31");

        (, , bool isActiveS, bool isMatureS) = _stakeState(b.cardId);
        require(isActiveS, "P19");

        if (!isMatureS) {
            address holder = ownerOf(id);
            bool authorized =
                msg.sender == holder ||
                tokenApprovals[id] == msg.sender ||
                operators[holder][msg.sender];
            require(authorized, "P32");
        }

        scrapeDays = _capScrapeDays(b.cardId, scrapeDays);
        require(scrapeDays > 0, "P16");

        amount = card.scrapeInterest(b.cardId, scrapeDays);
        require(amount > 0, "P16");

        _distribute(id, amount);
        emit Scraped(id, amount, msg.sender);
    }

    /// Scrape vault interest, split in the deposit asset (e.g. USDC).
    function scrapeVault(uint256 id) external active(id) guard {
        address v = bundles[id].vaultToken;
        require(v != address(0), "P31");
        Bundle storage b = bundles[id];
        require(b.patron == msg.sender || ownerOf(id) == msg.sender, "P32");

        IERC20Vault asset = IERC20Vault(vaultUnderlying[v]);
        uint256 beforeAsset = asset.balanceOf(address(this));
        IERC20Vault(v).claimInterest(); // vault pays the holder (this contract) in the deposit asset
        uint256 interest = asset.balanceOf(address(this)) - beforeAsset;
        require(interest > 0, "P16");

        uint256 fee = (interest * feeBps) / 10000;
        if (fee > 0) {
            require(asset.transfer(treasury, fee), "P05");
        }
        uint256 afterFee = interest - fee;
        uint256 patronAmt = (afterFee * b.patronBps) / 10000;
        if (patronAmt > 0 && b.patron != address(0)) {
            require(asset.transfer(b.patron, patronAmt), "P05");
        }
        uint256 ownerPart = afterFee - patronAmt;
        if (ownerPart > 0) {
            require(asset.transfer(ownerOf(id), ownerPart), "P05");
        }
        emit VaultScraped(id, interest, fee, patronAmt, ownerPart);
    }

    /// Convert accrued vault interest into more receipt principal.
    function compoundVault(uint256 id) external active(id) guard {
        address v = bundles[id].vaultToken;
        require(v != address(0), "P31");
        IERC20Vault(v).compoundInterest();
        uint256 nowBal = IERC20Vault(v).balanceOf(address(this));
        if (nowBal > bundles[id].vaultAmount) {
            uint256 added = nowBal - bundles[id].vaultAmount;
            bundles[id].vaultAmount = nowBal;
            emit VaultCompounded(id, added);
        }
    }

    function _distribute(uint256 id, uint256 amount) internal {
        Bundle storage b = bundles[id];

        uint256 fee = (amount * feeBps) / 10000;
        if (fee > 0) {
            require(wise.transfer(treasury, fee), "P05");
        }

        uint256 afterFee = amount - fee;
        uint256 patronAmt = (afterFee * b.patronBps) / 10000;
        if (patronAmt > 0 && b.patron != address(0)) {
            require(wise.transfer(b.patron, patronAmt), "P05");
        }

        uint256 holderPart = afterFee - patronAmt;
        if (holderPart > 0) {
            require(wise.transfer(ownerOf(id), holderPart), "P05");
        }
    }

    // ------------------------------------------------------------------
    // Close - the full undo. Returns every component to the receipt
    // holder and burns the receipt. The stake itself is untouched: the
    // card goes back to your wallet still earning; scrape post-maturity
    // interest before closing, then burn the card in Wise One for principal.
    // ------------------------------------------------------------------

    function closeBundle(uint256 id) external active(id) guard {
        address recipient = ownerOf(id);
        bool authorized =
            msg.sender == recipient ||
            tokenApprovals[id] == msg.sender ||
            operators[recipient][msg.sender];
        require(authorized, "P04");

        Bundle storage b = bundles[id];
        b.active = false;
        _burnReceipt(id);

        if (b.cardId != 0) {
            // CK-style collections clear approvals on transfer and their
            // transferFrom has no owner exemption - self-approve first
            // (try/catch: standard collections need nothing).
            (bool okA, ) = address(card).call(
                abi.encodeWithSignature("approve(address,uint256)", address(this), b.cardId)
            );
            okA;
            card.transferFrom(address(this), recipient, b.cardId);
            require(card.ownerOf(b.cardId) == recipient, "P22");
        }
        if (b.membership != address(0)) {
            (bool okB, ) = b.membership.call(
                abi.encodeWithSignature("approve(address,uint256)", address(this), b.membershipId)
            );
            okB;
            IERC721Minimal(b.membership).transferFrom(address(this), recipient, b.membershipId);
            require(IERC721Minimal(b.membership).ownerOf(b.membershipId) == recipient, "P22");
        }
        if (b.vaultToken != address(0) && b.vaultAmount > 0) {
            require(IERC20Vault(b.vaultToken).transfer(recipient, b.vaultAmount), "P05");
        }
        emit Closed(id, recipient);
    }

    // ------------------------------------------------------------------
    // Art + metadata
    // ------------------------------------------------------------------

    /// Optional art for this bundle's receipt - any URL (pin an image,
    /// or host it in the dapp repo's /art/ folder). Holder-set.
    function setArt(uint256 id, string calldata uri) external {
        require(ownerOf(id) == msg.sender, "P04");
        require(bytes(uri).length <= 256, "P15");
        artURI[id] = uri;
        emit ArtSet(id, uri);
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        require(tokenOwner[id] != address(0), "P03");
        Bundle storage b = bundles[id];
        string memory art = artURI[id];
        if (bytes(art).length > 0) {
            return string(
                abi.encodePacked(
                    '{"name":"Wise Stake Bundle #', _toString(id), ' - ', b.label,
                    '","description":"A Wise Stake bundle: value backed by value. Yield flows to the holder and the patron of record.","image":"', art, '"}'
                )
            );
        }
        return string(
            abi.encodePacked(
                '{"name":"Wise Stake Bundle #', _toString(id), ' - ', b.label,
                '","description":"A Wise Stake bundle: value backed by value. Yield flows to the holder and the patron of record."}'
            )
        );
    }

    // Views for the UI, split to stay stack-safe.
    function bundleInfo(uint256 id)
        external
        view
        returns (
            uint256 cardId,
            address membership,
            uint256 membershipId,
            address vaultToken,
            uint256 vaultAmount,
            address patron,
            uint16 patronBps,
            bool activeNow
        )
    {
        Bundle storage b = bundles[id];
        return (b.cardId, b.membership, b.membershipId, b.vaultToken, b.vaultAmount, b.patron, b.patronBps, b.active);
    }

    function bundleMeta(uint256 id)
        external
        view
        returns (address referrer, string memory label, string memory art)
    {
        Bundle storage b = bundles[id];
        return (b.referrer, b.label, artURI[id]);
    }

    // ------------------------------------------------------------------
    // Stake state + scrape-day cap (ported verbatim from V2 - the cap
    // keeps oversized requests away from the core's assert)
    // ------------------------------------------------------------------

    function _stakeState(uint256 cardId)
        internal
        view
        returns (uint256 stakedAmount, uint256 rewardAmount, bool isActive, bool isMature)
    {
        bytes16 stakeId = card.NFTStake(cardId);
        (, , , , , stakedAmount, , rewardAmount, , isActive, isMature) =
            wiseCore.checkStakeByID(address(card), stakeId);
    }

    function _capScrapeDays(uint256 cardId, uint64 scrapeDays) internal view returns (uint64) {
        bytes16 sid = card.NFTStake(cardId);
        (uint256 startDay, , , , uint256 sDay, , , , , , ) =
            wiseCore.checkStakeByID(address(card), sid);
        uint256 pointer = sDay > 0 ? sDay : startDay;
        uint256 c = wiseCore.currentWiseDay();
        if (c <= pointer) return 0;
        uint256 maxDays = c - pointer;
        if (scrapeDays <= maxDays) return scrapeDays;
        return uint64(maxDays);
    }

    function _cleanLabel(string calldata label) internal pure returns (bool) {
        bytes memory b = bytes(label);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') return false;
        }
        return true;
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 len;
        while (t != 0) {
            len++;
            t /= 10;
        }
        bytes memory buf = new bytes(len);
        while (v != 0) {
            buf[--len] = bytes1(uint8(48 + v % 10));
            v /= 10;
        }
        return string(buf);
    }
}
