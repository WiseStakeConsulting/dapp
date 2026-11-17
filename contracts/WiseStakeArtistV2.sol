// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

// =====================================================================
// WiseStakeArtistV2 - the Wise Stake Artist mint, priced in WISE.
// Supersedes 0xEda93378F2d17747657d16B7EEB4bAf2E4a46a94 (ETH-priced,
// retired in place - untouched, unreferenced).
//
// The artist mints from THEIR OWN wallet (issuer-mints principle):
// provenance starts at the creator, always. The fee is taken in WISE
// and sent straight to the treasury - the contract never holds a
// balance. Price is owner-adjustable (setMintPrice); minting is
// closed while the price is 0.
//
// Gas note: Ethereum gas is always ETH. The $ price of the work is
// paid in WISE; the wallet still needs a little ETH for gas.
// =====================================================================

interface IWiseTokenMint {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract WiseStakeArtistV2 {
    // ---- minimal ERC-721 (same proven shape as the bundle receipt) ----

    string public constant name = "Wise Stake Artist";
    string public constant symbol = "WSA";

    uint256 public nextId = 1;
    mapping(uint256 => address) private tokenOwner;
    mapping(address => uint256) private balances;
    mapping(uint256 => address) private tokenApprovals;
    mapping(address => mapping(address => bool)) private operators;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed holder, address indexed spender, uint256 indexed tokenId);
    event ApprovalForAll(address indexed holder, address indexed operator, bool ok);

    function balanceOf(address o) external view returns (uint256) {
        require(o != address(0), "M01");
        return balances[o];
    }

    function ownerOf(uint256 id) public view returns (address) {
        address o = tokenOwner[id];
        require(o != address(0), "M02");
        return o;
    }

    function approve(address spender, uint256 id) external {
        address holder = ownerOf(id);
        require(msg.sender == holder || operators[holder][msg.sender], "M03");
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
        require(authorized, "M03");
        require(to != address(0), "M01");

        delete tokenApprovals[id];
        balances[from] -= 1;
        balances[to] += 1;
        tokenOwner[id] = to;
        emit Transfer(from, to, id);
    }

    // ---- mint ----

    address public owner;
    address public immutable treasury;
    IWiseTokenMint public immutable wise;

    uint256 public mintPrice; // in WISE wei; 0 = mints closed
    mapping(uint256 => string) public titles;

    event Minted(uint256 indexed id, address indexed artist, string title);
    event PriceChanged(uint256 price);

    modifier onlyOwner() {
        require(msg.sender == owner, "M04");
        _;
    }

    constructor(address _treasury, uint256 _initialPrice) {
        owner = msg.sender;
        treasury = _treasury;
        wise = IWiseTokenMint(0x66a0f676479Cee1d7373f3DC2e2952778BfF5bd6);
        mintPrice = _initialPrice;
        emit PriceChanged(_initialPrice);
    }

    function setMintPrice(uint256 p) external onlyOwner {
        mintPrice = p;
        emit PriceChanged(p);
    }

    /// Mint from the artist's own wallet. Approve this contract to spend
    /// WISE first; the fee goes straight to treasury in the same call.
    function mint(string calldata title) external returns (uint256 id) {
        require(mintPrice > 0, "M05 mints paused");
        require(bytes(title).length > 0 && bytes(title).length <= 64, "M06 bad title");
        require(_clean(title), "M06 bad chars");

        require(wise.transferFrom(msg.sender, treasury, mintPrice), "M07 WISE transfer failed");

        id = nextId;
        nextId = nextId + 1;
        tokenOwner[id] = msg.sender;
        balances[msg.sender] += 1;
        emit Transfer(address(0), msg.sender, id);

        titles[id] = title;
        emit Minted(id, msg.sender, title);
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        require(tokenOwner[id] != address(0), "M02");
        return string(
            abi.encodePacked(
                '{"name":"', titles[id],
                '","description":"An original work minted by its creator through the Wise Stake Artist studio. Provenance starts at the artist wallet.","external_url":"https://wisestake.consulting/mint/"}'
            )
        );
    }

    function _clean(string calldata s) internal pure returns (bool) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') return false;
        }
        return true;
    }
}
