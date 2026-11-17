// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title ComingSoon - a sell-intent registry.
/// @notice A holder signals that a token they own MIGHT be for sale someday.
///         There is no price field, no buy function, no payment path - this
///         contract cannot express an offer or execute a sale. It is a
///         directory of holders, nothing more. The marketplace (separate
///         contract) handles all actual sales behind its own legal gate.
contract ComingSoon {
    struct Signal {
        address holder;
        uint256 at;
        bool active;
    }

    address[] public collections;
    mapping(address => bool) public collectionKnown;
    mapping(address => mapping(uint256 => Signal)) public signals;
    mapping(address => uint256[]) private tokensSignaledList;

    event Signaled(address indexed collection, uint256 indexed tokenId, address indexed holder);
    event Withdrawn(address indexed collection, uint256 indexed tokenId);

    function signal(address collection, uint256 tokenId) external {
        require(IERC721(collection).ownerOf(tokenId) == msg.sender, "not owner");
        require(!signals[collection][tokenId].active, "already signaled");
        if (!collectionKnown[collection]) {
            collectionKnown[collection] = true;
            collections.push(collection);
        }
        signals[collection][tokenId] = Signal(msg.sender, block.timestamp, true);
        tokensSignaledList[collection].push(tokenId);
        emit Signaled(collection, tokenId, msg.sender);
    }

    function withdraw(address collection, uint256 tokenId) external {
        require(signals[collection][tokenId].holder == msg.sender, "not signaler");
        signals[collection][tokenId].active = false;
        emit Withdrawn(collection, tokenId);
    }

    // views for the directory UI
    function collectionCount() external view returns (uint256) {
        return collections.length;
    }

    function tokensSignaled(address collection) external view returns (uint256[] memory) {
        return tokensSignaledList[collection];
    }

    function isActive(address collection, uint256 tokenId) external view returns (bool) {
        return signals[collection][tokenId].active;
    }
}
