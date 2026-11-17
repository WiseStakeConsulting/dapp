// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title WiseMarketplace
/// @notice Atomic NFT sales priced in WISE. Seller approves the marketplace
///         and lists; buyer's one transaction pays the seller 98% and the
///         WSC treasury 2%, and moves the token. No handshakes, no custody.
contract WiseMarketplace is Ownable {
    IERC20 public immutable wise;
    address public treasury;
    uint16 public feeBps = 200; // 2% sale fee; cap 500 (5%)

    struct Listing { address seller; uint256 price; bool active; }
    mapping(address => mapping(uint256 => Listing)) public listings;

    event Listed(address indexed collection, uint256 indexed tokenId, address indexed seller, uint256 price);
    event Sold(address indexed collection, uint256 indexed tokenId, address indexed buyer, uint256 price);
    event Canceled(address indexed collection, uint256 indexed tokenId);
    event FeeChanged(uint16 bps);
    event TreasuryChanged(address treasury);

    constructor(address wise_, address treasury_) Ownable(msg.sender) {
        wise = IERC20(wise_);
        treasury = treasury_;
    }

    function list(address collection, uint256 tokenId, uint256 priceWise) external {
        require(priceWise > 0, "price 0");
        require(IERC721(collection).ownerOf(tokenId) == msg.sender, "not owner");
        require(IERC721(collection).isApprovedForAll(msg.sender, address(this)) ||
                IERC721(collection).getApproved(tokenId) == address(this), "not approved");
        listings[collection][tokenId] = Listing(msg.sender, priceWise, true);
        emit Listed(collection, tokenId, msg.sender, priceWise);
    }

    function cancel(address collection, uint256 tokenId) external {
        Listing storage l = listings[collection][tokenId];
        require(l.active && l.seller == msg.sender, "not lister");
        l.active = false;
        emit Canceled(collection, tokenId);
    }

    function buy(address collection, uint256 tokenId) external {
        Listing memory l = listings[collection][tokenId];
        require(l.active, "no listing");
        listings[collection][tokenId].active = false;

        uint256 fee = (l.price * feeBps) / 10000;
        uint256 payout = l.price - fee;

        require(wise.transferFrom(msg.sender, l.seller, payout), "wise pay failed");
        if (fee > 0) require(wise.transferFrom(msg.sender, treasury, fee), "fee failed");
        IERC721(collection).transferFrom(l.seller, msg.sender, tokenId);

        emit Sold(collection, tokenId, msg.sender, l.price);
    }

    // admin
    function setFeeBps(uint16 bps) external onlyOwner {
        require(bps <= 500, "cap 500");
        feeBps = bps;
        emit FeeChanged(bps);
    }

    function setTreasury(address t) external onlyOwner {
        require(t != address(0), "zero");
        treasury = t;
        emit TreasuryChanged(t);
    }
}
