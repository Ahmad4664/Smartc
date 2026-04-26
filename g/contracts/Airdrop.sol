// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract Airdrop is Ownable {
    
    IERC20 public token;
    bytes32 public merkleRoot;
    bool public isActive;
    mapping(address => bool) public hasClaimed;
    
    event MerkleRootUpdated(bytes32 newRoot);
    event TokensClaimed(address indexed user, uint256 amount);
    
    constructor(address _token, address initialOwner) Ownable(initialOwner) {
        token = IERC20(_token);
    }
    
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
        isActive = true;
        emit MerkleRootUpdated(_merkleRoot);
    }
    
    /**
     * @dev المطالبة بالإيردروب
     * ملاحظة: OpenZeppelin MerkleTree يستخدم keccak256 مزدوج
     */
    function claim(
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        require(isActive, "Airdrop not active");
        require(!hasClaimed[msg.sender], "Already claimed");
        
        // طريقة OpenZeppelin القياسية (double hash)
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        
        require(
            MerkleProof.verify(merkleProof, merkleRoot, leaf),
            "Invalid proof"
        );
        
        hasClaimed[msg.sender] = true;
        
        require(token.transfer(msg.sender, amount), "Transfer failed");
        
        emit TokensClaimed(msg.sender, amount);
    }
    
    function verifyClaim(
        address user,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external view returns (bool) {
        if (hasClaimed[user]) return false;
        
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(user, amount))));
        return MerkleProof.verify(merkleProof, merkleRoot, leaf);
    }
    
    function withdrawRemaining() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(owner(), balance), "Transfer failed");
    }
}
