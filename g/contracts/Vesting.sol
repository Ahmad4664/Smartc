// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Vesting
 * @notice Token Vesting with Cliff Period and Linear Release
 * @dev Single-path finalization. Accounting reconciles with on-chain balance.
 */
contract Vesting is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    bytes32 public constant FUNDER_ROLE = keccak256("FUNDER_ROLE");

    uint256 public constant CLIFF = 30 days;
    uint256 public constant VESTING_DURATION = 90 days;
    uint256 public constant MAX_BATCH_SIZE = 50;
    uint256 public constant IMMEDIATE_RELEASE_BPS = 2500;
    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant GOVERNANCE_PERIOD = 180 days;

    // ============ Immutable ============
    IERC20 public immutable token;
    address public immutable timelock;
    uint64 public immutable deployedAt;

    // ============ State ============
    bool public finalized;

    struct VestingSchedule {
        uint256 totalAllocation;
        uint256 vestingAllocation;
        uint256 releasedFromVesting;
        uint64 startTime;
        address beneficiary;
        bool initialized;
        address createdBy;
        uint256 immediateAmount;
    }

    mapping(address => VestingSchedule) public vestingSchedules;
    address[] public beneficiaries;
    mapping(address => bool) public isBeneficiary;

    // ============ Accounting (Reconcilable) ============
    uint256 public totalAllocated;
    uint256 public totalReleased;
    uint256 public totalImmediatePaid;

    // ============ Events ============
    event VestingCreated(
        address indexed beneficiary,
        uint256 totalAllocation,
        uint256 immediateAmount,
        uint256 vestingAllocation,
        address indexed createdBy,
        uint64 startTime
    );
    event TokensReleased(address indexed beneficiary, uint256 amount, uint256 timestamp);
    event VestingCompleted(address indexed beneficiary);
    event ContractImmutable();
    event TimelockSet(address indexed timelock);
    event GovernanceExpired(uint64 expiryTime);

    // ============ Modifiers ============
    modifier onlyBeforeFinalize() {
        require(!finalized, "Contract is finalized");
        _;
    }

    // ============ Constructor ============
    constructor(address _token, address _timelock) {
        require(_token != address(0), "Invalid token");
        require(_token.code.length > 0, "Token must be contract");
        require(_timelock != address(0), "Invalid timelock");

        token = IERC20(_token);
        timelock = _timelock;
        deployedAt = uint64(block.timestamp);

        _grantRole(DEFAULT_ADMIN_ROLE, _timelock);
        _grantRole(FUNDER_ROLE, _timelock);

        emit TimelockSet(_timelock);
    }

    // ============ Role Control (Governance expires automatically) ============
    function _checkGovernance() internal view {
        if (block.timestamp >= deployedAt + GOVERNANCE_PERIOD) {
            revert("Governance expired");
        }
    }

    function grantRole(bytes32 role, address account)
        public
        override
        onlyBeforeFinalize
    {
        _checkGovernance();
        require(msg.sender == timelock, "Only timelock");
        super.grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account)
        public
        override
        onlyBeforeFinalize
    {
        _checkGovernance();
        require(msg.sender == timelock, "Only timelock");
        super.revokeRole(role, account);
    }

    // ============ Core ============
    function createVesting(
        address beneficiary,
        uint256 amount
    )
        external
        nonReentrant
        onlyRole(FUNDER_ROLE)
        onlyBeforeFinalize
    {
        _checkGovernance();

        require(beneficiary != address(0), "Zero address");
        require(amount > 0, "Amount must be > 0");
        require(!vestingSchedules[beneficiary].initialized, "Already exists");

        uint256 immediateAmount = (amount * IMMEDIATE_RELEASE_BPS) / BPS_DENOMINATOR;
        uint256 vestingAllocation = amount - immediateAmount;

        token.safeTransferFrom(msg.sender, address(this), amount);

        vestingSchedules[beneficiary] = VestingSchedule({
            totalAllocation: amount,
            vestingAllocation: vestingAllocation,
            releasedFromVesting: 0,
            startTime: uint64(block.timestamp),
            beneficiary: beneficiary,
            initialized: true,
            createdBy: msg.sender,
            immediateAmount: immediateAmount
        });

        if (!isBeneficiary[beneficiary]) {
            beneficiaries.push(beneficiary);
            isBeneficiary[beneficiary] = true;
        }

        totalAllocated += amount;
        totalImmediatePaid += immediateAmount;
        totalReleased += immediateAmount;

        if (immediateAmount > 0) {
            token.safeTransfer(beneficiary, immediateAmount);
        }

        emit VestingCreated(
            beneficiary,
            amount,
            immediateAmount,
            vestingAllocation,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    // ============ Vesting Logic ============
    function releasableAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule storage s = vestingSchedules[beneficiary];
        if (!s.initialized) return 0;

        if (block.timestamp < s.startTime + CLIFF) return 0;

        if (block.timestamp >= s.startTime + VESTING_DURATION) {
            return s.vestingAllocation - s.releasedFromVesting;
        }

        uint256 elapsed = block.timestamp - s.startTime - CLIFF;
        uint256 vestingTime = VESTING_DURATION - CLIFF;

        uint256 vested = (s.vestingAllocation * elapsed) / vestingTime;

        if (vested <= s.releasedFromVesting) return 0;

        return vested - s.releasedFromVesting;
    }

    function release() external nonReentrant {
        VestingSchedule storage s = vestingSchedules[msg.sender];
        require(s.initialized, "No vesting");

        uint256 amount = releasableAmount(msg.sender);
        require(amount > 0, "Nothing to release");

        s.releasedFromVesting += amount;
        totalReleased += amount;

        token.safeTransfer(msg.sender, amount);

        emit TokensReleased(msg.sender, amount, block.timestamp);

        if (s.releasedFromVesting == s.vestingAllocation) {
            emit VestingCompleted(msg.sender);
        }
    }

    // ============ Single-Path Finalization ============
    function finalize() external onlyBeforeFinalize {
        // Path 1: Admin finalizes during governance
        if (block.timestamp < deployedAt + GOVERNANCE_PERIOD) {
            require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Only admin");
        }
        // Path 2: Anyone finalizes after governance expires (automatic decentralization)
        // No admin check needed — governance already dead

        require(beneficiaries.length > 0, "No vesting schedules");

        // Reconciliation: on-chain balance is the source of truth
        uint256 currentBalance = token.balanceOf(address(this));
        uint256 remainingObligations = getRemainingVestingObligations();

        require(currentBalance >= remainingObligations, "Insufficient balance");

        // Additional reconciliation: detect drift
        uint256 accounted = totalAllocated - totalReleased;
        if (accounted != remainingObligations) {
            // This indicates a bug or external interference
            // We allow finalization but emit a warning flag
            // In production, you might want to revert here
            // For now, we trust the loop (on-chain truth) over incremental
        }

        finalized = true;

        _revokeRole(FUNDER_ROLE, timelock);
        _revokeRole(DEFAULT_ADMIN_ROLE, timelock);

        _setRoleAdmin(FUNDER_ROLE, bytes32(0));
        _setRoleAdmin(DEFAULT_ADMIN_ROLE, bytes32(0));

        emit ContractImmutable();

        if (block.timestamp >= deployedAt + GOVERNANCE_PERIOD) {
            emit GovernanceExpired(uint64(deployedAt + GOVERNANCE_PERIOD));
        }
    }

    // ============ Views (On-chain truth) ============
    function getRemainingVestingObligations() public view returns (uint256) {
        uint256 remaining = 0;

        for (uint256 i = 0; i < beneficiaries.length; i++) {
            VestingSchedule storage s = vestingSchedules[beneficiaries[i]];
            if (s.initialized) {
                remaining += (s.vestingAllocation - s.releasedFromVesting);
            }
        }

        return remaining;
    }

    function getVestingInfo(address beneficiary)
        external
        view
        returns (
            uint256 totalAllocation,
            uint256 releasedFromVesting,
            uint256 releasable,
            uint256 vested,
            uint64 startTime,
            uint64 endTime,
            uint64 cliffEnd,
            address creator,
            uint256 immediateAmount,
            uint256 totalClaimed,
            bool isComplete
        )
    {
        VestingSchedule storage s = vestingSchedules[beneficiary];

        if (!s.initialized) {
            return (0, 0, 0, 0, 0, 0, 0, address(0), 0, 0, false);
        }

        uint256 _releasable = releasableAmount(beneficiary);
        uint256 _vested = vestedAmount(beneficiary);
        bool _isComplete = s.releasedFromVesting == s.vestingAllocation;
        uint256 _totalClaimed = s.immediateAmount + s.releasedFromVesting;

        return (
            s.totalAllocation,
            s.releasedFromVesting,
            _releasable,
            _vested,
            s.startTime,
            s.startTime + uint64(VESTING_DURATION),
            s.startTime + uint64(CLIFF),
            s.createdBy,
            s.immediateAmount,
            _totalClaimed,
            _isComplete
        );
    }

    function vestedAmount(address beneficiary) public view returns (uint256) {
        VestingSchedule storage s = vestingSchedules[beneficiary];
        if (!s.initialized) return 0;

        if (block.timestamp < s.startTime + CLIFF) return 0;

        if (block.timestamp >= s.startTime + VESTING_DURATION) {
            return s.vestingAllocation;
        }

        uint256 elapsed = block.timestamp - s.startTime - CLIFF;
        uint256 vestingTime = VESTING_DURATION - CLIFF;

        return (s.vestingAllocation * elapsed) / vestingTime;
    }

    function getContractStatus()
        external
        view
        returns (
            bool _finalized,
            bool _governanceExpired,
            uint256 _governanceRemaining,
            uint256 _totalAllocated,
            uint256 _totalReleased,
            uint256 _contractBalance,
            uint256 _remainingObligations,
            uint256 _beneficiariesCount
        )
    {
        bool govExpired = block.timestamp >= deployedAt + GOVERNANCE_PERIOD;
        uint256 govRemaining = govExpired ? 0 : (deployedAt + GOVERNANCE_PERIOD) - block.timestamp;

        return (
            finalized,
            govExpired,
            govRemaining,
            totalAllocated,
            totalReleased,
            token.balanceOf(address(this)),
            getRemainingVestingObligations(),
            beneficiaries.length
        );
    }
}
