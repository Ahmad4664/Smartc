// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ProjectToken
 * @dev توكن ERC20 للمشروع مع حماية متقدمة
 */
contract ProjectToken is ERC20, ERC20Burnable, Ownable {
    
    // الحد الأقصى للعرض الكلي
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18; // 1 مليار توكن
    
    // الحد الأقصى لعدد العناوين في Batch
    uint256 public constant MAX_BATCH_SIZE = 100;
    
    // الأحداث
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);

    constructor(
        string memory name,
        string memory symbol,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {}

    /**
     * @dev إنشاء توكن جديد (فقط المالك)
     * ✅ تحقق من zero address
     * ✅ تحقق من amount > 0
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(to != address(0), "Cannot mint to zero address");
        require(amount > 0, "Amount must be greater than 0");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev إنشاء كمية كبيرة لأنظمة المشروع
     * ✅ تحقق من zero address لكل مستلم
     * ✅ تحقق من amount > 0 لكل كمية
     * ✅ تحقق من حد Batch
     */
    function mintBatch(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(recipients.length == amounts.length, "Length mismatch");
        require(recipients.length > 0, "Empty batch");
        require(recipients.length <= MAX_BATCH_SIZE, "Batch too large");
        
        uint256 totalAmount;
        
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "Cannot mint to zero address");
            require(amounts[i] > 0, "Amount must be greater than 0");
            totalAmount += amounts[i];
        }
        
        require(totalSupply() + totalAmount <= MAX_SUPPLY, "Exceeds max supply");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
            emit TokensMinted(recipients[i], amounts[i]);
        }
    }

    /**
     * @dev حرق التوكن
     * ✅ تحقق من amount > 0
     */
    function burn(uint256 amount) public override {
        require(amount > 0, "Amount must be greater than 0");
        super.burn(amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @dev حرق توكنات من عنوان معين (بموافقته)
     * ✅ تحقق من amount > 0
     */
    function burnFrom(address account, uint256 amount) public override {
        require(amount > 0, "Amount must be greater than 0");
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }
}
