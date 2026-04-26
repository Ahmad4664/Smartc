// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vesting is Ownable, ReentrancyGuard {
    
    IERC20 public token;
    
    uint256 public constant CLIFF = 30 days;
    uint256 public constant VESTING_DURATION = 90 days;
    
    struct VestingSchedule {
        uint256 totalAmount;
        uint256 releasedAmount;
        uint256 startTime;
        bool initialized;
    }
    
    mapping(address => VestingSchedule) public vestingSchedules;
    uint256 public totalVested;
    
    event VestingCreated(address indexed beneficiary, uint256 amount);
    event TokensReleased(address indexed beneficiary, uint256 amount);
    
    constructor(address _token, address initialOwner) Ownable(initialOwner) {
        token = IERC20(_token);
    }
    
    function createVesting(
        address beneficiary,
        uint256 amount
    ) external onlyOwner {
        require(!vestingSchedules[beneficiary].initialized, "Already exists");
        require(amount > 0, "Amount must be > 0");
        
        require(
            token.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        
        uint256 immediateRelease = amount / 4;
        uint256 vestedAmount = amount - immediateRelease;
        
        vestingSchedules[beneficiary] = VestingSchedule({
            totalAmount: vestedAmount,
            releasedAmount: 0,
            startTime: block.timestamp,
            initialized: true
        });
        
        totalVested += vestedAmount;
        
        require(token.transfer(beneficiary, immediateRelease), "Immediate transfer failed");
        
        emit VestingCreated(beneficiary, amount);
    }
    
    function releasableAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        if (!schedule.initialized) return 0;
        
        uint256 elapsed = block.timestamp - schedule.startTime;
        
        if (elapsed >= VESTING_DURATION) {
            return schedule.totalAmount - schedule.releasedAmount;
        }
        
        uint256 vested = (schedule.totalAmount * elapsed) / VESTING_DURATION;
        return vested - schedule.releasedAmount;
    }
    
    function release() external nonReentrant {
        VestingSchedule storage schedule = vestingSchedules[msg.sender];
        
        require(schedule.initialized, "No vesting found");
        
        uint256 amount = releasableAmount(msg.sender);
        require(amount > 0, "No tokens to release");
        
        schedule.releasedAmount += amount;
        totalVested -= amount;
        
        require(token.transfer(msg.sender, amount), "Transfer failed");
        
        emit TokensReleased(msg.sender, amount);
    }
    
    function getVestingInfo(address beneficiary) external view returns (
        uint256 total,
        uint256 released,
        uint256 releasable,
        uint256 nextRelease
    ) {
        VestingSchedule storage schedule = vestingSchedules[beneficiary];
        
        if (!schedule.initialized) return (0, 0, 0, 0);
        
        total = schedule.totalAmount;
        released = schedule.releasedAmount;
        releasable = releasableAmount(beneficiary);
        
        uint256 elapsed = block.timestamp - schedule.startTime;
        if (elapsed >= VESTING_DURATION) {
            nextRelease = 0;
        } else {
            nextRelease = schedule.startTime + CLIFF * ((elapsed / CLIFF) + 1);
        }
    }
}
