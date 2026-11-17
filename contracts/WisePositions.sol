// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WisePositionNFT
/// @notice Yield-bearing position receipts. Each token represents a live,
///         earning position: a WISE vault receipt (wtnUSDC / wsnUSDC) or a
///         Wise One Signature Stake. The position keeps earning while the
///         NFT is held, and the NFT is freely transferable - so the position
///         itself can move.
///         v0: minting is owner-only (white-glove verification that the
///         backing position is real and earmarked) until the automated
///         backing flow ships.
contract WisePositionNFT is ERC721, Ownable {
    enum Kind { VAULT, STAKE }

    struct Position {
        Kind kind;          // what earns the yield
        address underlying; // vault receipt or stake collection contract
        uint256 amount;     // backing amount at mint (display)
    }

    mapping(uint256 => Position) public positions;
    uint256 public nextId = 1;

    constructor() ERC721("Wise Stake Position", "WSP") Ownable(msg.sender) {}

    function mint(address to, Kind kind, address underlying, uint256 amount)
        external onlyOwner returns (uint256 id)
    {
        id = nextId++;
        positions[id] = Position(kind, underlying, amount);
        _safeMint(to, id);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string(abi.encodePacked(
            '{"name":"Wise Stake Position #',
            _toString(id),
            '","description":"A live, yield-bearing Wise Stake position. It earns daily while you hold it.","attributes":[{"trait_type":"Kind","value":"',
            positions[id].kind == Kind.VAULT ? "Vault" : "Stake",
            '"}]}'
        ));
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v; uint256 len;
        while (t != 0) { len++; t /= 10; }
        bytes memory b = new bytes(len);
        while (v != 0) { b[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }
}
